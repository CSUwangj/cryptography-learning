//! Operator command: `completion-relay key generate`.

use std::fs::{OpenOptions, Permissions};
use std::io::Write;
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::Path;
use std::str::FromStr;

use completion_claims::KeyId;
use ed25519_dalek::SigningKey;
use ed25519_dalek::pkcs8::EncodePrivateKey;
use getrandom::SysRng;
use getrandom::rand_core::UnwrapErr;
use thiserror::Error;

/// Failures from `key generate`. Diagnostics must never include private-key material.
#[derive(Debug, Error)]
pub enum GenerateError {
    #[error("invalid kid `{0}`")]
    InvalidKid(String),

    #[error("failed to create private key at {path}: {message}")]
    Create { path: String, message: String },

    #[error("failed to set permissions on private key at {path}: {message}")]
    Permissions { path: String, message: String },

    #[error("failed to write private key at {path}: {message}")]
    Write { path: String, message: String },

    #[error("failed to encode private key")]
    Encode,
}

/// Generate an Ed25519 PKCS#8 PEM at `private_key` and return the registration RON line
/// (including trailing newline) for stdout.
pub fn generate(kid: &str, private_key: &Path) -> Result<String, GenerateError> {
    let kid = KeyId::from_str(kid).map_err(|_| GenerateError::InvalidKid(kid.to_owned()))?;

    let mut csprng = UnwrapErr(SysRng);
    let signing_key = SigningKey::generate(&mut csprng);
    let pem = signing_key
        .to_pkcs8_pem(Default::default())
        .map_err(|_| GenerateError::Encode)?;

    let path_display = private_key.display().to_string();
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(private_key)
        .map_err(|err| GenerateError::Create {
            path: path_display.clone(),
            message: err.to_string(),
        })?;

    // OpenOptions::mode is filtered by umask; set the required exact mode before writing.
    file.set_permissions(Permissions::from_mode(0o600))
        .map_err(|err| GenerateError::Permissions {
            path: path_display.clone(),
            message: err.to_string(),
        })?;

    file.write_all(pem.as_bytes())
        .map_err(|err| GenerateError::Write {
            path: path_display,
            message: err.to_string(),
        })?;

    let public_key_hex: String = signing_key
        .verifying_key()
        .to_bytes()
        .iter()
        .map(|b| format!("{b:02X}"))
        .collect();

    Ok(format!(
        "(kid: \"{}\", public_key_hex: \"{public_key_hex}\"),\n",
        kid.as_str()
    ))
}
