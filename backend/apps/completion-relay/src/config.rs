//! Immutable RON configuration for `completion-relay serve`.

use std::fs;
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4};
use std::path::{Path, PathBuf};
use std::str::FromStr;

use completion_claims::{CourseRunId, KeyId};
use ed25519_dalek::SigningKey;
use ed25519_dalek::pkcs8::DecodePrivateKey;
use serde::Deserialize;
use thiserror::Error;
use url::Url;

/// Validated relay configuration and signing material for the process lifetime.
#[derive(Debug, Clone)]
pub struct RelayConfiguration {
    course_run: CourseRunId,
    /// Backend endpoint text exactly as configured (validated, not rewritten).
    backend_endpoint: String,
    listen_port: u16,
    kid: KeyId,
    signing_key: SigningKey,
}

impl RelayConfiguration {
    /// Course Run embedded in issued Completion Evidence.
    #[must_use]
    pub fn course_run(&self) -> &CourseRunId {
        &self.course_run
    }

    /// Backend Completion Claims URL text exactly as configured.
    #[must_use]
    pub fn backend_endpoint(&self) -> &str {
        &self.backend_endpoint
    }

    /// IPv4 loopback bind address for Challenge intake.
    #[must_use]
    pub fn bind_addr(&self) -> SocketAddr {
        SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::LOCALHOST, self.listen_port))
    }

    /// Signing key identifier (`kid`) for issued evidence.
    #[must_use]
    pub fn kid(&self) -> &KeyId {
        &self.kid
    }

    /// Loaded Ed25519 signing key.
    #[must_use]
    pub fn signing_key(&self) -> &SigningKey {
        &self.signing_key
    }
}

/// Configuration load and validation failures.
#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("failed to read configuration at {path}: {message}")]
    Read { path: String, message: String },

    #[error("failed to parse configuration: {0}")]
    Parse(String),

    #[error("invalid course_run `{0}`")]
    InvalidCourseRun(String),

    #[error("invalid kid `{0}`")]
    InvalidKid(String),

    #[error("listen_port must be in 1..=65535")]
    InvalidListenPort,

    #[error("backend_endpoint must be an absolute http or https URL")]
    InvalidBackendEndpoint,

    #[error("private_key_path must be absolute")]
    RelativePrivateKeyPath,

    #[error("failed to read private key at {path}: {message}")]
    PrivateKeyRead { path: String, message: String },

    #[error("private key at {path} is not an unencrypted Ed25519 PKCS#8 PEM key")]
    UnusablePrivateKey { path: String },
}

#[derive(Debug, Deserialize)]
#[serde(rename = "RelayConfiguration", deny_unknown_fields)]
struct RawRelayConfiguration {
    course_run: String,
    backend_endpoint: String,
    listen_port: u16,
    key: RawKey,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawKey {
    kid: String,
    private_key_path: String,
}

/// Load and validate relay configuration from a RON file path.
pub fn load(path: &Path) -> Result<RelayConfiguration, ConfigError> {
    let text = fs::read_to_string(path).map_err(|err| ConfigError::Read {
        path: path.display().to_string(),
        message: err.to_string(),
    })?;
    let raw: RawRelayConfiguration =
        ron::from_str(&text).map_err(|err| ConfigError::Parse(err.to_string()))?;
    from_raw(raw)
}

fn from_raw(raw: RawRelayConfiguration) -> Result<RelayConfiguration, ConfigError> {
    let course_run = CourseRunId::from_str(&raw.course_run)
        .map_err(|_| ConfigError::InvalidCourseRun(raw.course_run.clone()))?;
    let kid =
        KeyId::from_str(&raw.key.kid).map_err(|_| ConfigError::InvalidKid(raw.key.kid.clone()))?;

    if raw.listen_port == 0 {
        return Err(ConfigError::InvalidListenPort);
    }
    let listen_port = raw.listen_port;

    let backend_endpoint = validate_backend_endpoint(&raw.backend_endpoint)?;

    let private_key_path = PathBuf::from(&raw.key.private_key_path);
    if !private_key_path.is_absolute() {
        return Err(ConfigError::RelativePrivateKeyPath);
    }

    let signing_key = load_signing_key(&private_key_path)?;

    Ok(RelayConfiguration {
        course_run,
        backend_endpoint,
        listen_port,
        kid,
        signing_key,
    })
}

fn validate_backend_endpoint(raw: &str) -> Result<String, ConfigError> {
    let url = Url::parse(raw).map_err(|_| ConfigError::InvalidBackendEndpoint)?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err(ConfigError::InvalidBackendEndpoint);
    }
    if url.cannot_be_a_base() || url.host().is_none() {
        return Err(ConfigError::InvalidBackendEndpoint);
    }
    // Retain the configured text; do not rewrite via Url display.
    Ok(raw.to_owned())
}

fn load_signing_key(path: &Path) -> Result<SigningKey, ConfigError> {
    let pem = fs::read_to_string(path).map_err(|err| ConfigError::PrivateKeyRead {
        path: path.display().to_string(),
        message: err.to_string(),
    })?;
    SigningKey::from_pkcs8_pem(&pem).map_err(|_| ConfigError::UnusablePrivateKey {
        path: path.display().to_string(),
    })
}
