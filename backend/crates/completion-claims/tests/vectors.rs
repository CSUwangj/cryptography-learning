//! Protocol vector integration tests for version-1 Completion Evidence.

use std::fs;
use std::path::PathBuf;

use completion_claims::{
    CompletedAt, CompletionEvidence, CourseRunId, EVIDENCE_VERSION, KeyId, LabId, StudentId,
    VerificationError, sign_compact, verify_compact,
};
use ed25519_dalek::SigningKey;
use serde::Deserialize;

fn vectors_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/vectors")
}

fn test_seed() -> [u8; 32] {
    let hex = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
    let bytes = decode_hex(hex);
    bytes.try_into().expect("seed is 32 bytes")
}

fn decode_hex(hex: &str) -> Vec<u8> {
    assert!(hex.len().is_multiple_of(2), "hex length");
    (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).expect("hex byte"))
        .collect()
}

fn parse_verification_error(name: &str) -> VerificationError {
    match name {
        "MalformedCompact" => VerificationError::MalformedCompact,
        "MalformedProtectedHeader" => VerificationError::MalformedProtectedHeader,
        "UnsupportedAlgorithm" => VerificationError::UnsupportedAlgorithm,
        "InvalidKeyId" => VerificationError::InvalidKeyId,
        "UnknownKey" => VerificationError::UnknownKey,
        "MalformedSignature" => VerificationError::MalformedSignature,
        "InvalidSignature" => VerificationError::InvalidSignature,
        "MalformedPayload" => VerificationError::MalformedPayload,
        "UnsupportedVersion" => VerificationError::UnsupportedVersion,
        "InvalidCourseRunId" => VerificationError::InvalidCourseRunId,
        "InvalidLabId" => VerificationError::InvalidLabId,
        "InvalidStudentId" => VerificationError::InvalidStudentId,
        "InvalidCompletedAt" => VerificationError::InvalidCompletedAt,
        other => panic!("unknown VerificationError variant in fixture: {other}"),
    }
}

#[derive(Debug, Deserialize)]
struct ValidVector {
    label: String,
    seed_hex: String,
    public_key_hex: String,
    kid: String,
    course_run: String,
    lab: String,
    student: String,
    completed_at: String,
    compact_jws: String,
}

#[derive(Debug, Deserialize)]
struct InvalidCase {
    name: String,
    token: String,
    error: String,
}

#[test]
fn normative_v1_vector_signs_and_verifies_exactly() {
    let path = vectors_dir().join("v1-valid.json");
    let raw = fs::read_to_string(&path).expect("read v1-valid.json");
    let vector: ValidVector = serde_json::from_str(&raw).expect("parse v1-valid.json");

    assert!(
        vector.label.contains("TEST ONLY"),
        "fixture must label the seed as test-only"
    );
    assert_eq!(
        vector.seed_hex,
        "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60"
    );

    let seed: [u8; 32] = decode_hex(&vector.seed_hex)
        .try_into()
        .expect("seed length");
    let signing_key = SigningKey::from_bytes(&seed);
    let verifying_key = signing_key.verifying_key();
    assert_eq!(
        decode_hex(&vector.public_key_hex),
        verifying_key.as_bytes().as_slice(),
        "derived public key must match RFC 8032 / fixture"
    );

    let evidence = CompletionEvidence::new(
        vector.course_run.parse::<CourseRunId>().unwrap(),
        vector.lab.parse::<LabId>().unwrap(),
        vector.student.parse::<StudentId>().unwrap(),
        vector.completed_at.parse::<CompletedAt>().unwrap(),
    );
    let kid: KeyId = vector.kid.parse().unwrap();

    let signed = sign_compact(&evidence, &kid, &signing_key);
    assert_eq!(signed.as_str(), vector.compact_jws);
    assert_eq!(EVIDENCE_VERSION, 1);

    let verified = verify_compact(signed.as_str(), |key_id| {
        (key_id == &kid).then_some(verifying_key)
    })
    .expect("normative token must verify");

    assert_eq!(verified.token().as_str(), vector.compact_jws);
    assert_eq!(verified.key_id(), &kid);
    assert_eq!(verified.evidence(), &evidence);
    assert_eq!(verified.evidence().course_run().as_str(), "2026-autumn");
    assert_eq!(verified.evidence().lab().as_str(), "spn-basics");
    assert_eq!(verified.evidence().student().as_str(), "20260001");
    assert_eq!(
        verified.evidence().completed_at().to_string(),
        "2026-10-12T08:15:30Z"
    );

    // Committed token through the public API preserves the exact string.
    let verified_committed = verify_compact(&vector.compact_jws, |_| Some(verifying_key))
        .expect("committed compact JWS must verify");
    assert_eq!(verified_committed.token().as_str(), vector.compact_jws);
    assert_eq!(
        verified_committed.into_token().into_string(),
        vector.compact_jws
    );
}

#[test]
fn invalid_v1_vectors_reject_with_expected_errors() {
    let path = vectors_dir().join("v1-invalid.json");
    let raw = fs::read_to_string(&path).expect("read v1-invalid.json");
    let cases: Vec<InvalidCase> = serde_json::from_str(&raw).expect("parse v1-invalid.json");
    assert!(
        cases.len() >= 40,
        "expected broad invalid coverage, got {}",
        cases.len()
    );

    let signing_key = SigningKey::from_bytes(&test_seed());
    let verifying_key = signing_key.verifying_key();
    let trusted_kid: KeyId = "lab-host-a-2026-01".parse().unwrap();

    for case in cases {
        let expected = parse_verification_error(&case.error);
        let result = verify_compact(&case.token, |key_id| {
            if key_id == &trusted_kid {
                Some(verifying_key)
            } else if key_id.as_str() == "unknown-host-key" {
                None
            } else {
                // Still resolve grammar-valid but untrusted kids as unknown.
                None
            }
        });
        assert_eq!(
            result.err(),
            Some(expected),
            "case `{}` token={}",
            case.name,
            // Avoid dumping multi-kilobyte oversize tokens in the assertion message.
            if case.token.len() > 120 {
                format!("{}…(len={})", &case.token[..120], case.token.len())
            } else {
                case.token.clone()
            }
        );
    }
}

#[test]
fn verify_compact_calls_resolver_exactly_once_after_header_validation() {
    let signing_key = SigningKey::from_bytes(&test_seed());
    let verifying_key = signing_key.verifying_key();
    let evidence = CompletionEvidence::new(
        "2026-autumn".parse().unwrap(),
        "spn-basics".parse().unwrap(),
        "20260001".parse().unwrap(),
        "2026-10-12T08:15:30Z".parse().unwrap(),
    );
    let kid: KeyId = "lab-host-a-2026-01".parse().unwrap();
    let signed = sign_compact(&evidence, &kid, &signing_key);

    let mut calls = 0u32;
    let verified = verify_compact(signed.as_str(), |key_id| {
        calls += 1;
        assert_eq!(key_id, &kid);
        Some(verifying_key)
    })
    .unwrap();
    assert_eq!(calls, 1);
    assert_eq!(verified.evidence(), &evidence);

    // Unsupported algorithm must not call the resolver.
    let bad_header = base64::Engine::encode(
        &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        br#"{"alg":"none","kid":"lab-host-a-2026-01"}"#,
    );
    let parts: Vec<_> = signed.as_str().split('.').collect();
    let bad = format!("{bad_header}.{}.{}", parts[1], parts[2]);
    let mut calls = 0u32;
    let err = verify_compact(&bad, |_| {
        calls += 1;
        Some(verifying_key)
    })
    .unwrap_err();
    assert_eq!(err, VerificationError::UnsupportedAlgorithm);
    assert_eq!(calls, 0);
}
