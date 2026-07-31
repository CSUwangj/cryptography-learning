use std::path::{Component, Path, PathBuf};

use async_graphql::http::{GraphQLPlaygroundConfig, playground_source};
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::extract::State;
use axum::http::{Method, StatusCode, Uri, header};
use axum::middleware::{self, Next};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Router, body::Body, http::Request};

use crate::bootstrap::{AppSchema, Application};
use crate::logging::log_request_failure;

/// Build the public HTTP router for a successfully bootstrapped application.
pub fn app_router(app: Application) -> Router {
    let static_root = app.static_root().to_path_buf();
    Router::new()
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .route("/query", post(graphql_handler))
        .route("/playground", get(playground))
        .fallback(spa_fallback)
        .layer(middleware::from_fn(log_failed_requests))
        .with_state(AppState {
            application: app,
            static_root,
        })
}

#[derive(Clone)]
struct AppState {
    application: Application,
    static_root: PathBuf,
}

async fn live() -> impl IntoResponse {
    (StatusCode::OK, "ok")
}

async fn ready(State(state): State<AppState>) -> impl IntoResponse {
    if state.application.is_ready() {
        (StatusCode::OK, "ready")
    } else {
        (StatusCode::SERVICE_UNAVAILABLE, "not ready")
    }
}

async fn graphql_handler(State(state): State<AppState>, req: GraphQLRequest) -> GraphQLResponse {
    let schema: &AppSchema = state.application.schema();
    schema.execute(req.into_inner()).await.into()
}

async fn playground() -> impl IntoResponse {
    Html(playground_source(GraphQLPlaygroundConfig::new("/query")))
}

async fn spa_fallback(State(state): State<AppState>, method: Method, uri: Uri) -> Response {
    if method != Method::GET {
        return StatusCode::NOT_FOUND.into_response();
    }

    let path = uri.path();
    if is_reserved_prefix(path) {
        return StatusCode::NOT_FOUND.into_response();
    }
    if !path_is_safe(path) {
        return StatusCode::NOT_FOUND.into_response();
    }

    let relative = path.trim_start_matches('/');
    let candidate = state.static_root.join(relative);

    if candidate.is_file() {
        return serve_static_file(candidate).await;
    }

    // Missing paths that look like static assets must 404, not rewrite to the SPA.
    if looks_like_asset_path(path) {
        return StatusCode::NOT_FOUND.into_response();
    }

    let index = state.static_root.join("index.html");
    match tokio::fs::read(&index).await {
        Ok(bytes) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
            bytes,
        )
            .into_response(),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn log_failed_requests(req: Request<Body>, next: Next) -> Response {
    let method = req.method().to_string();
    let path = req.uri().path().to_string();
    let response = next.run(req).await;
    let status = response.status().as_u16();
    if status >= 400 {
        log_request_failure(
            &method,
            &path,
            status,
            "request completed with error status",
        );
    }
    response
}

fn is_reserved_prefix(path: &str) -> bool {
    path == "/query" || path == "/playground" || path == "/health" || path.starts_with("/health/")
}

fn looks_like_asset_path(path: &str) -> bool {
    Path::new(path)
        .file_name()
        .and_then(|name| Path::new(name).extension())
        .is_some_and(|ext| !ext.is_empty())
}

fn path_is_safe(path: &str) -> bool {
    Path::new(path).components().all(|component| {
        matches!(
            component,
            Component::RootDir | Component::CurDir | Component::Normal(_)
        )
    })
}

async fn serve_static_file(file_path: PathBuf) -> Response {
    match tokio::fs::read(&file_path).await {
        Ok(bytes) => {
            let mime = mime_guess::from_path(&file_path)
                .first_or_octet_stream()
                .essence_str()
                .to_string();
            (StatusCode::OK, [(header::CONTENT_TYPE, mime)], bytes).into_response()
        }
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bootstrap::{Application, ProcessIdentity};
    use crate::practice_catalog::{
        InMemoryLabContentSource, RawConfiguration, RawLab, RawLabCategory, RawPractice,
        RawResource, RawTranslation,
    };
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use serde_json::{Value, json};
    use std::collections::HashMap;
    use std::fs;
    use tower::ServiceExt;

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

    fn sample_app(static_root: &Path) -> Application {
        fs::create_dir_all(static_root).unwrap();
        fs::write(
            static_root.join("index.html"),
            "<!doctype html><html><body><div id=\"root\">Crypto Learn</div></body></html>",
        )
        .unwrap();
        fs::write(static_root.join("app.js"), "console.log('bundle');").unwrap();
        fs::create_dir_all(static_root.join("assets")).unwrap();
        fs::write(static_root.join("assets/main.js"), "export {};").unwrap();

        let mut files = HashMap::new();
        files.insert("affine.md".to_string(), "affine-body".to_string());
        let source = InMemoryLabContentSource::new(files);
        let raw = RawConfiguration {
            schema_version: RawConfiguration::SUPPORTED_SCHEMA_VERSION,
            practice: RawPractice {
                lab_categories: vec![RawLabCategory {
                    id: "classical".to_string(),
                    name: vec![translation("en-US", "Classical")],
                    labs: vec![RawLab {
                        id: "affine".to_string(),
                        ws_endpoints: vec![crate::practice_catalog::RawEndpoint {
                            host: "127.0.0.1".into(),
                            port: 19020,
                        }],
                        tcp_endpoints: vec![crate::practice_catalog::RawEndpoint {
                            host: "127.0.0.1".into(),
                            port: 19000,
                        }],
                        resources: vec![resource("en-US", "Affine", "affine.md")],
                    }],
                }],
            },
        };
        Application::from_raw(raw, static_root, &source, ProcessIdentity::unknown()).unwrap()
    }

    async fn body_text(response: Response) -> String {
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        String::from_utf8(bytes.to_vec()).unwrap()
    }

    async fn body_json(response: Response) -> Value {
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[tokio::test]
    async fn graphql_query_returns_hello() {
        let tmp = tempfile::tempdir().unwrap();
        let router = app_router(sample_app(tmp.path()));
        let response = router
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/query")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{"query":"{ hello }"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let json = body_json(response).await;
        assert_eq!(json["data"]["hello"], "hello cryptography");
    }

    #[tokio::test]
    async fn graphql_lab_and_missing_lab_semantics() {
        let tmp = tempfile::tempdir().unwrap();
        let router = app_router(sample_app(tmp.path()));

        let ok = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/query")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "query": "query($c:String!,$l:String!){ lab(categoryId:$c, labId:$l){ lang name content wsEndpoints { host port } tcpEndpoints { host port } } }",
                            "variables": {"c":"classical","l":"affine"}
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(ok.status(), StatusCode::OK);
        let ok_json = body_json(ok).await;
        assert_eq!(ok_json["data"]["lab"]["content"], "affine-body");
        assert_eq!(
            ok_json["data"]["lab"]["wsEndpoints"][0],
            json!({"host": "127.0.0.1", "port": 19020})
        );
        assert_eq!(
            ok_json["data"]["lab"]["tcpEndpoints"][0],
            json!({"host": "127.0.0.1", "port": 19000})
        );

        let missing = router
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/query")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "query": "query($c:String!,$l:String!){ lab(categoryId:$c, labId:$l){ lang } }",
                            "variables": {"c":"classical","l":"missing"}
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let missing_json = body_json(missing).await;
        assert!(missing_json.get("errors").is_some());
    }

    #[tokio::test]
    async fn playground_targets_query_endpoint() {
        let tmp = tempfile::tempdir().unwrap();
        let router = app_router(sample_app(tmp.path()));
        let response = router
            .oneshot(
                Request::builder()
                    .uri("/playground")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = body_text(response).await;
        assert!(body.contains("/query"));
        assert!(body.to_lowercase().contains("playground") || body.contains("GraphQL"));
    }

    #[tokio::test]
    async fn health_live_and_ready_succeed_for_bootstrapped_app() {
        let tmp = tempfile::tempdir().unwrap();
        let router = app_router(sample_app(tmp.path()));

        let live = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/health/live")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(live.status(), StatusCode::OK);

        let ready = router
            .oneshot(
                Request::builder()
                    .uri("/health/ready")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(ready.status(), StatusCode::OK);
        assert_eq!(body_text(ready).await, "ready");
    }

    #[tokio::test]
    async fn static_assets_and_nested_spa_fallback() {
        let tmp = tempfile::tempdir().unwrap();
        let router = app_router(sample_app(tmp.path()));

        let asset = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/assets/main.js")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(asset.status(), StatusCode::OK);
        assert_eq!(body_text(asset).await, "export {};");

        let nested = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/practice/classical/affine")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(nested.status(), StatusCode::OK);
        let nested_body = body_text(nested).await;
        assert!(nested_body.contains("id=\"root\""));

        let root = router
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(root.status(), StatusCode::OK);
        assert!(body_text(root).await.contains("Crypto Learn"));
    }

    #[tokio::test]
    async fn missing_assets_and_reserved_paths_are_not_rewritten_to_index() {
        let tmp = tempfile::tempdir().unwrap();
        let router = app_router(sample_app(tmp.path()));

        let missing_js = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/assets/missing.js")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(missing_js.status(), StatusCode::NOT_FOUND);
        let missing_js_body = body_text(missing_js).await;
        assert!(!missing_js_body.contains("id=\"root\""));

        let unknown_health = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/health/something-else")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(unknown_health.status(), StatusCode::NOT_FOUND);

        // Exact reserved paths use their handlers; fallback must not SPA-rewrite them.
        let query_get = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/query")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_ne!(query_get.status(), StatusCode::OK);
        let query_body = body_text(query_get).await;
        assert!(!query_body.contains("id=\"root\""));

        let unknown_post = router
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/unknown-api")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(unknown_post.status(), StatusCode::NOT_FOUND);
    }
}
