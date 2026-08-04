#![doc = include_str!("../README.md")]
#![forbid(unsafe_code)]

mod compact;
mod completed_at;
mod error;
mod evidence;
mod ids;

pub use compact::{sign_compact, verify_compact};
pub use completed_at::{CompletedAt, CompletedAtError};
pub use error::VerificationError;
pub use evidence::{
    CompletionEvidence, EVIDENCE_VERSION, SignedCompletionEvidence, VerifiedCompletionEvidence,
};
pub use ids::{
    CourseRunId, CourseRunIdError, KeyId, KeyIdError, LabId, LabIdError, StudentId, StudentIdError,
};
