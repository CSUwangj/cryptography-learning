use std::net::SocketAddr;

use clap::Parser;
use cryptography_learning_backend::bootstrap::{Application, BootstrapPaths, ProcessIdentity};
use cryptography_learning_backend::http::app_router;
use cryptography_learning_backend::logging::{init_tracing, log_shutdown, log_startup};
use cryptography_learning_backend::opts::Opt;
use cryptography_learning_backend::practice_catalog::FilesystemLabContentSource;
use cryptography_learning_backend::serve::serve_until_shutdown;
use tokio::net::TcpListener;
use tokio::signal::unix::{SignalKind, signal};
use tracing::error;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let opt = Opt::parse();
    init_tracing(opt.log_level);

    let identity = ProcessIdentity {
        build_commit: opt.build_commit.clone(),
        image_id: opt.image_id.clone(),
    };
    log_startup(&identity, &opt.access_point);

    // Lab Description paths in the RON are resolved relative to the process
    // working directory (Hosts `cd` into the content mount before start).
    let content_source = FilesystemLabContentSource::new(".");
    let application = match Application::bootstrap(
        &BootstrapPaths {
            config_path: opt.config.clone(),
            static_root: opt.static_file_path.clone(),
        },
        &content_source,
        identity.clone(),
    ) {
        Ok(app) => app,
        Err(err) => {
            error!(error = %err, "application bootstrap failed");
            std::process::exit(1);
        }
    };

    let socket_addr: SocketAddr = match opt.access_point.parse() {
        Ok(addr) => addr,
        Err(err) => {
            error!(error = %err, access_point = %opt.access_point, "invalid listen address");
            std::process::exit(1);
        }
    };

    let listener = match TcpListener::bind(socket_addr).await {
        Ok(listener) => listener,
        Err(err) => {
            error!(error = %err, %socket_addr, "failed to bind listen socket");
            std::process::exit(1);
        }
    };

    tracing::info!(playground = %format!("http://{}/playground", opt.access_point), "playground available");

    let router = app_router(application);
    if let Err(err) = serve_until_shutdown(listener, router, shutdown_signal()).await {
        error!(error = %err, "server exited with error");
        std::process::exit(1);
    }

    log_shutdown(&identity);
}

async fn shutdown_signal() {
    let mut sigterm = signal(SignalKind::terminate()).expect("install SIGTERM handler");
    let mut sigint = signal(SignalKind::interrupt()).expect("install SIGINT handler");
    tokio::select! {
        _ = sigterm.recv() => {
            tracing::info!(signal = "SIGTERM", "shutdown signal received");
        }
        _ = sigint.recv() => {
            tracing::info!(signal = "SIGINT", "shutdown signal received");
        }
    }
}
