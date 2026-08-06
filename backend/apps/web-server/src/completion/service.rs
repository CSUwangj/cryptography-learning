//! Verify, authorize, and store Completion Claims.

use std::collections::HashSet;
use std::str::FromStr;
use std::sync::Arc;

use completion_claims::{CourseRunId, LabId, verify_compact};
use thiserror::Error;
use tracing::info;

use super::clock::Clock;
use super::config::CompletionPolicy;
use super::store::{ClaimStore, InsertOutcome, StudentBoardRow};

/// Enabled Completion module handle.
#[derive(Clone)]
pub struct CompletionService {
    policy: CompletionPolicy,
    known_labs: HashSet<LabId>,
    store: ClaimStore,
    clock: Arc<dyn Clock>,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum IngestError {
    #[error("invalid evidence")]
    InvalidEvidence,

    #[error("course run mismatch")]
    CourseRunMismatch,

    #[error("unknown lab")]
    UnknownLab,

    #[error("storage unavailable")]
    StorageUnavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IngestOutcome {
    Stored,
    AlreadyExists,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum BoardError {
    #[error("invalid course run id")]
    InvalidCourseRunId,

    #[error("completion storage unavailable")]
    Unavailable,
}

impl CompletionService {
    pub fn new(
        policy: CompletionPolicy,
        known_labs: HashSet<LabId>,
        store: ClaimStore,
        clock: Arc<dyn Clock>,
    ) -> Self {
        Self {
            policy,
            known_labs,
            store,
            clock,
        }
    }

    pub fn configured_course_run(&self) -> &CourseRunId {
        self.policy.course_run()
    }

    pub fn store(&self) -> &ClaimStore {
        &self.store
    }

    pub async fn ingest_compact(&self, token: &str) -> Result<IngestOutcome, IngestError> {
        let verified =
            verify_compact(token, |kid| self.policy.verifying_key(kid)).map_err(|err| {
                info!(
                    rejection = "invalid_evidence",
                    category = %format!("{err:?}"),
                    "completion evidence rejected"
                );
                IngestError::InvalidEvidence
            })?;

        let evidence = verified.evidence();
        if evidence.course_run() != self.policy.course_run() {
            info!(
                rejection = "course_run_mismatch",
                configured = %self.policy.course_run(),
                signed = %evidence.course_run(),
                "completion evidence rejected"
            );
            return Err(IngestError::CourseRunMismatch);
        }
        if !self.known_labs.contains(evidence.lab()) {
            info!(
                rejection = "unknown_lab",
                lab = %evidence.lab(),
                "completion evidence rejected"
            );
            return Err(IngestError::UnknownLab);
        }

        let received_at = self.clock.unix_seconds();
        match self.store.insert_first(&verified, received_at).await {
            Ok(InsertOutcome::Stored) => Ok(IngestOutcome::Stored),
            Ok(InsertOutcome::AlreadyExists) => Ok(IngestOutcome::AlreadyExists),
            Err(_) => Err(IngestError::StorageUnavailable),
        }
    }

    pub async fn board(
        &self,
        course_run_id: Option<&str>,
    ) -> Result<(CourseRunId, Vec<StudentBoardRow>), BoardError> {
        let course_run = match course_run_id {
            None => self.policy.course_run().clone(),
            Some(raw) => CourseRunId::from_str(raw).map_err(|_| BoardError::InvalidCourseRunId)?,
        };
        let students = self
            .store
            .board_for_course_run(&course_run)
            .await
            .map_err(|_| BoardError::Unavailable)?;
        Ok((course_run, students))
    }
}
