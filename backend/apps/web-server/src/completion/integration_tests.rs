//! Completion-enabled HTTP and GraphQL integration coverage.

use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::str::FromStr;
use std::sync::Arc;

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use completion_claims::{
    CompletedAt, CompletionEvidence, CourseRunId, KeyId, LabId, StudentId, sign_compact,
};
use ed25519_dalek::SigningKey;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

use crate::bootstrap::{Application, ProcessIdentity};
use crate::completion::{ClaimStore, FixedClock, SystemClock};
use crate::http::app_router;
use crate::opts::CompletionModulePaths;
use crate::practice_catalog::{
    InMemoryLabContentSource, RawConfiguration, RawLab, RawLabCategory, RawPractice, RawResource,
    RawTranslation,
};

const KID: &str = "lab-host-a-2026-01";
const COURSE_RUN: &str = "2026-autumn";

fn translation(lang: &str, text: &str) -> RawTranslation {
    RawTranslation {
        lang: lang.to_string(),
        text: text.to_string(),
    }
}

fn resource(lang: &str, name: &str, path: &str) -> RawResource {
    RawResource {
        lang: lang.to_string(),
        name: name.to_string(),
        resource: path.to_string(),
    }
}

fn signing_key() -> SigningKey {
    SigningKey::from_bytes(&[7u8; 32])
}

fn public_key_hex() -> String {
    hex_encode(&signing_key().verifying_key().to_bytes())
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02X}")).collect()
}

fn write_spa(root: &Path) {
    fs::create_dir_all(root).unwrap();
    fs::write(
        root.join("index.html"),
        "<!doctype html><html><body><div id=\"root\"></div></body></html>",
    )
    .unwrap();
}

fn write_completion_config(path: &Path, course_run: &str, pubkey_hex: &str) {
    fs::write(
        path,
        format!(
            r#"CompletionConfiguration(
              course_run: "{course_run}",
              trusted_keys: [
                (kid: "{KID}", public_key_hex: "{pubkey_hex}"),
              ],
            )"#
        ),
    )
    .unwrap();
}

fn practice_raw() -> RawConfiguration {
    RawConfiguration {
        schema_version: RawConfiguration::SUPPORTED_SCHEMA_VERSION,
        practice: RawPractice {
            lab_categories: vec![RawLabCategory {
                id: "classical".into(),
                name: vec![translation("en-US", "Classical")],
                labs: vec![
                    RawLab {
                        id: "affine".into(),
                        ws_endpoints: vec![],
                        tcp_endpoints: vec![],
                        resources: vec![resource("en-US", "Affine", "affine.md")],
                    },
                    RawLab {
                        id: "shift".into(),
                        ws_endpoints: vec![],
                        tcp_endpoints: vec![],
                        resources: vec![resource("en-US", "Shift", "shift.md")],
                    },
                ],
            }],
        },
    }
}

async fn completion_app(
    tmp: &Path,
    clock: Arc<dyn crate::completion::Clock>,
) -> (Application, std::path::PathBuf) {
    let static_root = tmp.join("www");
    write_spa(&static_root);
    let config = tmp.join("completion.ron");
    write_completion_config(&config, COURSE_RUN, &public_key_hex());
    let database = tmp.join("claims.sqlite");
    let mut files = HashMap::new();
    files.insert("affine.md".into(), "a".into());
    files.insert("shift.md".into(), "s".into());
    let source = InMemoryLabContentSource::new(files);
    let app = Application::from_raw(
        practice_raw(),
        &static_root,
        &source,
        ProcessIdentity::unknown(),
        Some(&CompletionModulePaths {
            config,
            database: database.clone(),
        }),
        clock,
    )
    .await
    .expect("completion bootstrap");
    (app, database)
}

fn sign_token(course_run: &str, lab: &str, student: &str, completed_at: &str) -> String {
    let evidence = CompletionEvidence::new(
        CourseRunId::from_str(course_run).unwrap(),
        LabId::from_str(lab).unwrap(),
        StudentId::from_str(student).unwrap(),
        CompletedAt::from_str(completed_at).unwrap(),
    );
    let kid = KeyId::from_str(KID).unwrap();
    sign_compact(&evidence, &kid, &signing_key()).into_string()
}

async fn body_json(response: axum::response::Response) -> Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

async fn post_claim(
    router: axum::Router,
    token: &str,
    content_type: &str,
) -> axum::response::Response {
    router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/completion-claims")
                .header(header::CONTENT_TYPE, content_type)
                .body(Body::from(token.to_owned()))
                .unwrap(),
        )
        .await
        .unwrap()
}

async fn graphql(router: axum::Router, query: &str, variables: Value) -> Value {
    let response = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/query")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    json!({"query": query, "variables": variables}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    body_json(response).await
}

#[tokio::test]
async fn rejects_wrong_media_type_and_oversized_body() {
    let tmp = tempfile::tempdir().unwrap();
    let (app, _) = completion_app(tmp.path(), Arc::new(SystemClock)).await;
    let router = app_router(app);

    let wrong_type = post_claim(router.clone(), "abc", "application/json").await;
    assert_eq!(wrong_type.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);
    assert_eq!(
        body_json(wrong_type).await,
        json!({"error":"unsupported_media_type"})
    );

    let with_params = post_claim(
        router.clone(),
        &sign_token(COURSE_RUN, "affine", "20260076", "2026-10-12T08:15:30Z"),
        "application/jose; charset=utf-8",
    )
    .await;
    assert_eq!(with_params.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);
    assert_eq!(
        body_json(with_params).await,
        json!({"error":"unsupported_media_type"})
    );

    let case_insensitive = post_claim(
        router.clone(),
        &sign_token(COURSE_RUN, "affine", "20260077", "2026-10-12T08:15:30Z"),
        "Application/JOSE",
    )
    .await;
    assert_eq!(case_insensitive.status(), StatusCode::CREATED);

    let huge = "a".repeat(2049);
    let too_large = post_claim(router, &huge, "application/jose").await;
    assert_eq!(too_large.status(), StatusCode::PAYLOAD_TOO_LARGE);
    assert_eq!(
        body_json(too_large).await,
        json!({"error":"evidence_too_large"})
    );
}

#[tokio::test]
async fn rejects_invalid_evidence_course_run_mismatch_and_unknown_lab() {
    let tmp = tempfile::tempdir().unwrap();
    let (app, _) = completion_app(tmp.path(), Arc::new(SystemClock)).await;
    let router = app_router(app);

    let malformed = post_claim(router.clone(), "not-a-jws", "application/jose").await;
    assert_eq!(malformed.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        body_json(malformed).await,
        json!({"error":"invalid_evidence"})
    );

    let mismatch = sign_token("2025-spring", "affine", "20260001", "2026-10-12T08:15:30Z");
    let mismatch_resp = post_claim(router.clone(), &mismatch, "application/jose").await;
    assert_eq!(mismatch_resp.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        body_json(mismatch_resp).await,
        json!({"error":"course_run_mismatch"})
    );

    let unknown = sign_token(
        COURSE_RUN,
        "missing-lab",
        "20260001",
        "2026-10-12T08:15:30Z",
    );
    let unknown_resp = post_claim(router, &unknown, "application/jose").await;
    assert_eq!(unknown_resp.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        body_json(unknown_resp).await,
        json!({"error":"unknown_lab"})
    );
}

#[tokio::test]
async fn stores_first_claim_repeats_and_preserves_audit_across_restart() {
    let tmp = tempfile::tempdir().unwrap();
    let clock = Arc::new(FixedClock::new(1_700_000_000));
    let (app, db) = completion_app(tmp.path(), clock.clone()).await;

    let first = sign_token(COURSE_RUN, "affine", "20260001", "2026-10-12T08:15:30Z");
    {
        let router = app_router(app);
        let stored = post_claim(router.clone(), &first, "application/jose").await;
        assert_eq!(stored.status(), StatusCode::CREATED);
        assert_eq!(body_json(stored).await, json!({"status":"stored"}));

        let identical = post_claim(router, &first, "application/jose").await;
        assert_eq!(identical.status(), StatusCode::OK);
        assert_eq!(
            body_json(identical).await,
            json!({"status":"already_exists"})
        );
    }

    clock.set(1_700_000_999);
    let (app_after_restart, _) = completion_app(tmp.path(), clock).await;
    assert!(
        db.is_file(),
        "durable database must survive process restart"
    );
    let audit = app_after_restart
        .completion()
        .expect("completion enabled")
        .store()
        .get_audit(
            &CourseRunId::from_str(COURSE_RUN).unwrap(),
            &StudentId::from_str("20260001").unwrap(),
            &LabId::from_str("affine").unwrap(),
        )
        .await
        .unwrap()
        .unwrap();
    assert_eq!(audit.received_at, 1_700_000_000);
    assert_eq!(audit.completed_at, "2026-10-12T08:15:30Z");
    assert_eq!(audit.signed_evidence, first);

    let router = app_router(app_after_restart);
    let different = sign_token(COURSE_RUN, "affine", "20260001", "2026-10-13T09:00:00Z");
    let again = post_claim(router.clone(), &different, "application/jose").await;
    assert_eq!(again.status(), StatusCode::OK);
    assert_eq!(body_json(again).await, json!({"status":"already_exists"}));

    let board = graphql(
        router,
        "query { completionBoard { courseRunId students { studentId completedLabIds } } }",
        json!({}),
    )
    .await;
    assert_eq!(
        board["data"]["completionBoard"]["students"],
        json!([{"studentId":"20260001","completedLabIds":["affine"]}])
    );
}

#[tokio::test]
async fn concurrent_duplicate_claims_yield_one_stored() {
    let tmp = tempfile::tempdir().unwrap();
    let (app, _) = completion_app(tmp.path(), Arc::new(FixedClock::new(42))).await;
    let router = app_router(app);
    let token = sign_token(COURSE_RUN, "shift", "20260009", "2026-10-12T08:15:30Z");

    let mut handles = Vec::new();
    for _ in 0..8 {
        let router = router.clone();
        let token = token.clone();
        handles.push(tokio::spawn(async move {
            let response = post_claim(router, &token, "application/jose").await;
            (response.status(), body_json(response).await)
        }));
    }

    let mut stored = 0;
    let mut exists = 0;
    for handle in handles {
        let (status, body) = handle.await.unwrap();
        match (status, body["status"].as_str()) {
            (StatusCode::CREATED, Some("stored")) => stored += 1,
            (StatusCode::OK, Some("already_exists")) => exists += 1,
            other => panic!("unexpected outcome: {other:?}"),
        }
    }
    assert_eq!(stored, 1);
    assert_eq!(exists, 7);
}

#[tokio::test]
async fn rejects_unknown_key_and_invalid_signature() {
    let tmp = tempfile::tempdir().unwrap();
    let (app, _) = completion_app(tmp.path(), Arc::new(SystemClock)).await;
    let router = app_router(app);

    let other_key = SigningKey::from_bytes(&[9u8; 32]);
    let evidence = CompletionEvidence::new(
        CourseRunId::from_str(COURSE_RUN).unwrap(),
        LabId::from_str("affine").unwrap(),
        StudentId::from_str("20260001").unwrap(),
        CompletedAt::from_str("2026-10-12T08:15:30Z").unwrap(),
    );
    let unknown_kid = KeyId::from_str("lab-host-unknown-2026-01").unwrap();
    let unknown_token = sign_compact(&evidence, &unknown_kid, &other_key).into_string();
    let unknown = post_claim(router.clone(), &unknown_token, "application/jose").await;
    assert_eq!(unknown.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        body_json(unknown).await,
        json!({"error":"invalid_evidence"})
    );

    let trusted_kid = KeyId::from_str(KID).unwrap();
    let bad_sig = sign_compact(&evidence, &trusted_kid, &other_key).into_string();
    let invalid_sig = post_claim(router, &bad_sig, "application/jose").await;
    assert_eq!(invalid_sig.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        body_json(invalid_sig).await,
        json!({"error":"invalid_evidence"})
    );
}

#[tokio::test]
async fn storage_failures_are_client_safe() {
    let tmp = tempfile::tempdir().unwrap();
    let (app, _) = completion_app(tmp.path(), Arc::new(FixedClock::new(1))).await;
    let service = app.completion().unwrap().clone();
    service.store().close_for_test().await;

    let token = sign_token(COURSE_RUN, "affine", "20260001", "2026-10-12T08:15:30Z");
    let router = app_router(app);
    let response = post_claim(router.clone(), &token, "application/jose").await;
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(
        body_json(response).await,
        json!({"error":"storage_unavailable"})
    );

    let board = graphql(
        router,
        "query { completionBoard { courseRunId } }",
        json!({}),
    )
    .await;
    assert_eq!(
        board["errors"][0]["extensions"]["code"],
        "COMPLETION_UNAVAILABLE"
    );
    let message = board["errors"][0]["message"].as_str().unwrap_or_default();
    assert!(!message.to_ascii_lowercase().contains("sqlite"));
    assert!(!message.to_ascii_lowercase().contains("sqlx"));
}

#[tokio::test]
async fn historical_board_preserves_labs_removed_from_catalog() {
    let tmp = tempfile::tempdir().unwrap();
    let (app, db) = completion_app(tmp.path(), Arc::new(FixedClock::new(5))).await;
    let store = ClaimStore::open(&db).await.unwrap();
    let key = signing_key();
    let historical = crate::completion::store::test_support::verified_evidence(
        "2025-spring",
        "retired-lab",
        "20250001",
        "2025-05-01T12:00:00Z",
        KID,
        &key,
    );
    store.insert_first(&historical, 10).await.unwrap();

    let router = app_router(app);
    let board = graphql(
        router,
        "query($id:String){ completionBoard(courseRunId:$id){ courseRunId students { studentId completedLabIds } } }",
        json!({"id": "2025-spring"}),
    )
    .await;
    assert_eq!(
        board["data"]["completionBoard"],
        json!({
            "courseRunId": "2025-spring",
            "students": [{"studentId":"20250001","completedLabIds":["retired-lab"]}]
        })
    );
}

#[tokio::test]
async fn graphql_board_current_historical_empty_invalid_and_ordered() {
    let tmp = tempfile::tempdir().unwrap();
    let (app, _) = completion_app(tmp.path(), Arc::new(FixedClock::new(100))).await;
    let router = app_router(app);

    let empty = graphql(
        router.clone(),
        "query { completionBoard { courseRunId students { studentId completedLabIds } } }",
        json!({}),
    )
    .await;
    assert_eq!(empty["data"]["completionBoard"]["courseRunId"], COURSE_RUN);
    assert_eq!(empty["data"]["completionBoard"]["students"], json!([]));

    for (student, lab, at) in [
        ("b-student", "shift", "2026-10-12T08:15:30Z"),
        ("a-student", "affine", "2026-10-12T08:15:30Z"),
        ("a-student", "shift", "2026-10-12T09:00:00Z"),
    ] {
        let token = sign_token(COURSE_RUN, lab, student, at);
        let response = post_claim(router.clone(), &token, "application/jose").await;
        assert_eq!(response.status(), StatusCode::CREATED);
    }

    let board = graphql(
        router.clone(),
        "query { completionBoard { courseRunId students { studentId completedLabIds } } }",
        json!({}),
    )
    .await;
    assert_eq!(
        board["data"]["completionBoard"]["students"],
        json!([
            {"studentId":"a-student","completedLabIds":["affine","shift"]},
            {"studentId":"b-student","completedLabIds":["shift"]},
        ])
    );

    let historical = graphql(
        router.clone(),
        "query($id:String){ completionBoard(courseRunId:$id){ courseRunId students { studentId } } }",
        json!({"id": "2025-spring"}),
    )
    .await;
    assert_eq!(
        historical["data"]["completionBoard"]["courseRunId"],
        "2025-spring"
    );
    assert_eq!(historical["data"]["completionBoard"]["students"], json!([]));

    let invalid = graphql(
        router,
        "query($id:String){ completionBoard(courseRunId:$id){ courseRunId } }",
        json!({"id": "NOT_VALID"}),
    )
    .await;
    assert_eq!(
        invalid["errors"][0]["extensions"]["code"],
        "INVALID_COURSE_RUN_ID"
    );
}
