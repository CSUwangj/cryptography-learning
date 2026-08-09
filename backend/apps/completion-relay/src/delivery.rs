//! Synchronous backend delivery of signed Completion Evidence.
//!
//! On inconclusive delivery the relay emits one `completion_delivery_failed` JSON log
//! containing the exact compact evidence. Manual replay:
//!
//! ```sh
//! curl --fail-with-body \
//!   -H 'Content-Type: application/jose' \
//!   --data-binary 'COMPACT_EVIDENCE_FROM_LOG' \
//!   'BACKEND_ENDPOINT'
//! ```
//!
//! Backend `stored` or `already_exists` completes recovery. Logs have no durability
//! guarantee; repeating the completion action is the fallback.

use completion_claims::{LabId, SignedCompletionEvidence, StudentId};
use reqwest::{Client, StatusCode};
use serde::Deserialize;
use tracing::error;

/// Bounded failure categories for `completion_delivery_failed` events.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailureCategory {
    ConnectionFailed,
    Timeout,
    BackendRejected,
    UnexpectedResponse,
}

impl FailureCategory {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ConnectionFailed => "connection_failed",
            Self::Timeout => "timeout",
            Self::BackendRejected => "backend_rejected",
            Self::UnexpectedResponse => "unexpected_response",
        }
    }
}

const RECOGNIZED_BACKEND_ERRORS: &[&str] = &[
    "invalid_evidence",
    "course_run_mismatch",
    "unknown_lab",
    "storage_unavailable",
    "evidence_too_large",
    "unsupported_media_type",
];

#[derive(Debug, Deserialize)]
struct BackendSuccessBody {
    status: String,
}

#[derive(Debug, Deserialize)]
struct BackendErrorBody {
    error: String,
}

/// Build the single long-lived backend client: redirects disabled, 10s total timeout.
#[must_use]
pub fn build_client() -> Client {
    Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .expect("reqwest client with default TLS and pooling")
}

/// POST compact evidence once to the configured backend endpoint.
///
/// Returns `Ok(())` only for exact `201 {"status":"stored"}` or
/// `200 {"status":"already_exists"}`.
pub async fn deliver_once(
    client: &Client,
    backend_endpoint: &str,
    evidence: &SignedCompletionEvidence,
    lab: &LabId,
    student: &StudentId,
) -> Result<(), FailureCategory> {
    let response = match client
        .post(backend_endpoint)
        .header(reqwest::header::CONTENT_TYPE, "application/jose")
        .body(evidence.as_str().to_owned())
        .send()
        .await
    {
        Ok(response) => response,
        Err(err) => {
            let category = if err.is_timeout() {
                FailureCategory::Timeout
            } else {
                FailureCategory::ConnectionFailed
            };
            log_failure(lab, student, evidence, category, None, None);
            return Err(category);
        }
    };

    let status = response.status();
    let body_bytes = match response.bytes().await {
        Ok(bytes) => bytes,
        Err(_) => {
            log_failure(
                lab,
                student,
                evidence,
                FailureCategory::UnexpectedResponse,
                Some(status.as_u16()),
                None,
            );
            return Err(FailureCategory::UnexpectedResponse);
        }
    };

    if is_success(status, &body_bytes) {
        return Ok(());
    }

    let backend_error = recognized_error_code(&body_bytes);
    let category = if status.is_client_error() || status.is_server_error() {
        FailureCategory::BackendRejected
    } else {
        FailureCategory::UnexpectedResponse
    };
    log_failure(
        lab,
        student,
        evidence,
        category,
        Some(status.as_u16()),
        backend_error,
    );
    Err(category)
}

fn is_success(status: StatusCode, body: &[u8]) -> bool {
    let Ok(parsed) = serde_json::from_slice::<BackendSuccessBody>(body) else {
        return false;
    };
    matches!(
        (status, parsed.status.as_str()),
        (StatusCode::CREATED, "stored") | (StatusCode::OK, "already_exists")
    )
}

fn recognized_error_code(body: &[u8]) -> Option<&str> {
    let parsed: BackendErrorBody = serde_json::from_slice(body).ok()?;
    RECOGNIZED_BACKEND_ERRORS
        .iter()
        .copied()
        .find(|&code| code == parsed.error)
}

fn log_failure(
    lab: &LabId,
    student: &StudentId,
    evidence: &SignedCompletionEvidence,
    category: FailureCategory,
    backend_status: Option<u16>,
    backend_error: Option<&str>,
) {
    error!(
        event = "completion_delivery_failed",
        lab = lab.as_str(),
        student = student.as_str(),
        evidence = evidence.as_str(),
        failure_category = category.as_str(),
        backend_status,
        backend_error,
        "completion delivery failed"
    );
}
