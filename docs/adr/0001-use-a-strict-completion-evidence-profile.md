# Use a strict Completion Evidence profile

Completion Evidence uses a small, versioned compact JWS profile signed with
Ed25519 under `alg: EdDSA`; version 1 permits only the specified protected-header
and payload members, and only caller-configured keys establish trust. Replay
safety comes from immutable, idempotent Completion Claims rather than nonce,
expiry, issuer, or audience claims. We chose this narrow profile over a generic
JOSE or JWT surface so relay and backend behavior stays deterministic and tokens
cannot select algorithms or trust material.
