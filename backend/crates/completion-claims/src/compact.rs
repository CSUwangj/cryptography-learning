//! Compact JWS encoding, signing, and verification.

use std::collections::{BTreeMap, BTreeSet};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use serde::Deserialize;
use serde::de::{self, Deserializer, MapAccess, Visitor};
use serde_json::Value;
use serde_json::value::RawValue;

use crate::completed_at::CompletedAt;
use crate::error::VerificationError;
use crate::evidence::{
    CompletionEvidence, EVIDENCE_VERSION, SignedCompletionEvidence, VerifiedCompletionEvidence,
};
use crate::ids::{CourseRunId, KeyId, LabId, StudentId};

const MAX_COMPACT_BYTES: usize = 2048;
const SIGNATURE_LEN: usize = 64;

/// Sign validated Completion Evidence as a deterministic version-1 compact JWS.
#[must_use]
pub fn sign_compact(
    evidence: &CompletionEvidence,
    key_id: &KeyId,
    signing_key: &SigningKey,
) -> SignedCompletionEvidence {
    let header = format!(
        "{{\"alg\":\"EdDSA\",\"kid\":{}}}",
        serde_json::to_string(key_id.as_str()).expect("string JSON serialization is infallible")
    );
    let payload = format!(
        "{{\"v\":{EVIDENCE_VERSION},\"course_run\":{},\"lab\":{},\"student\":{},\"completed_at\":{}}}",
        json_string(evidence.course_run().as_str()),
        json_string(evidence.lab().as_str()),
        json_string(evidence.student().as_str()),
        json_string(&evidence.completed_at().to_string()),
    );

    let header_b64 = URL_SAFE_NO_PAD.encode(header.as_bytes());
    let payload_b64 = URL_SAFE_NO_PAD.encode(payload.as_bytes());
    let signing_input = format!("{header_b64}.{payload_b64}");
    let signature = signing_key.sign(signing_input.as_bytes());
    let signature_b64 = URL_SAFE_NO_PAD.encode(signature.to_bytes());
    SignedCompletionEvidence::from_validated_token(format!("{signing_input}.{signature_b64}"))
}

/// Verify a compact Completion Evidence token using a caller-resolved verifying key.
///
/// `resolve_key` is invoked exactly once after header algorithm and key-ID
/// validation. Returning `None` yields [`VerificationError::UnknownKey`].
pub fn verify_compact<F>(
    token: &str,
    resolve_key: F,
) -> Result<VerifiedCompletionEvidence, VerificationError>
where
    F: FnOnce(&KeyId) -> Option<VerifyingKey>,
{
    // 1. Length, three-segment shape, canonical base64url for all segments.
    if token.len() > MAX_COMPACT_BYTES || !token.is_ascii() {
        return Err(VerificationError::MalformedCompact);
    }
    let segments: Vec<&str> = token.split('.').collect();
    if segments.len() != 3 {
        return Err(VerificationError::MalformedCompact);
    }
    let (header_b64, payload_b64, signature_b64) = (segments[0], segments[1], segments[2]);
    if header_b64.is_empty() || payload_b64.is_empty() || signature_b64.is_empty() {
        return Err(VerificationError::MalformedCompact);
    }
    let header_bytes = decode_canonical_b64url(header_b64)?;
    let payload_bytes = decode_canonical_b64url(payload_b64)?;
    let signature_bytes = decode_canonical_b64url(signature_b64)?;

    // 2. Protected header object with exactly alg + kid strings.
    let header_map = parse_unique_object(&header_bytes)
        .map_err(|_| VerificationError::MalformedProtectedHeader)?;
    if header_map.len() != 2 || !header_map.contains_key("alg") || !header_map.contains_key("kid") {
        return Err(VerificationError::MalformedProtectedHeader);
    }
    let alg = match header_map.get("alg") {
        Some(Value::String(s)) => s.as_str(),
        _ => return Err(VerificationError::MalformedProtectedHeader),
    };
    let kid_raw = match header_map.get("kid") {
        Some(Value::String(s)) => s.as_str(),
        _ => return Err(VerificationError::MalformedProtectedHeader),
    };

    // 3. Algorithm.
    if alg != "EdDSA" {
        return Err(VerificationError::UnsupportedAlgorithm);
    }

    // 4. Key ID grammar, then resolve trusted key once.
    let key_id: KeyId = kid_raw
        .parse()
        .map_err(|_| VerificationError::InvalidKeyId)?;
    let verifying_key = resolve_key(&key_id).ok_or(VerificationError::UnknownKey)?;

    // 5. Signature length.
    if signature_bytes.len() != SIGNATURE_LEN {
        return Err(VerificationError::MalformedSignature);
    }
    let signature = Signature::from_bytes(
        signature_bytes
            .as_slice()
            .try_into()
            .map_err(|_| VerificationError::MalformedSignature)?,
    );

    // 6. Strict Ed25519 over the original encoded segments.
    let signing_input = format!("{header_b64}.{payload_b64}");
    verifying_key
        .verify_strict(signing_input.as_bytes(), &signature)
        .map_err(|_| VerificationError::InvalidSignature)?;

    // 7–9. Authenticated payload: inspect integer `v` first, then version-1 shape.
    let evidence = parse_authenticated_payload(&payload_bytes)?;
    Ok(VerifiedCompletionEvidence::new(
        SignedCompletionEvidence::from_validated_token(token.to_owned()),
        key_id,
        evidence,
    ))
}

fn parse_authenticated_payload(
    payload_bytes: &[u8],
) -> Result<CompletionEvidence, VerificationError> {
    let entries =
        parse_object_entries(payload_bytes).map_err(|_| VerificationError::MalformedPayload)?;

    let mut v_iter = entries.iter().filter(|(key, _)| key == "v");
    let Some((_, v_raw)) = v_iter.next() else {
        return Err(VerificationError::MalformedPayload);
    };
    if v_iter.next().is_some() {
        // Duplicate `v` means the payload does not contain exactly one version member.
        return Err(VerificationError::MalformedPayload);
    }

    if !version_is_one(v_raw)? {
        // Unsupported versions return before any version-specific shape or
        // duplicate-field checks on other members.
        return Err(VerificationError::UnsupportedVersion);
    }

    let mut seen = BTreeSet::new();
    for (key, _) in &entries {
        if !seen.insert(key.as_str()) {
            return Err(VerificationError::MalformedPayload);
        }
    }

    if entries.len() != 5
        || !seen.contains("course_run")
        || !seen.contains("lab")
        || !seen.contains("student")
        || !seen.contains("completed_at")
    {
        return Err(VerificationError::MalformedPayload);
    }

    let mut course_run = None;
    let mut lab = None;
    let mut student = None;
    let mut completed_at = None;
    for (key, raw) in &entries {
        match key.as_str() {
            "v" => {}
            "course_run" => course_run = Some(json_string_field(raw)?),
            "lab" => lab = Some(json_string_field(raw)?),
            "student" => student = Some(json_string_field(raw)?),
            "completed_at" => completed_at = Some(json_string_field(raw)?),
            _ => return Err(VerificationError::MalformedPayload),
        }
    }

    let course_run: CourseRunId = course_run
        .expect("shape checked")
        .parse()
        .map_err(|_| VerificationError::InvalidCourseRunId)?;
    let lab: LabId = lab
        .expect("shape checked")
        .parse()
        .map_err(|_| VerificationError::InvalidLabId)?;
    let student: StudentId = student
        .expect("shape checked")
        .parse()
        .map_err(|_| VerificationError::InvalidStudentId)?;
    let completed_at: CompletedAt = completed_at
        .expect("shape checked")
        .parse()
        .map_err(|_| VerificationError::InvalidCompletedAt)?;

    Ok(CompletionEvidence::new(
        course_run,
        lab,
        student,
        completed_at,
    ))
}

/// Returns `true` when the raw JSON value is the integer `1`.
///
/// Any other lexical JSON integer is an unsupported version. Non-integers are
/// malformed payload members.
fn version_is_one(raw: &RawValue) -> Result<bool, VerificationError> {
    let token = raw.get().trim();
    if !is_lexical_json_integer(token) {
        return Err(VerificationError::MalformedPayload);
    }
    Ok(token == "1")
}

fn is_lexical_json_integer(token: &str) -> bool {
    let digits = match token.strip_prefix('-') {
        Some(rest) => rest,
        None => token,
    };
    !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit())
}

fn json_string_field(raw: &RawValue) -> Result<String, VerificationError> {
    match serde_json::from_str::<Value>(raw.get()) {
        Ok(Value::String(s)) => Ok(s),
        _ => Err(VerificationError::MalformedPayload),
    }
}

fn json_string(s: &str) -> String {
    serde_json::to_string(s).expect("string JSON serialization is infallible")
}

fn decode_canonical_b64url(segment: &str) -> Result<Vec<u8>, VerificationError> {
    if !segment
        .bytes()
        .all(|b| matches!(b, b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_'))
    {
        return Err(VerificationError::MalformedCompact);
    }
    let decoded = URL_SAFE_NO_PAD
        .decode(segment.as_bytes())
        .map_err(|_| VerificationError::MalformedCompact)?;
    let reencoded = URL_SAFE_NO_PAD.encode(&decoded);
    if reencoded != segment {
        return Err(VerificationError::MalformedCompact);
    }
    Ok(decoded)
}

fn parse_unique_object(bytes: &[u8]) -> Result<BTreeMap<String, Value>, ()> {
    let text = std::str::from_utf8(bytes).map_err(|_| ())?;
    let UniqueObject(map) = serde_json::from_str(text).map_err(|_| ())?;
    Ok(map)
}

fn parse_object_entries(bytes: &[u8]) -> Result<Vec<(String, Box<RawValue>)>, ()> {
    let text = std::str::from_utf8(bytes).map_err(|_| ())?;
    let ObjectEntries(entries) = serde_json::from_str(text).map_err(|_| ())?;
    Ok(entries)
}

struct UniqueObject(BTreeMap<String, Value>);

impl<'de> Deserialize<'de> for UniqueObject {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct UniqueObjectVisitor;

        impl<'de> Visitor<'de> for UniqueObjectVisitor {
            type Value = UniqueObject;

            fn expecting(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str("a JSON object with unique keys")
            }

            fn visit_map<A: MapAccess<'de>>(self, mut access: A) -> Result<Self::Value, A::Error> {
                let mut map = BTreeMap::new();
                while let Some((key, value)) = access.next_entry::<String, Value>()? {
                    if map.contains_key(&key) {
                        return Err(de::Error::custom(format!("duplicate key `{key}`")));
                    }
                    map.insert(key, value);
                }
                Ok(UniqueObject(map))
            }
        }

        deserializer.deserialize_map(UniqueObjectVisitor)
    }
}

struct ObjectEntries(Vec<(String, Box<RawValue>)>);

impl<'de> Deserialize<'de> for ObjectEntries {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct ObjectEntriesVisitor;

        impl<'de> Visitor<'de> for ObjectEntriesVisitor {
            type Value = ObjectEntries;

            fn expecting(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str("a JSON object")
            }

            fn visit_map<A: MapAccess<'de>>(self, mut access: A) -> Result<Self::Value, A::Error> {
                let mut entries = Vec::new();
                while let Some(entry) = access.next_entry::<String, Box<RawValue>>()? {
                    entries.push(entry);
                }
                Ok(ObjectEntries(entries))
            }
        }

        deserializer.deserialize_map(ObjectEntriesVisitor)
    }
}
