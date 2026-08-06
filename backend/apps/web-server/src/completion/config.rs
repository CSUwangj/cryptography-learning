//! Completion policy configuration: strict RON parse and trust registry.

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::str::FromStr;

use completion_claims::{CourseRunId, KeyId};
use ed25519_dalek::VerifyingKey;
use serde::Deserialize;
use thiserror::Error;

/// Validated, immutable Completion policy for the process lifetime.
#[derive(Debug, Clone)]
pub struct CompletionPolicy {
    course_run: CourseRunId,
    trusted_keys: HashMap<KeyId, VerifyingKey>,
}

impl CompletionPolicy {
    pub fn course_run(&self) -> &CourseRunId {
        &self.course_run
    }

    pub fn verifying_key(&self, kid: &KeyId) -> Option<VerifyingKey> {
        self.trusted_keys.get(kid).copied()
    }

    /// Load and validate Completion policy from a RON file.
    pub fn load_from_path(path: &Path) -> Result<Self, CompletionConfigError> {
        let text = std::fs::read_to_string(path).map_err(|err| CompletionConfigError::Read {
            path: path.display().to_string(),
            message: err.to_string(),
        })?;
        Self::parse(&text)
    }

    /// Parse and validate Completion policy RON text.
    pub fn parse(text: &str) -> Result<Self, CompletionConfigError> {
        let raw: RawCompletionConfiguration =
            ron::from_str(text).map_err(|err| CompletionConfigError::Parse(err.to_string()))?;
        Self::from_raw(raw)
    }

    fn from_raw(raw: RawCompletionConfiguration) -> Result<Self, CompletionConfigError> {
        let course_run = CourseRunId::from_str(&raw.course_run)
            .map_err(|_| CompletionConfigError::InvalidCourseRun(raw.course_run.clone()))?;

        if raw.trusted_keys.is_empty() {
            return Err(CompletionConfigError::EmptyTrustedKeys);
        }

        let mut trusted_keys = HashMap::new();
        let mut seen_public_keys = HashSet::new();

        for entry in raw.trusted_keys {
            let kid = KeyId::from_str(&entry.kid)
                .map_err(|_| CompletionConfigError::InvalidKeyId(entry.kid.clone()))?;
            let verifying_key = parse_public_key_hex(&entry.public_key_hex)?;
            let key_bytes = verifying_key.to_bytes();
            if !seen_public_keys.insert(key_bytes) {
                return Err(CompletionConfigError::DuplicatePublicKey);
            }
            if trusted_keys.insert(kid.clone(), verifying_key).is_some() {
                return Err(CompletionConfigError::DuplicateKeyId(kid.to_string()));
            }
        }

        Ok(Self {
            course_run,
            trusted_keys,
        })
    }
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum CompletionConfigError {
    #[error("failed to read Completion configuration at {path}: {message}")]
    Read { path: String, message: String },

    #[error("failed to parse Completion configuration: {0}")]
    Parse(String),

    #[error("invalid course_run `{0}`")]
    InvalidCourseRun(String),

    #[error("trusted_keys must contain at least one entry")]
    EmptyTrustedKeys,

    #[error("invalid key id `{0}`")]
    InvalidKeyId(String),

    #[error("invalid public_key_hex: expected exactly 64 ASCII hexadecimal characters")]
    InvalidPublicKeyHex,

    #[error("public_key_hex is not a valid Ed25519 verifying key")]
    InvalidVerifyingKey,

    #[error("duplicate trusted key id `{0}`")]
    DuplicateKeyId(String),

    #[error("duplicate trusted public key")]
    DuplicatePublicKey,
}

#[derive(Debug, Deserialize)]
#[serde(rename = "CompletionConfiguration", deny_unknown_fields)]
struct RawCompletionConfiguration {
    course_run: String,
    trusted_keys: Vec<RawTrustedKey>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawTrustedKey {
    kid: String,
    public_key_hex: String,
}

fn parse_public_key_hex(hex: &str) -> Result<VerifyingKey, CompletionConfigError> {
    if hex.len() != 64 || !hex.is_ascii() || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(CompletionConfigError::InvalidPublicKeyHex);
    }
    let mut bytes = [0u8; 32];
    for (i, chunk) in hex.as_bytes().chunks(2).enumerate() {
        let s = std::str::from_utf8(chunk).expect("ASCII hex checked");
        bytes[i] =
            u8::from_str_radix(s, 16).map_err(|_| CompletionConfigError::InvalidPublicKeyHex)?;
    }
    VerifyingKey::from_bytes(&bytes).map_err(|_| CompletionConfigError::InvalidVerifyingKey)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// RFC 8032 test-vector-1 public key (uppercase).
    const PUBKEY_HEX: &str = "D75A980182B10AB7D54BFED3C964073A0EE172F3DAA62325AF021A68F707511A";

    fn valid_ron() -> String {
        format!(
            r#"CompletionConfiguration(
              course_run: "2026-autumn",
              trusted_keys: [
                (
                  kid: "lab-host-a-2026-01",
                  public_key_hex: "{PUBKEY_HEX}",
                ),
              ],
            )"#
        )
    }

    #[test]
    fn parses_valid_completion_configuration() {
        let policy = CompletionPolicy::parse(&valid_ron()).expect("valid config");
        assert_eq!(policy.course_run().as_str(), "2026-autumn");
        let kid = KeyId::from_str("lab-host-a-2026-01").unwrap();
        assert!(policy.verifying_key(&kid).is_some());
    }

    #[test]
    fn accepts_lowercase_public_key_hex() {
        let ron = valid_ron().replace(PUBKEY_HEX, &PUBKEY_HEX.to_ascii_lowercase());
        assert!(CompletionPolicy::parse(&ron).is_ok());
    }

    #[test]
    fn rejects_empty_trusted_keys() {
        let ron = r#"CompletionConfiguration(
            course_run: "2026-autumn",
            trusted_keys: [],
        )"#;
        assert_eq!(
            CompletionPolicy::parse(ron).unwrap_err(),
            CompletionConfigError::EmptyTrustedKeys
        );
    }

    #[test]
    fn rejects_invalid_course_run() {
        let ron = format!(
            r#"CompletionConfiguration(
              course_run: "NOT_VALID",
              trusted_keys: [(kid: "lab-host-a-2026-01", public_key_hex: "{PUBKEY_HEX}")],
            )"#
        );
        assert!(matches!(
            CompletionPolicy::parse(&ron).unwrap_err(),
            CompletionConfigError::InvalidCourseRun(_)
        ));
    }

    #[test]
    fn rejects_duplicate_key_ids() {
        let ron = format!(
            r#"CompletionConfiguration(
              course_run: "2026-autumn",
              trusted_keys: [
                (kid: "lab-host-a-2026-01", public_key_hex: "{PUBKEY_HEX}"),
                (kid: "lab-host-a-2026-01", public_key_hex: "3D4017C3E843895A92B70AA74D1B7EBC9C982CCF2EC4968CC0CD55F12AF4660C"),
              ],
            )"#
        );
        assert!(matches!(
            CompletionPolicy::parse(&ron).unwrap_err(),
            CompletionConfigError::DuplicateKeyId(_)
        ));
    }

    #[test]
    fn rejects_duplicate_public_keys() {
        let ron = format!(
            r#"CompletionConfiguration(
              course_run: "2026-autumn",
              trusted_keys: [
                (kid: "lab-host-a-2026-01", public_key_hex: "{PUBKEY_HEX}"),
                (kid: "lab-host-b-2026-01", public_key_hex: "{PUBKEY_HEX}"),
              ],
            )"#
        );
        assert_eq!(
            CompletionPolicy::parse(&ron).unwrap_err(),
            CompletionConfigError::DuplicatePublicKey
        );
    }

    #[test]
    fn rejects_prefixed_or_wrong_length_public_key_hex() {
        for bad in [
            "0xD75A980182B10AB7D54BFED3C964073A0EE172F3DAA62325AF021A68F707511A",
            "D75A980182B10AB7D54BFED3C964073A0EE172F3DAA62325AF021A68F707511",
            " D75A980182B10AB7D54BFED3C964073A0EE172F3DAA62325AF021A68F707511A",
        ] {
            let ron = format!(
                r#"CompletionConfiguration(
                  course_run: "2026-autumn",
                  trusted_keys: [(kid: "lab-host-a-2026-01", public_key_hex: "{bad}")],
                )"#
            );
            assert_eq!(
                CompletionPolicy::parse(&ron).unwrap_err(),
                CompletionConfigError::InvalidPublicKeyHex,
                "hex={bad:?}"
            );
        }
    }

    #[test]
    fn rejects_unknown_fields() {
        let ron = format!(
            r#"CompletionConfiguration(
              course_run: "2026-autumn",
              trusted_keys: [(kid: "lab-host-a-2026-01", public_key_hex: "{PUBKEY_HEX}")],
              extra: true,
            )"#
        );
        assert!(matches!(
            CompletionPolicy::parse(&ron).unwrap_err(),
            CompletionConfigError::Parse(_)
        ));
    }
}
