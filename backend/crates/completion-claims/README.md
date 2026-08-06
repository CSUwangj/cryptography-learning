# completion-claims

Synchronous library for **version-1 Completion Evidence**: validated value types,
deterministic compact-JWS signing, and strict compact-JWS verification shared by
the Host Completion Relay and the web-server ingestion path.

This crate is transport-, persistence-, clock-, and deployment-independent. It
does not know about HTTP, GraphQL, databases, filesystems, environment
variables, or process configuration.

## Trust model

- Only a **caller-resolved Ed25519 verifying key** establishes trust. The token
  never carries Host identity, permissions, public-key material, URLs, or an
  algorithm implementation.
- The protected-header `kid` is a lookup handle. It is validated for grammar,
  then passed once to the caller's resolver. `None` means the key is unknown.
- Multiple key IDs may map to one Lab Host during rotation. Rotation policy and
  the trust registry live outside this crate (web-server ticket #23; relay
  operations in #24 / private infra).
- After this crate verifies evidence, authorization (#23) requires the signed
  Course Run to match the central backend's singular configured Course Run and
  requires the Lab to exist in its globally unique Practice Lab set. The
  central registry is only `kid -> Ed25519 public key`: every trusted key may
  submit any known Lab for that configured Course Run.
- Replay safety is expected from immutable, idempotent Completion Claims in the
  server, not from nonce, expiry, issuer, or audience claims in the token.
- Verification performs **no** age, future-skew, expiry, or current-clock check.
  Queued and retained evidence remains verifiable indefinitely.

### Explicit non-goals

- Host/Lab authorization, Course Run policy, HTTP ingestion, persistence
- Clock acquisition, signing-key loading, random key generation, relay process
- Confidentiality, DoS protection, or safety against a compromised trusted Host
- Generic JOSE/JWT features (JSON serialization, detached payloads, multiple
  signatures, algorithms other than Ed25519, evidence versions other than 1)

## Version-1 profile

`EVIDENCE_VERSION` is `1`. The signer emits this exact minified protected-header
member order:

```json
{"alg":"EdDSA","kid":"lab-host-a-2026-01"}
```

and this exact minified payload member order:

```json
{"v":1,"course_run":"2026-autumn","lab":"spn-basics","student":"20260001","completed_at":"2026-10-12T08:15:30Z"}
```

Version 1 permits exactly:

| Part | Members |
|------|---------|
| Protected header | string `alg`, string `kid` |
| Payload | integer `v`, string `course_run`, string `lab`, string `student`, string `completed_at` |

Reject missing, duplicate, unknown, or wrongly typed members. In particular,
reject `typ`, `cty`, `crit`, `jwk`, `jku`, certificate fields, and every other
JOSE header parameter. Require `alg` to equal the case-sensitive string
`EdDSA`; the implementation is always pure Ed25519 (`verify_strict`, no
Ed25519ph, no context).

Signing input (RFC 7515):

```text
BASE64URL(UTF8(protected header)) + "." + BASE64URL(UTF8(payload))
```

The signature is a 64-byte Ed25519 signature encoded as the third compact
segment.

The verifier accepts semantically equivalent member ordering, insignificant JSON
whitespace, and valid JSON string escaping for authenticated JSON. It always
verifies the signature over the two **original** encoded segments and never
reserializes untrusted JSON to build the signing input.

## Compact encoding

- Reject input longer than **2,048** ASCII bytes as `MalformedCompact` before
  decoding. Do not trim the token.
- Require exactly three non-empty dot-separated segments.
- Each segment may contain only RFC 4648 base64url characters (`A–Z`, `a–z`,
  `0–9`, `-`, `_`). Reject padding, `+`/`/`, whitespace, and non-ASCII.
- Decode with `URL_SAFE_NO_PAD`, re-encode, and require byte-for-byte equality
  with the original segment (rejects non-zero unused trailing bits).
- A canonically encoded signature that does not decode to exactly 64 bytes is
  `MalformedSignature`.

## Identifier and timestamp rules

All lengths are ASCII byte lengths.

| Type | Grammar / form |
|------|----------------|
| `StudentId` | `^[A-Za-z0-9_-]{1,64}$` (case-sensitive). `from_user_input` trims ASCII whitespace; `FromStr` / payload verification do not. |
| `LabId` / `CourseRunId` | `^[a-z0-9]+(?:-[a-z0-9]+)*$`, length 1–64. Never trim or lowercase. |
| `KeyId` | `^[A-Za-z0-9._-]{1,128}$` (case-sensitive, never trimmed). |
| `CompletedAt` | Exactly `YYYY-MM-DDTHH:MM:SSZ` (UTC, whole seconds, years 0001–9999). No fractions, offsets, lowercase, leap seconds, or other RFC 3339 variants. |

This crate enforces lexical validity only. Existence and authorization of Labs
and Course Runs are decided by callers.

## Public API

```rust
use completion_claims::{
    sign_compact, verify_compact, CompletedAt, CompletionEvidence, CourseRunId,
    KeyId, LabId, StudentId,
};
use ed25519_dalek::SigningKey;

fn example(signing_key: &SigningKey, verifying_key: ed25519_dalek::VerifyingKey) {
    let evidence = CompletionEvidence::new(
        "2026-autumn".parse::<CourseRunId>().unwrap(),
        "spn-basics".parse::<LabId>().unwrap(),
        "20260001".parse::<StudentId>().unwrap(),
        "2026-10-12T08:15:30Z".parse::<CompletedAt>().unwrap(),
    );
    let kid: KeyId = "lab-host-a-2026-01".parse().unwrap();
    let signed = sign_compact(&evidence, &kid, signing_key);

    let verified = verify_compact(signed.as_str(), |key_id| {
        (key_id.as_str() == kid.as_str()).then_some(verifying_key)
    })
    .unwrap();

    assert_eq!(verified.token().as_str(), signed.as_str());
    assert_eq!(verified.key_id(), &kid);
    assert_eq!(verified.evidence(), &evidence);
}
```

`SignedCompletionEvidence` has no unchecked public string constructor.
`VerifiedCompletionEvidence` retains the exact original compact token for
persistence.

## Stable verification errors and precedence

```text
MalformedCompact
MalformedProtectedHeader
UnsupportedAlgorithm
InvalidKeyId
UnknownKey
MalformedSignature
InvalidSignature
MalformedPayload
UnsupportedVersion
InvalidCourseRunId
InvalidLabId
InvalidStudentId
InvalidCompletedAt
```

Failures apply in this order:

1. Input length, three-segment shape, canonical base64url for all segments
2. Protected header UTF-8 JSON object with exactly the two correctly typed fields
3. `alg == "EdDSA"`
4. Validate `kid`, then resolve the trusted key (`None` → `UnknownKey`)
5. Decoded signature length is 64 bytes
6. Strict Ed25519 over the original encoded header and payload segments
7. Authenticated payload UTF-8 JSON; inspect integer `v`
8. Unsupported version
9. Version-1 shape; validate Course Run, Lab, student, and timestamp in that order

Variant identity is stable; Display wording is not a protocol contract.

## Protocol vectors

Language-neutral fixtures (TEST ONLY seed — **never deploy**):

- [`tests/vectors/v1-valid.json`](tests/vectors/v1-valid.json) — normative success vector
  (RFC 8032 test vector 1 seed)
- [`tests/vectors/v1-invalid.json`](tests/vectors/v1-invalid.json) — named rejection cases

The private seed in the valid vector is public test material labelled
**TEST ONLY - NEVER DEPLOY**.
