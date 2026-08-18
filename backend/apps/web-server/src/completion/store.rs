//! Durable SQLite store for immutable Completion Claims.

use std::path::Path;

use completion_claims::{CourseRunId, LabId, StudentId, VerifiedCompletionEvidence};
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{ConnectOptions, Row, SqlitePool};
use thiserror::Error;

/// Outcome of an atomic first-claim insert attempt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InsertOutcome {
    Stored,
    AlreadyExists,
}

/// Private audit fields retained with the first winning claim.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClaimAuditFields {
    pub completed_at: String,
    pub received_at: i64,
    pub key_id: String,
    pub signed_evidence: String,
}

/// One student's completed Labs within a Course Run for the board read model.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StudentBoardRow {
    pub student_id: String,
    pub completions: Vec<CompletionRecord>,
}

/// Public fields for one immutable Completion Claim.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompletionRecord {
    pub lab_id: String,
    pub completed_at: String,
}

#[derive(Debug, Clone)]
pub struct ClaimStore {
    pool: SqlitePool,
}

#[derive(Debug, Error)]
pub enum ClaimStoreError {
    #[error("Completion database parent directory is missing: {0}")]
    ParentMissing(String),

    #[error("failed to open Completion database: {0}")]
    Open(String),

    #[error("failed to migrate Completion database: {0}")]
    Migrate(String),

    #[error("Completion claim storage unavailable: {0}")]
    Storage(String),
}

impl ClaimStore {
    /// Open (or create) the SQLite database, configure busy timeout, and run migrations.
    pub async fn open(path: &Path) -> Result<Self, ClaimStoreError> {
        if let Some(parent) = path.parent()
            && !parent.as_os_str().is_empty()
            && !parent.exists()
        {
            return Err(ClaimStoreError::ParentMissing(parent.display().to_string()));
        }

        let options = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal)
            .synchronous(SqliteSynchronous::Full)
            .busy_timeout(std::time::Duration::from_secs(5))
            .disable_statement_logging();

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await
            .map_err(|err| ClaimStoreError::Open(err.to_string()))?;

        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .map_err(|err| ClaimStoreError::Migrate(err.to_string()))?;

        Ok(Self { pool })
    }

    /// Close the pool so subsequent operations fail (storage-failure tests).
    #[cfg(test)]
    pub async fn close_for_test(&self) {
        self.pool.close().await;
    }

    /// Atomically insert the first claim for `(course_run, student_id, lab_id)`.
    pub async fn insert_first(
        &self,
        verified: &VerifiedCompletionEvidence,
        received_at: i64,
    ) -> Result<InsertOutcome, ClaimStoreError> {
        let evidence = verified.evidence();
        let result = sqlx::query(
            r#"
            INSERT INTO completion_claims (
                course_run, student_id, lab_id, completed_at, received_at, key_id, signed_evidence
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(course_run, student_id, lab_id) DO NOTHING
            "#,
        )
        .bind(evidence.course_run().as_str())
        .bind(evidence.student().as_str())
        .bind(evidence.lab().as_str())
        .bind(evidence.completed_at().to_string())
        .bind(received_at)
        .bind(verified.key_id().as_str())
        .bind(verified.token().as_str())
        .execute(&self.pool)
        .await
        .map_err(|err| ClaimStoreError::Storage(err.to_string()))?;

        if result.rows_affected() == 1 {
            Ok(InsertOutcome::Stored)
        } else {
            Ok(InsertOutcome::AlreadyExists)
        }
    }

    /// Read private audit fields for the durable-SQLite immutability seam.
    pub async fn get_audit(
        &self,
        course_run: &CourseRunId,
        student_id: &StudentId,
        lab_id: &LabId,
    ) -> Result<Option<ClaimAuditFields>, ClaimStoreError> {
        let row = sqlx::query(
            r#"
            SELECT completed_at, received_at, key_id, signed_evidence
            FROM completion_claims
            WHERE course_run = ? AND student_id = ? AND lab_id = ?
            "#,
        )
        .bind(course_run.as_str())
        .bind(student_id.as_str())
        .bind(lab_id.as_str())
        .fetch_optional(&self.pool)
        .await
        .map_err(|err| ClaimStoreError::Storage(err.to_string()))?;

        Ok(row.map(|row| ClaimAuditFields {
            completed_at: row.get("completed_at"),
            received_at: row.get("received_at"),
            key_id: row.get("key_id"),
            signed_evidence: row.get("signed_evidence"),
        }))
    }

    /// Board rows for one Course Run, students and Labs sorted lexicographically.
    pub async fn board_for_course_run(
        &self,
        course_run: &CourseRunId,
    ) -> Result<Vec<StudentBoardRow>, ClaimStoreError> {
        let rows = sqlx::query(
            r#"
            SELECT student_id, lab_id, completed_at
            FROM completion_claims
            WHERE course_run = ?
            ORDER BY student_id ASC, lab_id ASC
            "#,
        )
        .bind(course_run.as_str())
        .fetch_all(&self.pool)
        .await
        .map_err(|err| ClaimStoreError::Storage(err.to_string()))?;

        let mut students: Vec<StudentBoardRow> = Vec::new();
        for row in rows {
            let student_id: String = row.get("student_id");
            let lab_id: String = row.get("lab_id");
            let completed_at: String = row.get("completed_at");
            let completion = CompletionRecord {
                lab_id,
                completed_at,
            };
            match students.last_mut() {
                Some(current) if current.student_id == student_id => {
                    current.completions.push(completion);
                }
                _ => students.push(StudentBoardRow {
                    student_id,
                    completions: vec![completion],
                }),
            }
        }
        Ok(students)
    }
}

#[cfg(test)]
pub(crate) mod test_support {
    use super::*;
    use completion_claims::{
        CompletedAt, CompletionEvidence, CourseRunId, KeyId, LabId, StudentId, sign_compact,
    };
    use ed25519_dalek::SigningKey;
    use std::str::FromStr;

    pub fn signing_key(seed_byte: u8) -> SigningKey {
        SigningKey::from_bytes(&[seed_byte; 32])
    }

    pub fn verified_evidence(
        course_run: &str,
        lab: &str,
        student: &str,
        completed_at: &str,
        kid: &str,
        signing_key: &SigningKey,
    ) -> VerifiedCompletionEvidence {
        let evidence = CompletionEvidence::new(
            CourseRunId::from_str(course_run).unwrap(),
            LabId::from_str(lab).unwrap(),
            StudentId::from_str(student).unwrap(),
            CompletedAt::from_str(completed_at).unwrap(),
        );
        let key_id = KeyId::from_str(kid).unwrap();
        let signed = sign_compact(&evidence, &key_id, signing_key);
        let verifying = signing_key.verifying_key();
        completion_claims::verify_compact(signed.as_str(), |_| Some(verifying)).unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::{signing_key, verified_evidence};
    use super::*;
    use std::str::FromStr;

    #[tokio::test]
    async fn open_creates_database_and_migrates() {
        let tmp = tempfile::tempdir().unwrap();
        let db = tmp.path().join("claims.sqlite");
        let store = ClaimStore::open(&db).await.expect("open");
        assert!(db.is_file());
        let _ = store;
    }

    #[tokio::test]
    async fn open_fails_when_parent_directory_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let db = tmp.path().join("missing").join("claims.sqlite");
        let err = ClaimStore::open(&db).await.expect_err("parent missing");
        assert!(matches!(err, ClaimStoreError::ParentMissing(_)));
    }

    #[tokio::test]
    async fn first_claim_wins_and_audit_fields_are_immutable() {
        let tmp = tempfile::tempdir().unwrap();
        let store = ClaimStore::open(&tmp.path().join("claims.sqlite"))
            .await
            .unwrap();
        let key_a = signing_key(1);
        let key_b = signing_key(2);

        let first = verified_evidence(
            "2026-autumn",
            "affine",
            "20260001",
            "2026-10-12T08:15:30Z",
            "lab-host-a-2026-01",
            &key_a,
        );
        assert_eq!(
            store.insert_first(&first, 1_700_000_000).await.unwrap(),
            InsertOutcome::Stored
        );

        let second = verified_evidence(
            "2026-autumn",
            "affine",
            "20260001",
            "2026-10-13T09:00:00Z",
            "lab-host-b-2026-01",
            &key_b,
        );
        assert_eq!(
            store.insert_first(&second, 1_700_000_100).await.unwrap(),
            InsertOutcome::AlreadyExists
        );

        let audit = store
            .get_audit(
                &CourseRunId::from_str("2026-autumn").unwrap(),
                &StudentId::from_str("20260001").unwrap(),
                &LabId::from_str("affine").unwrap(),
            )
            .await
            .unwrap()
            .expect("stored claim");

        assert_eq!(audit.completed_at, "2026-10-12T08:15:30Z");
        assert_eq!(audit.received_at, 1_700_000_000);
        assert_eq!(audit.key_id, "lab-host-a-2026-01");
        assert_eq!(audit.signed_evidence, first.token().as_str());
        assert_ne!(audit.signed_evidence, second.token().as_str());
    }

    #[tokio::test]
    async fn claims_persist_across_reopen() {
        let tmp = tempfile::tempdir().unwrap();
        let db = tmp.path().join("claims.sqlite");
        let key = signing_key(3);
        let evidence = verified_evidence(
            "2026-autumn",
            "affine",
            "20260002",
            "2026-10-12T08:15:30Z",
            "lab-host-a-2026-01",
            &key,
        );

        {
            let store = ClaimStore::open(&db).await.unwrap();
            store.insert_first(&evidence, 42).await.unwrap();
        }

        let store = ClaimStore::open(&db).await.unwrap();
        let audit = store
            .get_audit(
                &CourseRunId::from_str("2026-autumn").unwrap(),
                &StudentId::from_str("20260002").unwrap(),
                &LabId::from_str("affine").unwrap(),
            )
            .await
            .unwrap()
            .expect("persisted");
        assert_eq!(audit.received_at, 42);
        assert_eq!(audit.signed_evidence, evidence.token().as_str());
    }
}
