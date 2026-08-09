//! Loopback Challenge intake, health, and graceful shutdown.

use std::future::Future;
use std::str::FromStr;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::Json;
use axum::Router;
use axum::extract::rejection::JsonRejection;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use completion_claims::{CompletedAt, CompletionEvidence, LabId, StudentId, sign_compact};
use serde::Deserialize;
use serde_json::json;
use tokio::net::TcpListener;

use crate::config::RelayConfiguration;
use crate::delivery::{self, build_client};

const MAX_COMPLETION_BYTES: usize = 4096;

#[derive(Clone)]
struct AppState {
    config: Arc<RelayConfiguration>,
    client: reqwest::Client,
}

/// Serve Challenge intake until `shutdown` completes.
pub async fn serve_until_shutdown<F>(
    config: RelayConfiguration,
    listener: TcpListener,
    shutdown: F,
) -> std::io::Result<()>
where
    F: Future<Output = ()> + Send + 'static,
{
    let state = AppState {
        config: Arc::new(config),
        client: build_client(),
    };
    let app = router(state);
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown)
        .await
}

fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route(
            "/api/completions",
            post(post_completion).layer(DefaultBodyLimit::max(MAX_COMPLETION_BYTES)),
        )
        .with_state(state)
}

async fn health() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({"status": "ok"})))
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct CompletionRequest {
    lab: String,
    student: String,
}

async fn post_completion(
    State(state): State<AppState>,
    body: Result<Json<CompletionRequest>, JsonRejection>,
) -> Response {
    let Json(request) = match body {
        Ok(json) => json,
        Err(rejection) => return map_json_rejection(rejection),
    };

    let lab = match LabId::from_str(&request.lab) {
        Ok(lab) => lab,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "invalid_request"})),
            )
                .into_response();
        }
    };
    let student = match StudentId::from_user_input(&request.student) {
        Ok(student) => student,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "invalid_request"})),
            )
                .into_response();
        }
    };

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock after unix epoch")
        .as_secs();
    let completed_at = CompletedAt::from_unix_seconds(i64::try_from(now).expect("time fits i64"))
        .expect("current UTC second is a valid CompletedAt");

    let evidence = CompletionEvidence::new(
        state.config.course_run().clone(),
        lab.clone(),
        student.clone(),
        completed_at,
    );
    let signed = sign_compact(&evidence, state.config.kid(), state.config.signing_key());

    match delivery::deliver_once(
        &state.client,
        state.config.backend_endpoint(),
        &signed,
        &lab,
        &student,
    )
    .await
    {
        Ok(()) => (StatusCode::OK, Json(json!({"status": "recorded"}))).into_response(),
        Err(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"error": "delivery_failed"})),
        )
            .into_response(),
    }
}

fn map_json_rejection(rejection: JsonRejection) -> Response {
    if matches!(rejection, JsonRejection::MissingJsonContentType(_)) {
        return (
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            Json(json!({"error": "unsupported_media_type"})),
        )
            .into_response();
    }
    if rejection.status() == StatusCode::PAYLOAD_TOO_LARGE {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({"error": "request_too_large"})),
        )
            .into_response();
    }
    (
        StatusCode::BAD_REQUEST,
        Json(json!({"error": "invalid_request"})),
    )
        .into_response()
}

/// Production JSON subscriber: fixed INFO filter, no spans, caller-supplied writer.
///
/// `init_tracing` installs this on stderr. Tests install the same subscriber with a
/// capture writer via [`tracing::subscriber::set_default`].
pub fn build_json_subscriber<W>(writer: W) -> impl tracing::Subscriber + Send + Sync + 'static
where
    W: for<'a> tracing_subscriber::fmt::MakeWriter<'a> + Send + Sync + 'static,
{
    use tracing_subscriber::EnvFilter;
    use tracing_subscriber::fmt;

    fmt()
        .json()
        .with_writer(writer)
        .with_env_filter(EnvFilter::new("info"))
        .with_current_span(false)
        .with_span_list(false)
        .finish()
}

/// Install JSON tracing to stderr at fixed INFO verbosity.
pub fn init_tracing() {
    use tracing_subscriber::util::SubscriberInitExt;

    let _ = build_json_subscriber(std::io::stderr).try_init();
}
