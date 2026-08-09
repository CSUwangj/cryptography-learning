//! Binary-process seam for `completion-relay key generate` (#40).

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use ed25519_dalek::SigningKey;
use ed25519_dalek::pkcs8::DecodePrivateKey;
use tempfile::TempDir;

fn relay_bin() -> &'static str {
    env!("CARGO_BIN_EXE_completion-relay")
}

fn run_generate(kid: &str, private_key: &Path) -> std::process::Output {
    run_generate_with_umask(kid, private_key, None)
}

fn run_generate_with_umask(
    kid: &str,
    private_key: &Path,
    child_umask: Option<u32>,
) -> std::process::Output {
    let mut cmd = Command::new(relay_bin());
    cmd.args(["key", "generate", "--kid", kid, "--private-key"])
        .arg(private_key);
    if let Some(mask) = child_umask {
        // Restrictive inherited umask must not weaken the required exact mode 0600.
        unsafe {
            cmd.pre_exec(move || {
                let _ = libc::umask(mask as libc::mode_t);
                Ok(())
            });
        }
    }
    cmd.output().expect("spawn completion-relay key generate")
}

fn public_key_hex_from_pem(pem: &str) -> String {
    let signing = SigningKey::from_pkcs8_pem(pem).expect("PEM must parse as Ed25519 PKCS#8");
    signing
        .verifying_key()
        .to_bytes()
        .iter()
        .map(|b| format!("{b:02X}"))
        .collect()
}

fn parse_registration_ron(stdout: &str) -> (String, String) {
    // Exact success shape: (kid: "...", public_key_hex: "..."),\n
    let line = stdout
        .strip_suffix('\n')
        .expect("stdout must end with a single newline");
    assert!(
        !line.contains('\n'),
        "stdout must be exactly one line plus trailing newline; got {stdout:?}"
    );
    assert!(
        line.starts_with("(kid: \"") && line.ends_with("\"),"),
        "unexpected RON shape: {line:?}"
    );
    let rest = line.strip_prefix("(kid: \"").unwrap();
    let (kid, rest) = rest
        .split_once("\", public_key_hex: \"")
        .expect("kid / public_key_hex separator");
    let hex = rest.strip_suffix("\"),").expect("closing quote and comma");
    (kid.to_owned(), hex.to_owned())
}

#[test]
fn successful_generation_writes_pem_and_emits_matching_ron() {
    let dir = TempDir::new().expect("tempdir");
    let key_path: PathBuf = dir.path().join("completion-relay.pem");
    let kid = "lab-host-a-2026-01";

    // umask 0777 would zero OpenOptions::mode bits; exact 0600 must still hold.
    let output = run_generate_with_umask(kid, &key_path, Some(0o777));

    assert!(
        output.status.success(),
        "expected success; status={:?} stderr={}",
        output.status,
        String::from_utf8_lossy(&output.stderr)
    );

    let stdout = String::from_utf8(output.stdout.clone()).expect("stdout utf-8");
    let stderr = String::from_utf8(output.stderr.clone()).expect("stderr utf-8");

    let (emitted_kid, emitted_hex) = parse_registration_ron(&stdout);
    assert_eq!(emitted_kid, kid);

    let pem = fs::read_to_string(&key_path).expect("read generated PEM");
    let derived_hex = public_key_hex_from_pem(&pem);
    assert_eq!(emitted_hex, derived_hex);

    let mode = fs::metadata(&key_path)
        .expect("metadata")
        .permissions()
        .mode()
        & 0o777;
    assert_eq!(mode, 0o600, "Linux mode must be exactly 0600");

    assert!(
        !stdout.contains(&pem) && !stderr.contains(&pem),
        "generated PEM must not appear on stdout or stderr"
    );
    // Strip PEM armor so body lines (private material) are also checked.
    for line in pem.lines() {
        if line.starts_with("-----") || line.is_empty() {
            continue;
        }
        assert!(
            !stdout.contains(line) && !stderr.contains(line),
            "private-key PEM body must not appear on stdout/stderr"
        );
    }
}

#[test]
fn invalid_kid_fails_without_creating_destination() {
    let dir = TempDir::new().expect("tempdir");
    let key_path: PathBuf = dir.path().join("completion-relay.pem");
    let invalid_kid = "bad kid!"; // spaces and '!' are outside KeyId grammar

    let output = run_generate(invalid_kid, &key_path);

    assert!(
        !output.status.success(),
        "expected failure for invalid kid; status={:?}",
        output.status
    );
    assert!(
        !key_path.exists(),
        "destination must not be created when kid is invalid"
    );

    let stdout = String::from_utf8(output.stdout).expect("stdout utf-8");
    let stderr = String::from_utf8(output.stderr).expect("stderr utf-8");
    assert!(stdout.is_empty(), "stdout must be empty; got {stdout:?}");
    assert!(!stderr.trim().is_empty(), "stderr must carry a diagnostic");
}

#[test]
fn existing_destination_is_refused_and_unchanged() {
    let dir = TempDir::new().expect("tempdir");
    let key_path: PathBuf = dir.path().join("completion-relay.pem");
    let seed = b"SEED-CONTENTS-DO-NOT-OVERWRITE\n";
    fs::write(&key_path, seed).expect("seed destination");

    let output = run_generate("lab-host-a-2026-01", &key_path);

    assert!(
        !output.status.success(),
        "expected failure when destination exists; status={:?}",
        output.status
    );

    let after = fs::read(&key_path).expect("read destination after refusal");
    assert_eq!(
        after, seed,
        "destination must remain byte-for-byte unchanged"
    );

    let stdout = String::from_utf8(output.stdout).expect("stdout utf-8");
    let stderr = String::from_utf8(output.stderr).expect("stderr utf-8");
    assert!(stdout.is_empty(), "stdout must be empty; got {stdout:?}");
    assert!(!stderr.trim().is_empty(), "stderr must carry a diagnostic");

    let seed_text = String::from_utf8_lossy(seed);
    assert!(
        !stdout.contains(seed_text.as_ref()) && !stderr.contains(seed_text.as_ref()),
        "seeded contents must not be echoed on stdout or stderr"
    );
}
