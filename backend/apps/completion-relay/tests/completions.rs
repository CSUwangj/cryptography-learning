//! Challenge intake and synchronous delivery seam for `completion-relay serve` (#43).
//!
//! Uses Reqwest for Challenge→relay traffic and Axum for the mock backend so the
//! suite does not invent HTTP parsers. Failure logs are observed through the
//! production JSON subscriber from [`completion_relay::serve::build_json_subscriber`].

use std::io::{self, Write};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use axum::Json;
use axum::Router;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use completion_claims::verify_compact;
use ed25519_dalek::VerifyingKey;
use serde_json::{Value, json};
use tempfile::TempDir;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tracing_subscriber::fmt::MakeWriter;

use completion_relay::config;
use completion_relay::serve;

/// RFC 8032 Ed25519 test-vector-1 seed as unencrypted PKCS#8 PEM.
const RFC8032_TV1_PKCS8_PEM: &str = "\
-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIJ1hsZ3v/VpguoRK9JLsLMREScVpezJpGXA7rAMcrn9g
-----END PRIVATE KEY-----
";

const COURSE_RUN: &str = "2026-autumn";
const KID: &str = "lab-host-a-2026-01";

/// Shared sink for the production JSON formatter.
#[derive(Clone, Default)]
struct LogBuffer {
    inner: Arc<Mutex<Vec<u8>>>,
}

impl LogBuffer {
    fn new() -> Self {
        Self::default()
    }

    fn lines(&self) -> Vec<String> {
        let bytes = self.inner.lock().expect("log lock").clone();
        String::from_utf8_lossy(&bytes)
            .lines()
            .filter(|line| !line.is_empty())
            .map(str::to_owned)
            .collect()
    }
}

impl Write for LogBuffer {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.inner.lock().expect("log lock").extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

impl<'a> MakeWriter<'a> for LogBuffer {
    type Writer = LogBuffer;

    fn make_writer(&'a self) -> Self::Writer {
        self.clone()
    }
}

struct Fixture {
    _dir: TempDir,
    config: config::RelayConfiguration,
    logs: LogBuffer,
}

impl Fixture {
    fn new(backend_endpoint: &str) -> Self {
        let dir = TempDir::new().expect("tempdir");
        let key_path = dir.path().join("completion-relay.pem");
        std::fs::write(&key_path, RFC8032_TV1_PKCS8_PEM).expect("write key");
        let config_path = dir.path().join("relay.ron");
        let ron = format!(
            r#"RelayConfiguration(
  course_run: "{COURSE_RUN}",
  backend_endpoint: "{backend_endpoint}",
  listen_port: 1,
  key: (
    kid: "{KID}",
    private_key_path: "{}",
  ),
)
"#,
            escape_ron_string(key_path.to_str().expect("utf-8 path"))
        );
        std::fs::write(&config_path, ron).expect("write config");
        let config = config::load(&config_path).expect("load config");
        Self {
            _dir: dir,
            config,
            logs: LogBuffer::new(),
        }
    }

    fn verifying_key(&self) -> VerifyingKey {
        self.config.signing_key().verifying_key()
    }
}

fn escape_ron_string(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

async fn start_relay(
    fixture: &Fixture,
) -> (
    std::net::SocketAddr,
    oneshot::Sender<()>,
    tokio::task::JoinHandle<()>,
) {
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind relay");
    let addr = listener.local_addr().expect("local addr");
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let config = fixture.config.clone();
    let logs = fixture.logs.clone();

    let handle = tokio::spawn(async move {
        let _guard = tracing::subscriber::set_default(serve::build_json_subscriber(logs));
        serve::serve_until_shutdown(config, listener, async move {
            let _ = shutdown_rx.await;
        })
        .await
        .expect("serve");
    });

    wait_for_health(addr).await;
    (addr, shutdown_tx, handle)
}

async fn wait_for_health(addr: std::net::SocketAddr) {
    let client = reqwest::Client::new();
    let url = format!("http://{addr}/health");
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        match client.get(&url).send().await {
            Ok(resp) if resp.status() == StatusCode::OK => return,
            _ if Instant::now() < deadline => {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            other => panic!("health not ready: {other:?}"),
        }
    }
}

async fn challenge_get(
    addr: std::net::SocketAddr,
    path: &str,
) -> reqwest::Result<reqwest::Response> {
    reqwest::Client::new()
        .get(format!("http://{addr}{path}"))
        .send()
        .await
}

async fn challenge_post_json(
    addr: std::net::SocketAddr,
    content_type: &str,
    body: Vec<u8>,
) -> reqwest::Result<reqwest::Response> {
    reqwest::Client::new()
        .post(format!("http://{addr}/api/completions"))
        .header(header::CONTENT_TYPE, content_type)
        .body(body)
        .send()
        .await
}

async fn json_body(resp: reqwest::Response) -> Value {
    let bytes = resp.bytes().await.expect("response body");
    serde_json::from_slice(&bytes).expect("json body")
}

async fn json_error(resp: reqwest::Response) -> String {
    let v = json_body(resp).await;
    v.get("error")
        .and_then(|e| e.as_str())
        .expect("error field")
        .to_owned()
}

async fn json_status(resp: reqwest::Response) -> String {
    let v = json_body(resp).await;
    v.get("status")
        .and_then(|e| e.as_str())
        .expect("status field")
        .to_owned()
}

/// Production tracing-subscriber JSON puts event fields under `fields`.
fn failure_events(logs: &LogBuffer) -> Vec<Value> {
    logs.lines()
        .into_iter()
        .map(|line| serde_json::from_str::<Value>(&line).expect("production JSON log line"))
        .filter(|line| {
            line.pointer("/fields/event").and_then(|e| e.as_str())
                == Some("completion_delivery_failed")
        })
        .collect()
}

fn exactly_one_failure(logs: &LogBuffer) -> Value {
    let events = failure_events(logs);
    assert_eq!(
        events.len(),
        1,
        "expected exactly one completion_delivery_failed; got {events:?}"
    );
    events.into_iter().next().unwrap()
}

fn field<'a>(event: &'a Value, name: &str) -> &'a Value {
    event
        .pointer(&format!("/fields/{name}"))
        .unwrap_or_else(|| panic!("missing fields.{name} in {event}"))
}

#[derive(Clone)]
struct MockState {
    received: Arc<Mutex<Vec<MockRequest>>>,
    behavior: Arc<Mutex<MockBehavior>>,
}

#[derive(Clone)]
struct MockRequest {
    content_type: String,
    body: String,
}

#[derive(Clone)]
enum MockBehavior {
    Stored,
    AlreadyExists,
    Reject { status: u16, body: Value },
    Hang,
}

struct MockBackend {
    addr: std::net::SocketAddr,
    state: MockState,
    shutdown: Option<oneshot::Sender<()>>,
    join: Option<tokio::task::JoinHandle<()>>,
}

impl MockBackend {
    async fn start(behavior: MockBehavior) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind mock");
        let addr = listener.local_addr().expect("addr");
        let state = MockState {
            received: Arc::new(Mutex::new(Vec::new())),
            behavior: Arc::new(Mutex::new(behavior)),
        };
        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
        let app = Router::new()
            .route("/api/completion-claims", post(mock_completion_claim))
            .with_state(state.clone());

        let join = tokio::spawn(async move {
            axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    let _ = shutdown_rx.await;
                })
                .await
                .expect("mock serve");
        });

        Self {
            addr,
            state,
            shutdown: Some(shutdown_tx),
            join: Some(join),
        }
    }

    fn endpoint(&self) -> String {
        format!("http://{}/api/completion-claims", self.addr)
    }

    fn set_behavior(&self, behavior: MockBehavior) {
        *self.state.behavior.lock().expect("lock") = behavior;
    }

    fn take_received(&self) -> Vec<MockRequest> {
        std::mem::take(&mut *self.state.received.lock().expect("lock"))
    }
}

impl Drop for MockBackend {
    fn drop(&mut self) {
        if let Some(tx) = self.shutdown.take() {
            let _ = tx.send(());
        }
        if let Some(join) = self.join.take() {
            join.abort();
        }
    }
}

async fn mock_completion_claim(
    State(state): State<MockState>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let content_type = headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_owned();
    state.received.lock().expect("lock").push(MockRequest {
        content_type,
        body: String::from_utf8_lossy(&body).into_owned(),
    });

    let behavior = state.behavior.lock().expect("lock").clone();
    match behavior {
        MockBehavior::Stored => {
            (StatusCode::CREATED, Json(json!({"status": "stored"}))).into_response()
        }
        MockBehavior::AlreadyExists => {
            (StatusCode::OK, Json(json!({"status": "already_exists"}))).into_response()
        }
        MockBehavior::Reject { status, body } => {
            let status = StatusCode::from_u16(status).expect("status");
            (status, Json(body)).into_response()
        }
        MockBehavior::Hang => {
            tokio::time::sleep(Duration::from_secs(30)).await;
            StatusCode::OK.into_response()
        }
    }
}

#[tokio::test]
async fn health_returns_ok_while_serving() {
    let backend = MockBackend::start(MockBehavior::Stored).await;
    let fixture = Fixture::new(&backend.endpoint());
    let (addr, shutdown_tx, handle) = start_relay(&fixture).await;

    let resp = challenge_get(addr, "/health").await.expect("health");
    assert_eq!(resp.status(), StatusCode::OK);
    assert_eq!(json_status(resp).await, "ok");

    let _ = shutdown_tx.send(());
    handle.await.ok();
}

#[tokio::test]
async fn stored_and_already_exists_map_to_recorded() {
    let backend = MockBackend::start(MockBehavior::Stored).await;
    let fixture = Fixture::new(&backend.endpoint());
    let verifying_key = fixture.verifying_key();
    let (addr, shutdown_tx, handle) = start_relay(&fixture).await;

    let before = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let body = br#"{"lab":"affine","student":"20260001"}"#.to_vec();
    let resp = challenge_post_json(addr, "application/json", body.clone())
        .await
        .expect("post");
    assert_eq!(resp.status(), StatusCode::OK);
    assert_eq!(json_status(resp).await, "recorded");

    let after = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let received = backend.take_received();
    assert_eq!(received.len(), 1);
    assert_eq!(received[0].content_type, "application/jose");
    let token = &received[0].body;
    let verified = verify_compact(token, |kid| {
        assert_eq!(kid.as_str(), KID);
        Some(verifying_key)
    })
    .expect("verifiable evidence");
    assert_eq!(verified.key_id().as_str(), KID);
    assert_eq!(verified.evidence().lab().as_str(), "affine");
    assert_eq!(verified.evidence().student().as_str(), "20260001");
    assert_eq!(verified.evidence().course_run().as_str(), COURSE_RUN);
    let completed_at = verified.evidence().completed_at().unix_seconds();
    assert!(
        (before..=after).contains(&completed_at),
        "completed_at {completed_at} outside [{before}, {after}]"
    );

    backend.set_behavior(MockBehavior::AlreadyExists);
    let resp = challenge_post_json(addr, "application/json", body)
        .await
        .expect("post again");
    assert_eq!(resp.status(), StatusCode::OK);
    assert_eq!(json_status(resp).await, "recorded");

    let _ = shutdown_tx.send(());
    handle.await.ok();
}

#[tokio::test]
async fn malformed_oversized_and_unsupported_media_do_not_contact_backend() {
    let backend = MockBackend::start(MockBehavior::Stored).await;
    let fixture = Fixture::new(&backend.endpoint());
    let (addr, shutdown_tx, handle) = start_relay(&fixture).await;

    let resp = challenge_post_json(addr, "application/json", br#"{"lab":"affine"}"#.to_vec())
        .await
        .expect("malformed");
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    assert_eq!(json_error(resp).await, "invalid_request");

    let resp = challenge_post_json(
        addr,
        "application/json",
        br#"{"lab":"affine","student":"20260001","extra":true}"#.to_vec(),
    )
    .await
    .expect("unknown field");
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    assert_eq!(json_error(resp).await, "invalid_request");

    let resp = challenge_post_json(
        addr,
        "application/json",
        br#"{"lab":"Affine","student":"20260001"}"#.to_vec(),
    )
    .await
    .expect("lab normalization denied");
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    assert_eq!(json_error(resp).await, "invalid_request");

    let resp = challenge_post_json(
        addr,
        "text/plain",
        br#"{"lab":"affine","student":"20260001"}"#.to_vec(),
    )
    .await
    .expect("media");
    assert_eq!(resp.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);
    assert_eq!(json_error(resp).await, "unsupported_media_type");

    let oversized = vec![b'a'; 4097];
    let resp = challenge_post_json(addr, "application/json", oversized)
        .await
        .expect("oversized");
    assert_eq!(resp.status(), StatusCode::PAYLOAD_TOO_LARGE);
    assert_eq!(json_error(resp).await, "request_too_large");

    assert!(backend.take_received().is_empty());

    let _ = shutdown_tx.send(());
    handle.await.ok();
}

#[tokio::test]
async fn backend_rejection_connection_failure_and_timeout_return_delivery_failed() {
    let body = br#"{"lab":"affine","student":"20260001"}"#.to_vec();

    // Rejection
    let backend = MockBackend::start(MockBehavior::Reject {
        status: 422,
        body: json!({"error": "unknown_lab"}),
    })
    .await;
    let fixture = Fixture::new(&backend.endpoint());
    let verifying_key = fixture.verifying_key();
    let (addr, shutdown_tx, handle) = start_relay(&fixture).await;

    let resp = challenge_post_json(addr, "application/json", body.clone())
        .await
        .expect("reject");
    assert_eq!(resp.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(json_error(resp).await, "delivery_failed");

    let received = backend.take_received();
    assert_eq!(received.len(), 1);
    let posted_evidence = received[0].body.clone();

    let failure = exactly_one_failure(&fixture.logs);
    assert_eq!(failure["level"], "ERROR");
    assert_eq!(field(&failure, "lab"), "affine");
    assert_eq!(field(&failure, "student"), "20260001");
    assert_eq!(field(&failure, "failure_category"), "backend_rejected");
    assert_eq!(field(&failure, "backend_status"), 422);
    assert_eq!(field(&failure, "backend_error"), "unknown_lab");
    let logged_evidence = field(&failure, "evidence")
        .as_str()
        .expect("evidence string");
    assert_eq!(
        logged_evidence, posted_evidence,
        "logged evidence must be the exact compact token delivered to the backend"
    );
    let verified = verify_compact(logged_evidence, |_| Some(verifying_key))
        .expect("logged evidence must verify");
    assert_eq!(verified.evidence().lab().as_str(), "affine");
    assert_eq!(verified.evidence().student().as_str(), "20260001");

    let joined = fixture.logs.lines().join("\n");
    assert!(!joined.contains("PRIVATE KEY"));
    assert!(!joined.contains("BEGIN PRIVATE KEY"));
    assert!(!joined.contains(r#"{"error":"unknown_lab"}"#));

    let _ = shutdown_tx.send(());
    handle.await.ok();
    drop(backend);

    // Connection failure
    let fixture = Fixture::new("http://127.0.0.1:1/api/completion-claims");
    let verifying_key = fixture.verifying_key();
    let (addr, shutdown_tx, handle) = start_relay(&fixture).await;
    let resp = challenge_post_json(addr, "application/json", body.clone())
        .await
        .expect("conn fail");
    assert_eq!(resp.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(json_error(resp).await, "delivery_failed");
    let failure = exactly_one_failure(&fixture.logs);
    assert_eq!(field(&failure, "failure_category"), "connection_failed");
    assert!(
        failure.pointer("/fields/backend_status").is_none()
            || failure.pointer("/fields/backend_status") == Some(&Value::Null),
        "connection failures must not invent a backend status"
    );
    let logged_evidence = field(&failure, "evidence")
        .as_str()
        .expect("evidence string");
    verify_compact(logged_evidence, |_| Some(verifying_key)).expect("logged evidence must verify");
    let _ = shutdown_tx.send(());
    handle.await.ok();

    // Timeout
    let backend = MockBackend::start(MockBehavior::Hang).await;
    let fixture = Fixture::new(&backend.endpoint());
    let verifying_key = fixture.verifying_key();
    let (addr, shutdown_tx, handle) = start_relay(&fixture).await;
    let started = Instant::now();
    let resp = challenge_post_json(addr, "application/json", body)
        .await
        .expect("timeout");
    assert_eq!(resp.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(json_error(resp).await, "delivery_failed");
    assert!(
        started.elapsed() < Duration::from_secs(15),
        "should fail via client timeout, not hang for 30s"
    );
    let failure = exactly_one_failure(&fixture.logs);
    assert_eq!(field(&failure, "failure_category"), "timeout");
    let logged_evidence = field(&failure, "evidence")
        .as_str()
        .expect("evidence string");
    verify_compact(logged_evidence, |_| Some(verifying_key)).expect("logged evidence must verify");
    let _ = shutdown_tx.send(());
    handle.await.ok();
}

#[tokio::test]
async fn shutdown_stops_later_acceptance() {
    let backend = MockBackend::start(MockBehavior::Stored).await;
    let fixture = Fixture::new(&backend.endpoint());
    let (addr, shutdown_tx, handle) = start_relay(&fixture).await;

    let _ = shutdown_tx.send(());
    handle.await.expect("serve join");

    let refused = challenge_get(addr, "/health").await;
    assert!(
        refused.is_err(),
        "server must stop accepting after shutdown"
    );
}
