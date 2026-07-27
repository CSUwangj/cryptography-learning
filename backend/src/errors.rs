use async_graphql::{ErrorExtensions, FieldError};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum QueryError {
    #[error("Could not find resource")]
    NotFoundError(String),

    #[error("ServerError")]
    ServerError(String),
}

impl ErrorExtensions for QueryError {
    // lets define our base extensions
    fn extend(&self) -> FieldError {
        self.extend_with(|err, e| match err {
            QueryError::NotFoundError(resource) => e.set("code", format!("{} not found", resource)),
            QueryError::ServerError(reason) => e.set("reason", reason.to_string()),
        })
    }
}
