use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4, TcpListener, TcpStream};
use std::process::Command;
use std::thread;
use std::time::Duration;

use tempfile::tempdir;

fn backend_bin() -> &'static str {
    env!("CARGO_BIN_EXE_cryptography-learning-backend")
}

fn free_loopback_port() -> u16 {
    TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0))
        .expect("bind ephemeral")
        .local_addr()
        .expect("local address")
        .port()
}

#[test]
fn sqlite_version_diagnostic_reports_runtime_without_bootstrap() {
    let empty_working_directory = tempdir().expect("tempdir");
    let output = Command::new(backend_bin())
        .args([
            "--static",
            "/does-not-need-to-exist",
            "--print-sqlite-version",
        ])
        .current_dir(empty_working_directory.path())
        .output()
        .expect("run SQLite version diagnostic");

    assert!(
        output.status.success(),
        "diagnostic should exit successfully; stderr={}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(
        output.stderr.is_empty(),
        "diagnostic should not emit lifecycle logs; stderr={}",
        String::from_utf8_lossy(&output.stderr)
    );

    let stdout = String::from_utf8(output.stdout).expect("diagnostic stdout is UTF-8");
    let version = stdout
        .strip_prefix("sqlite_version=")
        .and_then(|value| value.strip_suffix('\n'))
        .expect("diagnostic should emit one machine-readable version line");
    assert!(
        !version.is_empty() && !version.contains('\n'),
        "unexpected version line: {stdout:?}"
    );
}

#[test]
fn normal_startup_loads_static_and_config_from_dotenv() {
    let working_directory = tempdir().expect("tempdir");
    let static_root = working_directory.path().join("www");
    std::fs::create_dir(&static_root).expect("create static root");
    std::fs::write(static_root.join("index.html"), "<!doctype html>").expect("write index");

    let config_path = working_directory.path().join("from-dotenv.ron");
    std::fs::write(
        &config_path,
        "Configuration(schema_version: 1, practice: (lab_categories: []))",
    )
    .expect("write configuration");

    let address = SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::LOCALHOST, free_loopback_port()));
    std::fs::write(
        working_directory.path().join(".env"),
        format!(
            "STATIC={}\nCONFIG={}\n",
            static_root.display(),
            config_path.display(),
        ),
    )
    .expect("write .env");

    let mut child = Command::new(backend_bin())
        .arg("--access-point")
        .arg(address.to_string())
        .current_dir(working_directory.path())
        .spawn()
        .expect("start server from .env");

    for _ in 0..100 {
        if TcpStream::connect(address).is_ok() {
            let _ = child.kill();
            let _ = child.wait();
            return;
        }
        if let Some(status) = child.try_wait().expect("check server status") {
            panic!("server exited before binding with status {status}");
        }
        thread::sleep(Duration::from_millis(10));
    }

    let _ = child.kill();
    let _ = child.wait();
    panic!("server did not bind {address} from .env options");
}
