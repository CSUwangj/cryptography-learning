//! Optional Completion Claims module: policy, store, and ingestion.

mod clock;
mod config;
mod http;
mod service;
mod store;

#[cfg(test)]
mod integration_tests;

#[cfg(test)]
pub(crate) use clock::FixedClock;
pub(crate) use clock::{Clock, SystemClock};
pub(crate) use config::{CompletionConfigError, CompletionPolicy};
pub(crate) use http::post_completion_claim;
pub(crate) use service::{BoardError, CompletionService, IngestError, IngestOutcome};
pub(crate) use store::{ClaimStore, ClaimStoreError};
