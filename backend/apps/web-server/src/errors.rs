use async_graphql::{Error, ErrorExtensionValues, ErrorExtensions};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum QueryError {
    #[error("Could not find resource")]
    NotFoundError(String),

    #[error("ServerError")]
    ServerError(String),

    #[error("Completion is not configured")]
    CompletionNotConfigured,

    #[error("Invalid Course Run ID")]
    InvalidCourseRunId,

    #[error("Completion storage is unavailable")]
    CompletionUnavailable,
}

impl ErrorExtensions for QueryError {
    fn extend(&self) -> Error {
        self.extend_with(|err, e: &mut ErrorExtensionValues| match err {
            QueryError::NotFoundError(resource) => e.set("code", format!("{resource} not found")),
            QueryError::ServerError(reason) => e.set("reason", reason.to_string()),
            QueryError::CompletionNotConfigured => e.set("code", "COMPLETION_NOT_CONFIGURED"),
            QueryError::InvalidCourseRunId => e.set("code", "INVALID_COURSE_RUN_ID"),
            QueryError::CompletionUnavailable => e.set("code", "COMPLETION_UNAVAILABLE"),
        })
    }
}
