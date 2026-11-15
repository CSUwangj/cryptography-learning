# Changelog

## 1.3.1 — 2026-11-15

This release adds v2 comparison and avalanche learning flows, updated classical
cipher views, and a standalone content validator to the public web image.

### Learning

- Added generic v2 comparisons with paired values, exact bit differences,
  checkpoint summaries, and shared lineage selection.
- Added data avalanche, standalone key avalanche, and key-change cipher overlays
  for AES encryption and decryption, with controls that derive one-bit variants
  from the original data or key.
- Added interactive v2 Caesar reels and updated substitution, affine, Vigenere,
  and transposition views. Classical labels and editable controls follow the
  execution that owns their values.
- Updated bilingual demos and the Lesson migration guide for these capabilities.

### Content validation

- Added `cryptography-learning-validator-web-v1.3.1.tar.gz`, a Linux package with
  bundled JavaScript dependencies and Lesson, Lab, and version JSON commands.
  It requires Node 24.18.1 and runs without this checkout or an npm installation.
- Lesson validation compiles v1/v2 documents and executes authored defaults,
  including comparisons and avalanche variants. Lab validation uses the
  application's Markdown and math stack, including collapsed callouts.
- Reports preserve available source positions. Formula errors inside callouts
  omit unreliable line and column details.

### Compatibility and limits

- Lesson schema v1 remains supported through public v1.3 with its deprecation
  notice. Its planned retirement belongs to public v1.4.
- The validator checks authored format and default execution. It does not verify
  teaching correctness, every student input, linked assets, or deployment readiness.
- The existing Markdown dependencies retain their documented maintenance and
  security limitations under the maintainer-authored-content boundary.
- Public images retain Application Manifest schema 1 and the Linux AMD64 target.
  Private content and deployed Hosts remain operator-managed.

### Verification

- The v1.3 delivery map records learning coverage and its limits. The standalone
  package checks extracted commands without access to checkout files and compares
  reports against the shared application validation entries.
- Publication requires Chromium, Firefox, and WebKit acceptance against one
  immutable image, followed by anonymous-pull smoke verification.

## 1.2.0 — 2026-11-03

The v1.2 public web release adds Lesson schema v2, composable cryptographic
operations, and shared interactive cipher and key-schedule presentations.

### Learning

- Added typed bit projections, repeated operations, cross-Step values, named
  parameter tables, per-node execution traces, and exact structural bit lineage.
- Added generic SPN cipher rendering and independently inspectable key schedules.
  A covering schedule overlay derives its anchors from Lesson bindings and aligns
  round keys with the cipher's AddRoundKey operations.
- Added independent cipher and schedule selection units, grouped binary or
  hexadecimal values, and shared selection across the overlay. Highlighting a
  related group preserves the exact underlying bit dependencies.
- Added localized Lesson titles to catalog entries, popup navigation, and
  breadcrumbs, with language fallback and isolated missing-title handling.
- Updated shared navigation, theme and language controls, responsive Lesson
  spacing, and local scrolling for wide traces in English and Chinese.

### Examples and authoring

- Added public v2 fixtures and runnable developer demos for AES-128/192/256,
  four-round Teaching SPN, and sliding-window key expansion, with AES-128
  decryption and reverse schedule-order coverage.
- Added a [Lesson migration guide](https://github.com/CSUwangj/cryptography-learning/blob/web-v1.2.0/docs/MIGRATION-v2.md)
  with runnable bilingual v1/v2 examples and projected cross-Step values.
- Added an [Operation authoring guide and overview](https://github.com/CSUwangj/cryptography-learning/blob/web-v1.2.0/docs/OPERATIONS.md)
  covering registration, bilingual labels, validation, execution, and lineage,
  with a runnable constant-XOR example.

### Compatibility and upgrade

- Lesson documents with `version: 1` remain supported throughout v1.2, including
  existing comparison and classical presentations. Validation emits the
  `lesson.schema-v1-deprecated` notice.
- `version: 2` and omitted Lesson versions select v2. Keep `version: 1` explicit
  on legacy Lessons; removing it does not migrate legacy fields.
- V2 comparison, avalanche, and dedicated classical presentations remain
  unsupported. Existing v1 operation identities and port semantics are retained.
- Private Lessons and Labs remain operator-supplied. This public web release
  does not migrate private content or update a deployed Host.
- Public images retain Application Manifest schema 1 and the Linux AMD64 target.
  The release tag is `web-v1.2.0`; the image tag is `1.2.0`.

### Verification

- The [v1.2 delivery map](https://github.com/CSUwangj/cryptography-learning/blob/web-v1.2.0/docs/v1.2-delivery-evidence.md)
  records phase deliveries, product acceptance, regression coverage, and
  historical evidence limits.
- Publication requires Chromium, Firefox, and WebKit acceptance against the same
  immutable image, followed by anonymous-pull smoke verification.

## 1.1.0 — 2026-10-11

The v1.1 learning release adds the served Lesson route and bilingual Lesson
package across the public web, content, and infrastructure repositories.

### Learning and content

- Added generic, localized Learning presentation components and served Lesson
  integration.
- Added AES-128/192/256 encryption, decryption, key-expansion, comparison,
  and avalanche Lessons with full-state semantic traces.
- Added bilingual classical Lessons for alphabet foundations, substitution,
  Caesar, affine, Vigenere, and columnar transposition.
- Added deterministic Lab Registry composition and deployment handoff evidence.

### Verification

- Completed the v1.1 cross-tree acceptance work recorded in issues #69 and #80.
- Content package evidence is recorded in the v1.1 Lesson Package Handoff and
  the content changelog through v1.1.28.

## 1.0.0 — 2026-09-23

The Cryptography Learning platform is now modernized, testable, and ready for
the next course iteration. Specification issue [#11](https://github.com/CSUwangj/cryptography-learning/issues/11)
is complete and closed.

### Learning demos

- Added the Teaching SPN demo, with bounded rounds, inspectable
  substitution, permutation, key-mixing, and round-state traces.
- Added the Avalanche comparison demo, with typed execution
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
