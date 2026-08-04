//! Stable verification errors for compact Completion Evidence.

/// Failures produced by [`crate::verify_compact`].
///
/// Variant identity is stable. Display wording and wrapped library errors are
/// not part of the protocol contract.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum VerificationError {
    #[error("malformed compact Completion Evidence")]
    MalformedCompact,
    #[error("malformed protected header")]
    MalformedProtectedHeader,
    #[error("unsupported JWS algorithm")]
    UnsupportedAlgorithm,
    #[error("invalid key ID")]
    InvalidKeyId,
    #[error("unknown key ID")]
    UnknownKey,
    #[error("malformed signature")]
    MalformedSignature,
    #[error("invalid signature")]
    InvalidSignature,
    #[error("malformed payload")]
    MalformedPayload,
    #[error("unsupported evidence version")]
    UnsupportedVersion,
    #[error("invalid course run ID")]
    InvalidCourseRunId,
    #[error("invalid lab ID")]
    InvalidLabId,
    #[error("invalid student ID")]
    InvalidStudentId,
    #[error("invalid completed_at timestamp")]
    InvalidCompletedAt,
}
