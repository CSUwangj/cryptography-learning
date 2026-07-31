//! Structured lifecycle and request-failure logging.

use tracing::{error, info};
use tracing_subscriber::EnvFilter;
use tracing_subscriber::fmt;

use crate::bootstrap::ProcessIdentity;

/// Install a structured (JSON) tracing subscriber based on the `-v` count.
pub fn init_tracing(log_level: u8) {
    let level = match log_level {
        0 => "error",
        1 => "warn",
        2 => "info",
        3 => "debug",
        _ => "trace",
    };
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        EnvFilter::new(format!("cryptography_learning_backend={level},{level}"))
    });

    let _ = fmt()
        .json()
        .with_env_filter(filter)
        .with_current_span(false)
        .with_span_list(false)
        .try_init();
}

/// Log process start with injected build and image identity.
pub fn log_startup(identity: &ProcessIdentity, access_point: &str) {
    info!(
        build_commit = %identity.build_commit,
        image_id = %identity.image_id,
        access_point = %access_point,
        "application starting"
    );
}

/// Log process shutdown.
pub fn log_shutdown(identity: &ProcessIdentity) {
    info!(
        build_commit = %identity.build_commit,
        image_id = %identity.image_id,
        "application shutdown"
    );
}

/// Log an HTTP request failure with structured fields.
pub fn log_request_failure(method: &str, path: &str, status: u16, message: &str) {
    error!(
        http.method = %method,
        http.path = %path,
        http.status = status,
        error = %message,
        "request failed"
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use tracing_test::traced_test;

    #[traced_test]
    #[test]
    fn startup_log_includes_build_and_image_identity() {
        log_startup(
            &ProcessIdentity {
                build_commit: "commit-xyz".into(),
                image_id: "img-123".into(),
            },
            "0.0.0.0:8000",
        );
        assert!(logs_contain("application starting"));
        assert!(logs_contain("commit-xyz"));
        assert!(logs_contain("img-123"));
    }

    #[traced_test]
    #[test]
    fn shutdown_log_is_structured() {
        log_shutdown(&ProcessIdentity {
            build_commit: "commit-xyz".into(),
            image_id: "img-123".into(),
        });
        assert!(logs_contain("application shutdown"));
        assert!(logs_contain("commit-xyz"));
    }

    #[traced_test]
    #[test]
    fn request_failure_log_includes_method_path_and_status() {
        log_request_failure("GET", "/assets/missing.js", 404, "not found");
        assert!(logs_contain("request failed"));
        assert!(logs_contain("GET"));
        assert!(logs_contain("/assets/missing.js"));
        assert!(logs_contain("404"));
    }
}
