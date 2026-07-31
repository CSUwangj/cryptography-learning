//! Deterministic serve loop with an injected shutdown future.

use std::future::Future;

use axum::Router;
use tokio::net::TcpListener;
use tracing::info;

/// Serve `app` until `shutdown` completes, then stop accepting and drain in-flight work.
pub async fn serve_until_shutdown<F>(
    listener: TcpListener,
    app: Router,
    shutdown: F,
) -> std::io::Result<()>
where
    F: Future<Output = ()> + Send + 'static,
{
    info!("http server accepting connections");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown)
        .await?;
    info!("http server shut down");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::routing::get;
    use axum::{Router, http::StatusCode};
    use std::net::SocketAddr;
    use std::sync::Arc;
    use std::time::Duration;
    use tokio::sync::{Notify, oneshot};
    use tokio::time::{sleep, timeout};

    #[tokio::test]
    async fn graceful_shutdown_completes_in_flight_request_then_returns() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let started = Arc::new(Notify::new());
        let started_for_handler = started.clone();
        let (release_tx, release_rx) = oneshot::channel::<()>();
        let release_rx = Arc::new(tokio::sync::Mutex::new(Some(release_rx)));

        let app = Router::new().route(
            "/slow",
            get({
                let release_rx = release_rx.clone();
                move || {
                    let release_rx = release_rx.clone();
                    let started_for_handler = started_for_handler.clone();
                    async move {
                        started_for_handler.notify_one();
                        if let Some(rx) = release_rx.lock().await.take() {
                            let _ = rx.await;
                        }
                        StatusCode::OK
                    }
                }
            }),
        );

        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
        let serve = tokio::spawn(async move {
            serve_until_shutdown(listener, app, async move {
                let _ = shutdown_rx.await;
            })
            .await
        });

        let client = tokio::spawn(async move {
            let url = format!("http://{addr}/slow");
            reqwest_get_status(&url).await
        });

        timeout(Duration::from_secs(2), started.notified())
            .await
            .expect("handler should start");

        shutdown_tx.send(()).unwrap();
        // Give the server a moment to stop accepting, then finish the in-flight request.
        sleep(Duration::from_millis(50)).await;
        release_tx.send(()).unwrap();

        let status = timeout(Duration::from_secs(2), client)
            .await
            .expect("client join timeout")
            .expect("client task")
            .expect("request status");
        assert_eq!(status, 200);

        timeout(Duration::from_secs(2), serve)
            .await
            .expect("serve should return within timeout")
            .expect("serve join")
            .expect("serve result");

        // After shutdown, new connections must fail.
        let refused = reqwest_get_status(&format!("http://{addr}/slow")).await;
        assert!(
            refused.is_err(),
            "server must stop accepting after shutdown"
        );
    }

    async fn reqwest_get_status(url: &str) -> std::io::Result<u16> {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let addr: SocketAddr = url
            .trim_start_matches("http://")
            .split('/')
            .next()
            .unwrap()
            .parse()
            .unwrap();
        let path = url.split(addr.to_string().as_str()).nth(1).unwrap_or("/");
        let mut stream = tokio::net::TcpStream::connect(addr).await?;
        let request = format!("GET {path} HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n");
        stream.write_all(request.as_bytes()).await?;
        let mut buf = Vec::new();
        stream.read_to_end(&mut buf).await?;
        let text = String::from_utf8_lossy(&buf);
        let status = text
            .lines()
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
            .and_then(|code| code.parse().ok())
            .ok_or_else(|| std::io::Error::other("missing status"))?;
        Ok(status)
    }
}
