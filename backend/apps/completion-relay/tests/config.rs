//! Configuration loader seam for `completion-relay serve` (#39).

use std::path::{Path, PathBuf};

use completion_relay::config;
use tempfile::TempDir;

/// RFC 8032 Ed25519 test-vector-1 seed as unencrypted PKCS#8 PEM.
const RFC8032_TV1_PKCS8_PEM: &str = "\
-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIJ1hsZ3v/VpguoRK9JLsLMREScVpezJpGXA7rAMcrn9g
-----END PRIVATE KEY-----
";

/// Independently known verifying key for RFC 8032 test-vector-1 (uppercase hex).
const RFC8032_TV1_PUBLIC_KEY_HEX: &str =
    "D75A980182B10AB7D54BFED3C964073A0EE172F3DAA62325AF021A68F707511A";

struct Fixture {
    _dir: TempDir,
    config_path: PathBuf,
    key_path: PathBuf,
}

impl Fixture {
    fn with_key_pem(pem: &str) -> Self {
        let dir = TempDir::new().expect("tempdir");
        let key_path = dir.path().join("completion-relay.pem");
        std::fs::write(&key_path, pem).expect("write key");
        let config_path = dir.path().join("relay.ron");
        Self {
            _dir: dir,
            config_path,
            key_path,
        }
    }

    fn write_ron(&self, body: &str) {
        std::fs::write(&self.config_path, body).expect("write config");
    }

    fn example_ron(&self) -> String {
        self.ron_for_port(8081)
    }

    fn ron_for_port(&self, port: u16) -> String {
        format!(
            r#"RelayConfiguration(
  course_run: "2026-autumn",
  backend_endpoint: "https://example.edu/api/completion-claims",
  listen_port: {port},
  key: (
    kid: "lab-host-a-2026-01",
    private_key_path: "{}",
  ),
)
"#,
            escape_ron_string(self.key_path.to_str().expect("utf-8 path"))
        )
    }
}

fn escape_ron_string(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn public_key_hex(config: &config::RelayConfiguration) -> String {
    let bytes = config.signing_key().verifying_key().to_bytes();
    bytes.iter().map(|b| format!("{b:02X}")).collect()
}

#[test]
fn example_configuration_loads_and_derives_expected_public_key() {
    let fx = Fixture::with_key_pem(RFC8032_TV1_PKCS8_PEM);
    fx.write_ron(&fx.example_ron());

    let loaded = config::load(Path::new(&fx.config_path)).expect("valid configuration");
    assert_eq!(public_key_hex(&loaded), RFC8032_TV1_PUBLIC_KEY_HEX);
    assert_eq!(
        loaded.backend_endpoint(),
        "https://example.edu/api/completion-claims"
    );
}

#[test]
fn unknown_fields_reject() {
    let fx = Fixture::with_key_pem(RFC8032_TV1_PKCS8_PEM);
    let mut ron = fx.example_ron();
    // Insert before the closing paren of RelayConfiguration.
    let insert_at = ron.rfind(')').expect("closing paren");
    ron.insert_str(insert_at, ",\n  extra: true,\n");
    fx.write_ron(&ron);

    let err = config::load(Path::new(&fx.config_path)).expect_err("unknown field");
    assert!(
        matches!(err, config::ConfigError::Parse(_)),
        "expected parse rejection, got {err:?}"
    );
}

#[test]
fn invalid_course_run_rejects() {
    let fx = Fixture::with_key_pem(RFC8032_TV1_PKCS8_PEM);
    let ron = fx.example_ron().replace("2026-autumn", "NOT_VALID");
    fx.write_ron(&ron);

    let err = config::load(Path::new(&fx.config_path)).expect_err("invalid course_run");
    assert!(
        matches!(err, config::ConfigError::InvalidCourseRun(_)),
        "got {err:?}"
    );
}

#[test]
fn invalid_kid_rejects() {
    let fx = Fixture::with_key_pem(RFC8032_TV1_PKCS8_PEM);
    let ron = fx.example_ron().replace("lab-host-a-2026-01", "bad kid");
    fx.write_ron(&ron);

    let err = config::load(Path::new(&fx.config_path)).expect_err("invalid kid");
    assert!(
        matches!(err, config::ConfigError::InvalidKid(_)),
        "got {err:?}"
    );
}

#[test]
fn port_zero_rejects() {
    let fx = Fixture::with_key_pem(RFC8032_TV1_PKCS8_PEM);
    let ron = fx
        .example_ron()
        .replace("listen_port: 8081", "listen_port: 0");
    fx.write_ron(&ron);

    let err = config::load(Path::new(&fx.config_path)).expect_err("port zero");
    assert!(
        matches!(err, config::ConfigError::InvalidListenPort),
        "got {err:?}"
    );
}

#[test]
fn non_http_backend_endpoint_rejects() {
    let fx = Fixture::with_key_pem(RFC8032_TV1_PKCS8_PEM);
    let ron = fx.example_ron().replace(
        "https://example.edu/api/completion-claims",
        "ftp://example.edu/api/completion-claims",
    );
    fx.write_ron(&ron);

    let err = config::load(Path::new(&fx.config_path)).expect_err("non-http endpoint");
    assert!(
        matches!(err, config::ConfigError::InvalidBackendEndpoint),
        "got {err:?}"
    );
}

#[test]
fn relative_backend_endpoint_rejects() {
    let fx = Fixture::with_key_pem(RFC8032_TV1_PKCS8_PEM);
    let ron = fx.example_ron().replace(
        "https://example.edu/api/completion-claims",
        "/api/completion-claims",
    );
    fx.write_ron(&ron);

    let err = config::load(Path::new(&fx.config_path)).expect_err("relative endpoint");
    assert!(
        matches!(err, config::ConfigError::InvalidBackendEndpoint),
        "got {err:?}"
    );
}

#[test]
fn relative_private_key_path_rejects() {
    let fx = Fixture::with_key_pem(RFC8032_TV1_PKCS8_PEM);
    let ron = r#"RelayConfiguration(
  course_run: "2026-autumn",
  backend_endpoint: "https://example.edu/api/completion-claims",
  listen_port: 8081,
  key: (
    kid: "lab-host-a-2026-01",
    private_key_path: "relative/completion-relay.pem",
  ),
)
"#
    .to_string();
    fx.write_ron(&ron);

    let err = config::load(Path::new(&fx.config_path)).expect_err("relative key path");
    assert!(
        matches!(err, config::ConfigError::RelativePrivateKeyPath),
        "got {err:?}"
    );
}

#[test]
fn unusable_private_key_rejects() {
    let fx = Fixture::with_key_pem("not-a-pem-key\n");
    fx.write_ron(&fx.example_ron());

    let err = config::load(Path::new(&fx.config_path)).expect_err("unusable key");
    assert!(
        matches!(err, config::ConfigError::UnusablePrivateKey { .. }),
        "got {err:?}"
    );
}

#[test]
fn missing_required_field_rejects() {
    let fx = Fixture::with_key_pem(RFC8032_TV1_PKCS8_PEM);
    let ron = format!(
        r#"RelayConfiguration(
  course_run: "2026-autumn",
  listen_port: 8081,
  key: (
    kid: "lab-host-a-2026-01",
    private_key_path: "{}",
  ),
)
"#,
        escape_ron_string(fx.key_path.to_str().expect("utf-8 path"))
    );
    fx.write_ron(&ron);

    let err = config::load(Path::new(&fx.config_path)).expect_err("missing field");
    assert!(matches!(err, config::ConfigError::Parse(_)), "got {err:?}");
}

// --- CLI / process seam ----------------------------------------------------

use std::io::{BufRead, BufReader};
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4, TcpListener, TcpStream};
use std::process::{Command, Stdio};

fn free_loopback_port() -> u16 {
    TcpListener::bind(SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0)))
        .expect("bind ephemeral")
        .local_addr()
        .expect("local_addr")
        .port()
}

fn relay_bin() -> &'static str {
    env!("CARGO_BIN_EXE_completion-relay")
}

#[test]
fn serve_binds_configured_ipv4_loopback_port() {
    let port = free_loopback_port();
    let fx = Fixture::with_key_pem(RFC8032_TV1_PKCS8_PEM);
    fx.write_ron(&fx.ron_for_port(port));

    let mut child = Command::new(relay_bin())
        .args(["serve", "--config"])
        .arg(&fx.config_path)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn serve");

    let stderr = child.stderr.take().expect("stderr");
    let expected_addr = format!("127.0.0.1:{port}");
    let line = BufReader::new(stderr)
        .lines()
        .next()
        .expect("serve should emit a listen diagnostic")
        .expect("read stderr");
    assert!(
        line.contains(&expected_addr),
        "production local_addr not observed; line={line}"
    );

    let addr = SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::LOCALHOST, port));
    TcpStream::connect(addr).unwrap_or_else(|err| {
        let _ = child.kill();
        let _ = child.wait();
        panic!("single connect after listen diagnostic failed: {err}");
    });

    let _ = child.kill();
    let _ = child.wait();
}

#[test]
fn invalid_configuration_rejects_before_bind() {
    let occupied = TcpListener::bind(SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0)))
        .expect("occupy loopback port");
    let port = occupied.local_addr().expect("local_addr").port();

    let fx = Fixture::with_key_pem(RFC8032_TV1_PKCS8_PEM);
    // Invalid: relative private key path, but listen_port matches the occupied port.
    let ron = format!(
        r#"RelayConfiguration(
  course_run: "2026-autumn",
  backend_endpoint: "https://example.edu/api/completion-claims",
  listen_port: {port},
  key: (
    kid: "lab-host-a-2026-01",
    private_key_path: "relative/completion-relay.pem",
  ),
)
"#
    );
    fx.write_ron(&ron);

    let output = Command::new(relay_bin())
        .args(["serve", "--config"])
        .arg(&fx.config_path)
        .output()
        .expect("run serve");

    assert!(
        !output.status.success(),
        "serve should fail on invalid configuration"
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        !stderr
            .to_ascii_lowercase()
            .contains("address already in use")
            && !stderr.contains("AddrInUse"),
        "validation must fail before bind; stderr={stderr}"
    );
    assert!(
        stderr.contains("private_key_path") || stderr.contains("absolute"),
        "expected path validation diagnostic; stderr={stderr}"
    );

    // Contender still owns the port exclusively.
    assert!(
        TcpListener::bind(occupied.local_addr().unwrap()).is_err(),
        "occupied port should still be held"
    );
    drop(occupied);
}

const UNIQUE_PEM_MARKER: &str = "UNIQUE_PEM_MARKER_9f3a_do_not_echo";

#[test]
fn serve_diagnostics_redact_private_key_bytes() {
    let pem =
        format!("-----BEGIN PRIVATE KEY-----\n{UNIQUE_PEM_MARKER}\n-----END PRIVATE KEY-----\n");
    let fx = Fixture::with_key_pem(&pem);
    fx.write_ron(&fx.example_ron());

    let output = Command::new(relay_bin())
        .args(["serve", "--config"])
        .arg(&fx.config_path)
        .output()
        .expect("run serve");

    assert!(!output.status.success(), "unusable key must fail serve");
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        !stdout.contains(UNIQUE_PEM_MARKER) && !stderr.contains(UNIQUE_PEM_MARKER),
        "diagnostics must not contain PEM marker; stdout={stdout} stderr={stderr}"
    );
    assert!(
        stderr.contains(fx.key_path.to_str().unwrap()) || stderr.contains("private key"),
        "diagnostics may name the key path; stderr={stderr}"
    );
}
