# Public Generic Trace Rendering and Validation

## Outcome

Ordinary AES and classical operation traces render through shared Learning components using semantic CryptoGraph trace data. Public Lesson validation uses the same Visualizer catalog as normal Lesson compilation. New algorithms do not require algorithm-specific renderer descriptors.

## Requirements and provenance

- **R1 — Generic rendering boundary**: #69, #81, ADR 0006. Generic trace rows support stable IDs, localized labels, typed values, operation details, retained values, explicit gaps, and structural relationships.
- **R2 — Shared interaction modes**: #69, #81, #86, #67. Comparison, avalanche, and lineage/key-expansion inspection are shared interaction modes over semantic trace data. They must not create AES-specific renderer contracts.
- **R3 — Registry boundary**: ADR 0006 and the Visualizer architecture decisions. Keep the registry for genuinely distinct data or interaction contracts that generic trace, comparison, and lineage models cannot express. Existing descriptors may remain while consumers migrate.
- **R4 — CLI parity**: #49, #56, existing `validateLessonDocuments` API. The CLI must pass the public catalog when validating descriptor-using Lessons and must also accept descriptor-free Lessons.
- **R5 — Compatibility**: #81, #82, #84, #85. Preserve existing AES, SPN, avalanche, localization, accessibility, truncation, and error-isolation behavior while moving ordinary traces to shared rendering.

## Complexity budget

- **Simplest acceptable path:** extend existing shared Learning model/components and adapters; remove descriptor requirements from ordinary trace fixtures; pass `visualizerCatalog` into `validateLessonDocuments`.
- **Acceptable manual recovery:** update affected synthetic fixtures and rerun focused tests.
- **Explicit non-goals:** new rendering framework, dynamic plugins, generic operation-renderer registry, algorithm-specific replacement descriptors, new route, new dependency, or redesign of cryptographic execution.
- **Approved mechanisms:** None.

## Acceptance criteria and evidence

| ID | Observable claim | Proof seam | Counterexample | Verification |
|---|---|---|---|---|
| P1 | Ordinary AES trace renders without `aes-cipher@1`. | Generic Lesson compile/session/render path. | Remove/register no AES descriptor while AES fixture still renders rows, labels, values, and details. | `fish -lc 'cd frontend; nvm use; npx vitest run src/visualizers/index.test.ts src/lesson_runtime/index.test.ts'` |
| P2 | Ordinary SPN/classical trace does not require an algorithm renderer descriptor. | Shared adapter and renderer tests. | Descriptor-free synthetic classical fixture renders semantic trace rows. | Focused visualizer/adapter tests. |
| P3 | Comparison, avalanche, and lineage remain usable as shared modes. | Existing comparison/lineage public component seams. | Truncated trace leaves explicit gaps; no fabricated alignment; selection remains accessible. | Existing `src/ui/learning` and avalanche tests plus focused regression tests. |
| P4 | Existing specialized descriptor consumers remain compatible during migration. | Catalog/Render Host tests. | Existing SPN/key-expansion fixture with descriptor still compiles and renders, or is migrated in the same change. | `npx vitest run src/visualizers/index.test.ts src/visualizers/migration.test.tsx`. |
| P5 | CLI validates descriptor-free Lessons. | `scripts/validate_lessons.mjs` process boundary. | AES/content fixture with no visualizer binding returns `ok:true`, empty diagnostics, dry run. | Exact content validation command. |
| P6 | CLI validates legitimately descriptor-using Lessons with catalog lookup. | Same CLI process boundary. | Fixture binding a registered descriptor returns `ok:true`; unknown ID returns structured failure. | CLI fixture checks. |
| P7 | Locales, keyboard/accessibility, resize, truncation, and error isolation remain intact. | Shared renderer/browser seams. | Missing trace/value or narrow layout does not crash Lesson or lose accessible summary. | Existing focused tests; browser test if shared presentation changes. |

## Implementation boundary

Likely files: `frontend/scripts/validate_lessons.mjs`; shared model/components under `frontend/src/ui/learning/`; ordinary AES/SPN/classical adapters and synthetic fixtures; Visualizer catalog/host only where migration requires it. Do not change CryptoGraph operation semantics.

Use semantic trace data for algorithm names, operation names, round labels, and localized copy. Do not add `aes-cipher@N`, `teaching-spn@N`, or `aes-key-expansion@N` for ordinary trace rendering.

## Verification

Run focused tests first, then `fish -lc 'cd frontend; nvm use; npm run typecheck && npm test && npm run build'`. Run browser tests when shared presentation behavior changes. Verify the exact content-repository validation command from a sibling checkout after the CLI fix.

## Open decisions

None. A genuinely new renderer descriptor requires a later issue defining the data/interaction shape that generic components cannot represent.
