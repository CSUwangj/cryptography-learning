# Public Lesson version audit

Audit for [#113](https://github.com/CSUWangj/cryptography-learning/issues/113),
November 2, 2026, at base `d7193477489c1a1c38d38c73be8ace9d67690354`.
The acceptance sources are [#95 P2-A1/A5/A6 and P5-A3](https://github.com/CSUWangj/cryptography-learning/issues/95)
and [#94 Q5](https://github.com/CSUWangj/cryptography-learning/issues/94#issuecomment-6145126690).
The [October 31 first-real-page acceptance](https://github.com/CSUWangj/cryptography-learning/issues/109#issuecomment-6547518614)
satisfies the product checkpoint. It does not supply current automated evidence.

## Version contract

Explicit `version: 1` uses legacy compilation and exposes
`lesson.schema-v1-deprecated` to tooling. Omitted `version` and explicit
`version: 2` select v2, with no deprecation notice. Other versions fail with
`lesson.unsupported-version`. V2 fields in v1 and legacy fields in v2 retain
`lesson.v2-feature-in-v1` and `lesson.v1-feature-in-v2`, respectively.

V2 dedicated `avalanche@1` and `classical-cipher@1` visualizers and comparison
declarations fail with `lesson.v2-unsupported`. The worker rejects comparison
when either graph is v2 with `comparison.v2-unsupported`. This does not ban
registered classical operations in raw graphs. V1 comparison, classical,
descriptor and execution contracts remain supported. The
[existing migration guide](MIGRATION-v2.md) remains the tooling notice target.

## Tracked YAML roots

All 13 tracked root documents were compiled through public `compileLesson`
with the real Visualizer catalog and their adjacent locale files. Twelve
compile successfully. Every valid v1 root emits the tooling notice; every v2
graph has schema 2 and no notice. No root needed a version edit.

| Root | Authored version | Result |
| --- | --- | --- |
| [baseline AES comparison](../baseline/content/lessons/aes-128-comparison-demo/lesson.yaml) | 1 | Compiles, legacy comparison graphs |
| [baseline AES](../baseline/content/lessons/aes-128-demo/lesson.yaml) | 1 | Compiles, legacy schedule/encryption/decryption |
| [baseline substitution](../baseline/content/lessons/classical-substitution/lesson.yaml) | 1 | Compiles, classical presentation |
| [baseline fallback XOR](../baseline/content/lessons/fallback-xor/lesson.yaml) | 1 | Compiles with its English fallback locale |
| [baseline XOR](../baseline/content/lessons/xor-intro/lesson.yaml) | 1 | Compiles |
| [baseline malformed YAML](../baseline/content/lessons/malformed-yaml/lesson.yaml) | Malformed `version: [` | Expected `lesson.yaml-syntax` at the root |
| [runtime XOR](../frontend/src/lesson_runtime/fixture/lesson.yaml) | 1 | Compiles |
| [runtime transposition](../frontend/src/lesson_runtime/fixture/transposition/lesson.yaml) | 1 | Compiles, preserves the `text` output port |
| [AES-128 v2](../frontend/src/lesson_runtime/fixture/aes128-v2.yaml) | 2 | Compiles, including decryption |
| [AES-192 v2](../frontend/src/lesson_runtime/fixture/aes192-v2.yaml) | 2 | Compiles |
| [AES-256 v2](../frontend/src/lesson_runtime/fixture/aes256-v2.yaml) | 2 | Compiles |
| [three-anchor overlay](../frontend/src/lesson_runtime/fixture/overlay-three-anchor-v2.yaml) | 2 | Compiles |
| [Teaching SPN v2](../frontend/src/lesson_runtime/fixture/teaching-spn-v2.yaml) | 2 | Compiles |

[compatibility.test.ts](../frontend/src/lesson_runtime/compatibility.test.ts)
keeps these compilation outcomes under test. Its explicit/omitted-v2 cases
also show that removing the version from the legacy XOR root does not silently
keep legacy semantics: `graphs.xor.traceLevel` receives
`lesson.v1-feature-in-v2`. The malformed fixture stays unchanged.

## Embedded demo roots

All 13 expanded roots below compile with their supplied locale documents.
V1 roots retain the notice. V2 roots have schema 2 and no notice.

| Owning source and exported constructor | Expanded roots | Version |
| --- | --- | --- |
| [aes128CipherLesson.ts](../frontend/demos/aes128CipherLesson.ts), `aesCipherDemoDocuments` | AES-128, AES-192, AES-256 | 1 |
| [aesCipherComparisonLesson.ts](../frontend/demos/aesCipherComparisonLesson.ts), `aesCipherComparisonDocuments` | AES-128, AES-192, AES-256 comparison | 1 |
| [aesKeyExpansionLesson.ts](../frontend/demos/aesKeyExpansionLesson.ts), `aesKeyExpansionDemoDocuments` | Teaching key schedule | 1 |
| [teachingSpnLesson.ts](../frontend/demos/teachingSpnLesson.ts), `teachingSpnDemoDocuments` | Teaching SPN | 1 |
| [classicalCipherLessons.ts](../frontend/demos/classicalCipherLessons.ts), `substitutionCipherDemoDocuments`, `vigenereCipherDemoDocuments` | Substitution, Vigenere | 1 |
| [uiOptimizationPrototypeFixture.ts](../frontend/demos/uiOptimizationPrototypeFixture.ts), `aes256PrototypeLesson` with `aes256PrototypeLocales` | AES-256 opening preview | 1 |
| [slidingWindowLesson.ts](../frontend/demos/slidingWindowLesson.ts), `slidingWindowDemoDocuments` | Sliding window | 2 |
| [teachingSpnV2Lesson.ts](../frontend/demos/teachingSpnV2Lesson.ts), `teachingSpnV2DemoDocuments` | Teaching SPN v2 | 2 |

The real AES v2 demo pages consume the YAML roots listed above. The served-Lesson
export script consumes the existing v1 AES and comparison constructors. Other
demo and browser files import these roots or derive variants from them; they do
not introduce another implicit-version root.

## Embedded test roots and deliberate invalid cases

A tracked-file search for Lesson documents, YAML roots and `default_locale`,
plus inspection of TypeScript string/template/array constructors, found the
following additional roots. Every base constructor declares version 1 or 2.
Version omission occurs deliberately in version-dispatch tests and the backend
metadata stub described below. Derived malformed cases are evidence, not
content to repair.

| Owning source | Roots and expected outcome |
| --- | --- |
| [AesCipherDemo.language.test.tsx](../frontend/demos/AesCipherDemo.language.test.tsx) | `aes-language-test`, v1, valid reduced session/renderer fixture |
| [learning.spec.ts](../frontend/e2e/learning.spec.ts) | `caesar`, v1, valid; imports the v1 XOR YAML root and derives accepted-error and bounded-input cases |
| [visualizers.spec.ts](../frontend/e2e/visualizers.spec.ts) | `avalanche`, v1, valid; `executionLesson` retains v1 when replacing Steps; schedule-only variants retain their imported root's explicit version |
| [v2-default-trace-browser.tsx](../frontend/e2e/v2-default-trace-browser.tsx) | `browser-v2-xor` and `browser-v2-table`, v2, valid browser probe documents |
| [LearningPage.i18n.test.tsx](../frontend/src/learning/LearningPage.i18n.test.tsx) | `locale-split`, v1 valid base; v9 mutation expects `lesson.unsupported-version`; v1 table variant expects `lesson.v2-feature-in-v1`; v2 invalid tables expect `table.entry-bits-out-of-range`, `table.length-mismatch` or `table.entry-out-of-range`; missing parameter constant expects `lesson.unknown-constant` |
| [bitFlip.test.ts](../frontend/src/lesson_runtime/bitFlip.test.ts) | `bit-flip-experiment`, v1 valid base; invalid input references, types, widths and missing text deliberately fail |
| [index.test.ts](../frontend/src/lesson_runtime/index.test.ts) | `composed-values`, `table-reference`, `nested-table`, `source-reference`, `repeated-export`, `v2-xor`, all v2 valid bases; `table-check`, v2, deliberately fails `lesson.invalid-constant-use` |
| Same runtime test file | `v1-boundary`, v1 template, deliberately supplies v2 parameter/table references and expects `lesson.v2-feature-in-v1`; `invalid-v2` deliberately supplies internal `schema`/`traceParameters` and legacy `traceLevel`, expecting `lesson.unknown-field` and `lesson.v1-feature-in-v2` |
| Same runtime test file | `caesar`, `hex-block-fixture` with `0f0f`, and `aes-key-expansion-fixture`, v1 valid bases; bad hex forms expect `lesson.invalid-input` |
| Same runtime test file | Derived root version 3 expects `lesson.unsupported-version`; duplicate `version` expects `lesson.yaml-syntax`; anchors, aliases, tags and merge keys expect `lesson.yaml-restriction`; omitted version on the minimal v2 root compiles as v2 |
| [visualizers/index.test.ts](../frontend/src/visualizers/index.test.ts) | `avalanche`, v1 valid comparison base; intentional incompatible bindings remain diagnostic cases |
| [migration.test.tsx](../frontend/src/visualizers/migration.test.tsx) | `avalanche`, v1 valid repeated comparison base; truncated variants retain raw values and explicit gaps |
| [spnCipher.test.tsx](../frontend/src/visualizers/spnCipher.test.tsx) | `boundary-padding`, v2 valid template with authored grouping 2 or 3 |
| [aesV2.test.ts](../frontend/src/visualizers/aesV2.test.ts) | `narrow-schedule`, v2 valid graph for exact dependency traversal |
| [compatibility.test.ts](../frontend/src/lesson_runtime/compatibility.test.ts) | No new root constructor. Derives explicit/omitted v2 legacy-field failures, unsupported v2 comparison/classical declarations, and a raw v2 substitution graph from the roots above |

The [backend catalog tests](../backend/apps/web-server/src/lesson_catalog.rs)
write `invalid: [ Lesson YAML`, `default_locale: en-US` plus `opaque: true`, and
`version: 1` stubs. The [GraphQL adapter test](../backend/apps/web-server/src/model.rs)
writes `version: 1` plus `default_locale: en-US`. These are intentionally opaque
serving/metadata fixtures, not complete compilable Lessons. The invalid YAML
would fail frontend parsing; the other stubs lack required Lesson fields.
They remain unchanged, including the metadata stub's omitted version.

The complete root example in [MIGRATION-v2.md](MIGRATION-v2.md) declares v2.
Its later projection example is a fragment, not a second root. Catalog RON,
GraphQL schema versions and locale YAML are not Lesson root versions.

## Compatibility evidence and limits

The existing compiler tests already cover v1 notices, version dispatch, source
locations, exclusive fields and YAML restrictions. Existing graph tests cover
registered operation identities, ports, known-answer execution, serialization,
comparison and v2 worker comparison rejection. Existing Visualizer tests cover
retained descriptors, generic rendering, classical symbol mapping and bilingual
comparison. Existing Learning navigation and page tests cover stable catalog
and Lesson URLs, locale changes and diagnostic rendering. These are reused
compatibility checks, not newly failing tests or proof about private content.

The new compiler tests directly protect unsupported v2 comparison/avalanche
and classical declarations. A new public compiler/worker test found a real
execution defect: v2 trace collection assumed the output port was named `value`.
A substitution operation's stable output port is `text`. The worker now uses
the registered single output port for both trace identity and value, preserving
the authored `ABC XYZ!` to `QWE BNM!` substitution and `cipher.text` output.
The same test failed before that correction and passes after it. This is raw
execution support, not a v2 classical presentation.

The audit distinguishes compilation, unit integration and browser evidence.
The focused implementation run passed 193 existing tests across the graph,
runtime, Visualizer, Learning navigation and localized page checks, plus all
19 new compatibility tests. From `frontend` with the pinned Node version active,
`npm test -- --maxWorkers=1 --passWithNoTests=false src/lesson_runtime/compatibility.test.ts`
rechecks the YAML inventory and the new compiler/worker cases.
Inventory inspection of embedded browser roots is not a browser run. In-process
Worker stand-ins exercise the real request handler but do not prove browser
transport, isolation, cancellation or timing. Compiler success alone does not
prove every Step, visual layout or private Lesson compatible. Exact commands,
exits and logs belong to the external implementation report and Handoff Packet;
the coordinator owns planner validation and independent reviews.

No root was converted, no malformed fixture was cleaned up, and no student
notice UI or v1 retirement was added. Private content auditing/migration remains
maintainer-owned. This audit does not finalize #114's migration documentation
or ADR 0008 and does not implement or close #67.
