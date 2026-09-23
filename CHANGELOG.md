# Changelog

## 1.0.0 — 2026-09-23

The Cryptography Learning platform is now modernized, testable, and ready for
the next course iteration. Specification issue [#11](https://github.com/CSUwangj/cryptography-learning/issues/11)
is complete and closed.

### Learning demos

- Added the [Teaching SPN demo](/testspn), with bounded rounds, inspectable
  substitution, permutation, key-mixing, and round-state traces.
- Added the [Avalanche comparison demo](/testavalanche), with typed execution
  comparison and safe Worker-based processing.
- Added the typed CryptoGraph runtime, localized Lesson compiler, browser and
  Node validation adapters, local Lesson checks, and accessible Visualizers.

### Practice experience

- Preserved Practice catalog and Lab behavior while adding responsive navigation
  and mobile layouts.
- Added content-owned `/resources` serving for Lab assets.
- Rebuilt the embedded terminal lifecycle around current xterm packages, with
  safe cleanup, resizing, reconnect behavior, and native paste compatibility.
- Added bilingual Completion Records with completion times, matrix views, and
  legacy-compatible CSV export.

### Completion Claims

- Added signed Ed25519 Completion Evidence and immutable first-claim storage.
- Added the Host Completion Relay with validated configuration, key generation,
  durable delivery, health reporting, and structured diagnostics.
- Added runtime-selectable Practice-only and Completion-enabled deployment modes.

### Platform and operations

- Migrated the frontend to Vite, React 19, Blueprint 6, TypeScript 6, Apollo
  Client 4, and typed GraphQL documents.
- Reorganized the backend into an Axum workspace with versioned RON manifests,
  SQLite migrations, schema-parity checks, and startup validation.
- Added immutable Linux web-image builds, multi-browser container acceptance,
  release attestations, deployment documentation, and rollback guidance.

### Compatibility

- Frontend toolchain: Node 24.18.1 and npm 11.16.0.
- Backend toolchain: Rust 1.97.
- Published web images use `web-v<major>.<minor>.<patch>` tags and target
  Linux AMD64. No `latest` tag is published.
- Real Lab content remains operator-supplied and mounted read-only; the checked-in
  content is synthetic demonstration data.

### Verification

- Frontend typecheck, 113 Vitest tests, and production build passed.
- Full locked Rust test suite passed, including schema parity, manifest
  compatibility, Completion Claims, relay, and web-server coverage.
