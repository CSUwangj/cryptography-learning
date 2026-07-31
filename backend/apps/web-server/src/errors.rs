use async_graphql::{Error, ErrorExtensionValues, ErrorExtensions};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum QueryError {
    #[error("Could not find resource")]
    NotFoundError(String),

    #[error("ServerError")]
    ServerError(String),
}

impl ErrorExtensions for QueryError {
    fn extend(&self) -> Error {
        self.extend_with(|err, e: &mut ErrorExtensionValues| match err {
            QueryError::NotFoundError(resource) => e.set("code", format!("{resource} not found")),
            QueryError::ServerError(reason) => e.set("reason", reason.to_string()),
        })
    }
}
