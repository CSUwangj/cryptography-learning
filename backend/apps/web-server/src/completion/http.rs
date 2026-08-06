//! HTTP ingestion for Completion Claims.

use axum::Json;
use axum::body::Bytes;
use axum::extract::{FromRequest, Request, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use http_body_util::{BodyExt, Limited};
use serde_json::json;

use crate::completion::{CompletionService, IngestError, IngestOutcome};

const MAX_EVIDENCE_BYTES: usize = 2048;
const JOSE_MEDIA_TYPE: &str = "application/jose";

pub(crate) struct JoseEvidenceBody(Bytes);

pub(crate) enum JoseBodyRejection {
    UnsupportedMediaType,
    TooLarge,
}

impl IntoResponse for JoseBodyRejection {
    fn into_response(self) -> Response {
        match self {
            Self::UnsupportedMediaType => (
                StatusCode::UNSUPPORTED_MEDIA_TYPE,
                Json(json!({"error":"unsupported_media_type"})),
            )
                .into_response(),
            Self::TooLarge => (
                StatusCode::PAYLOAD_TOO_LARGE,
                Json(json!({"error":"evidence_too_large"})),
            )
                .into_response(),
        }
    }
}

impl<S> FromRequest<S> for JoseEvidenceBody
where
    S: Send + Sync,
{
    type Rejection = JoseBodyRejection;

    async fn from_request(req: Request, _state: &S) -> Result<Self, Self::Rejection> {
        let content_type = req
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::trim);

        let is_jose = content_type.is_some_and(|value| value.eq_ignore_ascii_case(JOSE_MEDIA_TYPE));
        if !is_jose {
            return Err(JoseBodyRejection::UnsupportedMediaType);
        }

        if let Some(length) = req
            .headers()
            .get(header::CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<usize>().ok())
            && length > MAX_EVIDENCE_BYTES
        {
            return Err(JoseBodyRejection::TooLarge);
        }

        let body = req.into_body();
        let collected = Limited::new(body, MAX_EVIDENCE_BYTES)
            .collect()
            .await
            .map_err(|_| JoseBodyRejection::TooLarge)?;
        Ok(Self(collected.to_bytes()))
    }
}

pub(crate) async fn post_completion_claim(
    State(service): State<CompletionService>,
    JoseEvidenceBody(body): JoseEvidenceBody,
) -> impl IntoResponse {
    let Ok(token) = std::str::from_utf8(&body) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"invalid_evidence"})),
        )
            .into_response();
    };

    match service.ingest_compact(token).await {
        Ok(IngestOutcome::Stored) => {
            (StatusCode::CREATED, Json(json!({"status":"stored"}))).into_response()
        }
        Ok(IngestOutcome::AlreadyExists) => {
            (StatusCode::OK, Json(json!({"status":"already_exists"}))).into_response()
        }
        Err(IngestError::InvalidEvidence) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"invalid_evidence"})),
        )
            .into_response(),
        Err(IngestError::CourseRunMismatch) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({"error":"course_run_mismatch"})),
        )
            .into_response(),
        Err(IngestError::UnknownLab) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({"error":"unknown_lab"})),
        )
            .into_response(),
        Err(IngestError::StorageUnavailable) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"error":"storage_unavailable"})),
        )
            .into_response(),
    }
}
