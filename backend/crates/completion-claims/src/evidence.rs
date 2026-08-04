//! Completion Evidence value types.

use crate::completed_at::CompletedAt;
use crate::ids::{CourseRunId, KeyId, LabId, StudentId};

/// Completion Evidence protocol version emitted and accepted by this crate.
pub const EVIDENCE_VERSION: u32 = 1;

/// Validated unsigned Completion Evidence payload fields.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CompletionEvidence {
    course_run: CourseRunId,
    lab: LabId,
    student: StudentId,
    completed_at: CompletedAt,
}

impl CompletionEvidence {
    /// Construct evidence from already-validated field values.
    #[must_use]
    pub fn new(
        course_run: CourseRunId,
        lab: LabId,
        student: StudentId,
        completed_at: CompletedAt,
    ) -> Self {
        Self {
            course_run,
            lab,
            student,
            completed_at,
        }
    }

    #[must_use]
    pub fn course_run(&self) -> &CourseRunId {
        &self.course_run
    }

    #[must_use]
    pub fn lab(&self) -> &LabId {
        &self.lab
    }

    #[must_use]
    pub fn student(&self) -> &StudentId {
        &self.student
    }

    #[must_use]
    pub fn completed_at(&self) -> &CompletedAt {
        &self.completed_at
    }

    #[must_use]
    pub fn into_course_run(self) -> CourseRunId {
        self.course_run
    }

    #[must_use]
    pub fn into_lab(self) -> LabId {
        self.lab
    }

    #[must_use]
    pub fn into_student(self) -> StudentId {
        self.student
    }

    #[must_use]
    pub fn into_completed_at(self) -> CompletedAt {
        self.completed_at
    }

    #[must_use]
    pub fn into_parts(self) -> (CourseRunId, LabId, StudentId, CompletedAt) {
        (self.course_run, self.lab, self.student, self.completed_at)
    }
}

/// Opaque exact compact JWS produced only by successful signing or verification.
#[derive(Clone, Debug, Eq, PartialEq, Hash)]
pub struct SignedCompletionEvidence {
    token: String,
}

impl SignedCompletionEvidence {
    pub(crate) fn from_validated_token(token: String) -> Self {
        Self { token }
    }

    /// Borrow the exact compact token.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.token
    }

    /// Consume into the exact compact token string.
    #[must_use]
    pub fn into_string(self) -> String {
        self.token
    }
}

impl AsRef<str> for SignedCompletionEvidence {
    fn as_ref(&self) -> &str {
        self.as_str()
    }
}

/// Verified Completion Evidence retaining the original compact token.
///
/// This is the artifact callers persist; it never reconstructs the token.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedCompletionEvidence {
    token: SignedCompletionEvidence,
    key_id: KeyId,
    evidence: CompletionEvidence,
}

impl VerifiedCompletionEvidence {
    pub(crate) fn new(
        token: SignedCompletionEvidence,
        key_id: KeyId,
        evidence: CompletionEvidence,
    ) -> Self {
        Self {
            token,
            key_id,
            evidence,
        }
    }

    #[must_use]
    pub fn token(&self) -> &SignedCompletionEvidence {
        &self.token
    }

    #[must_use]
    pub fn key_id(&self) -> &KeyId {
        &self.key_id
    }

    #[must_use]
    pub fn evidence(&self) -> &CompletionEvidence {
        &self.evidence
    }

    #[must_use]
    pub fn into_token(self) -> SignedCompletionEvidence {
        self.token
    }

    #[must_use]
    pub fn into_key_id(self) -> KeyId {
        self.key_id
    }

    #[must_use]
    pub fn into_evidence(self) -> CompletionEvidence {
        self.evidence
    }

    #[must_use]
    pub fn into_parts(self) -> (SignedCompletionEvidence, KeyId, CompletionEvidence) {
        (self.token, self.key_id, self.evidence)
    }
}
