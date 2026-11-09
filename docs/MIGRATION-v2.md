# Lesson schema v2 migration guide

This guide covers the implemented public v1.2 path: typed primitive composition,
per-node traces, generic SPN teaching, standalone schedules and binding-derived
overlays. It retains the `docs/MIGRATION-v2.md` URL introduced by
[#96](https://github.com/CSUWangj/cryptography-learning/issues/96), which v1
compilation notices reference. [ADR 0008](adr/0008-generic-rendering-by-structural-family.md)
records the architecture; the [delivery map](v1.2-delivery-evidence.md) links
requirements to source, tests and historical evidence limits.

The maintainer approved the first real AES-192 Learning page on October 31, 2026
in [#109](https://github.com/CSUWangj/cryptography-learning/issues/109#issuecomment-6547518614).
The recorded #109 corrections govern the UI wherever the original draft or prototype
differs. Passing examples do not replace that decision or prove deployment.

## Version selection and coexistence

| Authored version | Compiler behavior |
| --- | --- |
| `version: 1` | Preserves v1 semantics and adds the warning notice `lesson.schema-v1-deprecated` |
| `version: 2` or omitted version | Uses v2, with no v1 deprecation notice |
| Any other version | Fails with `lesson.unsupported-version` |

Write the version explicitly. Removing `version: 1` is not a conversion: legacy
fields such as graph `traceLevel` fail with `lesson.v1-feature-in-v2`. V2-only
annotations, projections, tables and parameter references in v1 fail with
`lesson.v2-feature-in-v1`. Do not author internal `schema`, `traceParameters` or
compiled `rowOrder` fields.

Lesson schema v1 remains supported unchanged through public v1.3, including its
registered operation identities, existing demos, comparison and classical
presentations. Deprecation is a compilation notice exposed through `compileLesson`
and validation tooling, not a new student-facing notice panel. The maintainer's
[November 4, 2026 compatibility decision](https://github.com/CSUWangj/cryptography-learning/issues/129#issuecomment-6640465797)
sets public v1.4 as the release that retires Lesson schema v1. Retirement
implementation is separate work; no automatic converter is approved. Lesson
schema versions and Visualizer descriptor major versions are independent.

The same decision assigns the new classical presentation to Lesson v2 only.
Generic comparison, controlled data-change avalanche, standalone original-key
avalanche schedules and key-change cipher overlays now use the v2 runtime.
Dedicated classical presentation remains separate work.
The supported presentation table below describes the implemented path. The
[public version audit](lesson-version-audit.md) records public roots at its stated
historical snapshot; the complete examples below extend that inventory. Private
Lesson auditing and migration remain maintainer-owned.

## Complete paired example

The canonical complete Lessons are checked in alongside this guide:

| Root | Lesson | Locales |
| --- | --- | --- |
| Legacy v1 | [xor-v1/lesson.yaml](examples/migration/xor-v1/lesson.yaml) | [en-US](examples/migration/xor-v1/locales/en-US.yaml), [zh-CN](examples/migration/xor-v1/locales/zh-CN.yaml) |
| V2 | [xor-v2/lesson.yaml](examples/migration/xor-v2/lesson.yaml) | [en-US](examples/migration/xor-v2/locales/en-US.yaml), [zh-CN](examples/migration/xor-v2/locales/zh-CN.yaml) |

Each directory is a self-contained root usable by the existing CLI. Copy a whole
root to adapt it, keeping the two locale documents with its `lesson.yaml`.
Both execute `0x1234 XOR 0x00ff` and export `result.value = 0x12cb`.
The v1 root keeps its legacy `traceLevel: summary` setting.

### Minimal v2 graph

Compare the two linked Lessons when migrating. The v2 root preserves the earlier
minimal source/XOR/output example. It changes the version to 2, removes
`traceLevel`, adds `role`, `round` and `unit` teaching annotations, and requests
`presentation: {kind: spn-cipher, labels: {core.xor@1: mix-label}}`.
The locale files define the referenced `mix-label` text in both languages.

V2 retains four operation events, including both sources, with paths/values
`state.value = 0x1234`, `mask.value = 0x00ff`, `mixed.value = 0x12cb` and
`result.value = 0x12cb`. Labels resolve to "Mix with the mask" or "与掩码异或".
Removing `presentation` gives the descriptor-free trace; execution is unchanged.

Validate the checked-in roots from the repository root using the existing CLI
and pinned Node environment:

```sh
fish -lc 'cd frontend; and nvm use; and npm run validate-lessons -- ../docs/examples/migration/xor-v1'
fish -lc 'cd frontend; and nvm use; and npm run validate-lessons -- ../docs/examples/migration/xor-v2'
```

Both JSON reports have `ok: true` and a dry run for `run`; only v1 has the
notice. The CLI compiles and dry-runs defaults. It does not inspect browser
geometry or deployment content.

The ordinary [migrationExample.test.ts](../frontend/src/lesson_runtime/migrationExample.test.ts)
reads these real roots and the projected example below. It checks both versions,
the v1 notice, literal outputs, v2 trace/labels and the five-bit cross-Step value.
Its TypeScript source is covered by normal frontend typecheck. Run from the
repository root:

```sh
fish -lc 'cd frontend; and nvm use; and npm test -- --maxWorkers=1 --passWithNoTests=false src/lesson_runtime/migrationExample.test.ts'
fish -lc 'cd frontend; and nvm use; and npm run typecheck'
```

## Manual node and primitive conversion

Keep existing operations when their ports and semantics fit. A v2 Lesson can
still use `aes.sub-bytes@1`, `aes.shift-rows@1`, `aes.mix-columns@1` and their
inverse transforms. Renaming an operation alone does not preserve semantics.
For parameterized compositions, convert the graph explicitly:

| Existing operation or pattern | V2 composition and author responsibility |
| --- | --- |
| `aes.sub-bytes@1` / `aes.sub-word@1` | `core.substitute-bytes@1`, with `sBox: {constant: aes-sbox}`. Set byte `start`/`count` when only part of a full state changes. |
| `spn.substitute@1` | `core.substitute-nibbles@1`, with the 16-entry S-box and optional nibble `start`/`count`. Both require a permutation of 0..15. |
| `spn.permute@1` scatter | `spn.permute-gather@1` uses `output[i] = input[permutation[i]]` at nibble granularity. Invert scatter `[1,2,3,0]` to gather `[3,0,1,2]`. |
| Fixed byte rearrangement | `core.permute-bytes@1` gathers bytes using a complete permutation. It is not a bit permutation. |
| `aes.rot-word@1` on an extracted word | `core.rotate-word@1` rotates the 32-bit word at `target` left by `amount` bits, leaving the rest unchanged. |
| Rcon injection | `core.xor-constant@1` XORs a 32-bit unsigned `constant` into word `target`. For the first AES Rcon word, use decimal `16777216` (`0x01000000`). |
| Per-word AES XOR chain | `aes.xor-words@1` takes full `state` and 32-bit `temp`, plus word `start`/`count`; it returns the complete state with that range updated. |
| Extracting/combining round keys | Project node inputs with `bits`, then use `core.output@1` or `core.concat@1`. Concat takes `left`/`right`; its inferred width is their sum. |

Byte/nibble substitution leaves bits outside its range unchanged. Word targets
are zero-based and require whole 32-bit states; byte/nibble operations require
widths divisible by 8/4. New dynamic-width v2 operations are not a promise to
extend frozen v1 inference.

Do not infer a teaching stage from an ID such as `round-1-subbytes`. Add `role`,
`round`, and, for schedule generation, `iteration` to the actual node. `round`
and `iteration` are nonnegative integers. `unit` is a positive divisor of that
node's bit width; it draws authored grouping boundaries and does not choose the
view's active selection size. IDs and labels do not determine dependencies or
row placement.

V2 diagnoses structure before sorting, resolves real widths in dependency order,
and maps each primitive's local dependencies through projections into compiled
lineage. Each operation has one output port, but a graph may export several
values and contain several `core.output@1` nodes. Export a projected value through
an operation; graph `outputs` themselves do not accept `bits`.

## Projected composition

Input `bits: [start, length]` selects a zero-based logical MSB-first range, not
storage padding. Start/length must be safe integers, length must be positive,
and the range must fit the upstream bit width. Repeat expansion preserves the
projection. Invalid declarations report `graph.projection-invalid-format`,
`graph.projection-empty-range` or `graph.projection-out-of-bounds`.

The complete [projection/lesson.yaml](examples/migration/projection/lesson.yaml)
composes and then consumes a projected value across two Steps. Its adjacent
[en-US](examples/migration/projection/locales/en-US.yaml) and
[zh-CN](examples/migration/projection/locales/zh-CN.yaml) locales keep the root
self-contained; this raw graph requires no text IDs. Copy the whole root when
adapting its input widths, projection ranges and Step bindings.

```sh
fish -lc 'cd frontend; and nvm use; and npm run validate-lessons -- ../docs/examples/migration/projection'
```

`left` is `10101`; its bits `[1,3]` are `010`. Concatenating `10` produces the
literal five-bit `01010`, `0x0a`, which remains five bits in the later Step.
Concatenating padded byte arrays would produce a different value. The
`BitsValue` representation and v1 packing remain unchanged.

For AES-192, batch 0 generates w6..w11. The correct rk1 inputs are initial key
`bits: [128,64]` followed by batch-0 XOR `bits: [0,64]`, not two generated
batches. Its value for the incremental-byte key is
`10111213141516175846f2f95c43f4fe`. Keep the final schedule state at 192 bits and
project 128 generated bits for rk12. See the complete
[AES-192 Lesson](../frontend/src/lesson_runtime/fixture/aes192-v2.yaml).

## Tables and bilingual labels

Top-level table constants have `kind: table`, `entryBits` from 1 through 16,
exactly `2 ** entryBits` entries, and integer entries in that unsigned range.
The operation also validates the table's meaning. Byte substitution requires
256 byte entries; nibble substitution requires a 16-entry permutation.

This fragment replaces an inline nibble S-box with a named reference:

```yaml
constants:
  teaching-spn-sbox:
    kind: table
    entryBits: 4
    value: [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7]
```

Use that reference in a node under `graphs.<graph>.nodes`:

```yaml
- id: substituted
  operation: core.substitute-nibbles@1
  inputs: {value: {node: state, port: value}}
  parameters: {sBox: {constant: teaching-spn-sbox}}
  role: state
  round: 1
  unit: 4
```

With input `0x1234`, that substitution yields `0x4d12`. Use the complete
[Teaching SPN Lesson and locales](../frontend/demos/teachingSpnV2Lesson.ts)
for the four-round runnable composition, whose result is `0x674b`.
References replace a whole top-level operation parameter; nested references
inside parameter objects are not recursively expanded.

Tables are operation parameters only. They cannot be Step bindings, equality
check values or Visualizer value bindings (`lesson.invalid-constant-use`).
Execution receives resolved entries; the v2 event keeps
`parameters: {sBox: {constant: teaching-spn-sbox}}`. Tables stay out of
`CompiledLesson.constants` and runtime value bindings. Ordinary typed constants
also support top-level parameter references and resolve to their values.

Registered primitive labels come from the application's `primitives` namespace
in en-US and zh-CN. The current UI copy uses `visualizers`, not the draft's
proposed `learningV2` namespace. `presentation.labels` maps exact operation
identities to Lesson `texts` IDs, as in the paired example. Supply every referenced
ID in every supplied locale; missing text fails compilation. Stable IDs,
operation names and user input are not translated. Locale titles name catalog,
popup and breadcrumb entries, with requested-language then default-locale fallback.
Invalid title metadata leaves that Lesson reachable with an unavailable-title
label and its ID.

## Supported presentation

| V2 use | Declaration and boundary |
| --- | --- |
| Raw execution | Omit `presentation` and use the default trace. Roles/rounds are not required just to execute. |
| Generic SPN cipher | `presentation: {kind: spn-cipher}` with optional `algorithm`, `variant`, `direction` and `labels`. These supply labels, not algorithm-specific dispatch. |
| Standalone schedule | `presentation: {kind: spn-cipher, mode: key-expansion}` on an executing or comparison Step. It shows complete state rows, grouping, selection and lineage without an open cipher or descriptor. |
| Cipher/schedule overlay | Add `overlay: true` to a cipher's `spn-cipher` presentation and bind every cipher key source to exported schedule values. |
| Generic comparison | `visualizer.id: avalanche@1` with `compare.kind: generic`, a graph, detail trace level and typed baseline/changed bindings for every graph source. Several inputs may differ. |
| Data-change avalanche | The same comparison declaration with `kind: avalanche` and a nonempty `sources` list of permitted original data source IDs. Exactly one bit of one listed source changes; all other independent input values stay equal. |
| Standalone original-key avalanche | `presentation: {kind: spn-cipher, mode: key-expansion}` with `avalanche@1`, `compare.kind: avalanche`, and `sources: [key]` naming the original-key graph source. No cipher is required. |
| Key-change cipher overlay | A cipher avalanche comparison declares `keyChange` naming an earlier original-key avalanche Step. Bind each key source to that Step's exported schedule output and request `presentation.overlay: true`. |
| Dedicated classical teaching | Separate work. Dedicated `classical-cipher@1` remains unsupported in v2 (`lesson.v2-unsupported`); registered classical operations may still execute in a raw v2 graph. |

Legacy `block-cipher`, `key-expansion` presentations and `teaching-spn@1` are v1
declarations, not v2 aliases. Standalone schedule comparison reuses the existing
structural renderer and comparison contract; no new descriptor is required.

The complete bilingual [data avalanche Lesson](../frontend/demos/dataAvalancheLesson.ts)
declares `sources: [data, other]` and reuses the existing `bit_flip` controls.
These IDs name graph source nodes, not Lesson input IDs or translated labels.
The session derives a variant from the current baseline and one MSB-first bit;
choosing another source or bit replaces the old flip. Independent bindings may
use different references when their actual values are equal. Zero or multiple
changed source bits, an unlisted changed source or a different independent key
yield `lesson.invalid-avalanche` before execution.

Fixed valid examples can omit the input/control Step entirely. Edits invalidate
results, and entering the comparison Step executes through the existing Worker.
The shared view starts at the differing retained source bit at size 1. Display
selection inspects lineage without changing inputs or executing cryptography;
locale and resize preserve inspection, while a replacement execution starts a
new selection. Full-width measurements and explicit trace gaps are independent
of display grouping. Lesson v1 comparison semantics remain unchanged.

A standalone original-key experiment uses the same declaration on its schedule
graph. For a graph whose original-key source is `key`, with equal-width Lesson
inputs `key` and `changed-key`, the comparison Step is:

```yaml
- id: compare-key
  presentation: {kind: spn-cipher, mode: key-expansion}
  visualizer:
    id: avalanche@1
    compare:
      kind: avalanche
      sources: [key]
      graph: schedule
      traceLevel: detail
      bindings:
        key: {baseline: {input: key}, changed: {input: changed-key}}
```

Every other independent graph source also needs baseline/changed bindings with
identical values. Only one original-key bit may differ; derived round keys may
have many differences. `sources` names original graph inputs, not derived
round-key checkpoints. Existing typed bindings reject unequal key widths with
`lesson.invalid-step-reference`; invalid source declarations use
`lesson.invalid-input`. Invalid source changes use `lesson.invalid-avalanche`.
Missing stable checkpoint identities use `comparison.incompatible-structure`;
one-sided trace retention instead produces inspectable gaps.

The bilingual [standalone AES demo](../frontend/demos/keyAvalancheLesson.ts)
reuses a real AES schedule without its cipher. It offers the existing optional
`inputs` and `bit_flip` controls. Fixed valid examples may omit that input Step.
New and replacement standalone executions start at size 1 and select the changed
original-key bit only when both source values are retained. An absent or
incomplete source leaves selection empty, even when derived keys remain visible.
Changing size clears selection; reselecting the active size, changing locale or
resizing preserves it. Grouped selection seeds lineage only from that group's
actual bits, and differences remain underlined independently of selection.
Data-change and key-change Steps keep separate results; edits invalidate only
affected v2 comparisons. Selection belongs to the displayed execution and never
transfers from another Step. This does not promise durable navigation history.

A cipher comparison joins that experiment with `compare.keyChange: compare-key`
instead of `compare.sources`. Every cipher round-key source uses an ordinary
reference such as `{step: compare-key, output: round-key-1.value}`. The session
resolves it to the baseline schedule for the baseline cipher and the changed
schedule for the changed cipher. Both sides must reference the same exported
anchor. The cipher's other sources retain equal values, including plaintext for
encryption and ciphertext for decryption. Multiple derived round keys may differ.
The [paired AES fixture](../frontend/demos/keyChangeLesson.ts)
builds runnable encryption/decryption Lessons from the real AES graphs.

`presentation.overlay: true` enables the existing complete schedule controls.
It requires the explicit `keyChange` declaration on a comparison; ordinary
data-change comparisons do not discover an overlay automatically. Missing or
incompatible bindings receive the existing binding/overlay diagnostics. The
earlier experiment still enforces exactly one original-key bit change. Editing
its inputs invalidates its dependent cipher comparison as well.

New and replacement cipher comparisons start closed with both sizes 1. Their
initial selection names the original-key bit only if that exact source is also
retained and visible in a cipher row. No derived key replaces an absent source.
This initialization also applies when `presentation.overlay` is false or omitted.
Toolbar and bound-row toggles clear selection and preserve both independent
sizes. Actual size changes also clear selection; active-size reselect, locale
and resize preserve it. Only the active comparison view draws its own lineage.
Actual differences and paired values remain visible independently of selection.
Missing schedule checkpoints remain inspectable gaps without invented values,
measurements or lineage through missing rows.

The cipher teaching order is structural:

- Every node has a bit-valued output, a `state` or `round-key` role, and a round.
- State nodes form one chain from a single input-free state source. Each later
  state has exactly one distinct state predecessor. Forks/merges have no supported
  cipher teaching order.
- Keys are input-free sources. Insert each key before its first state consumer;
  each consumer introduces at most one new key, and every key is consumed. A key's
  round matches its consuming state. Dependency order, not ascending round number
  or declaration order, determines consumption.
- Transforms with inputs need compiled lineage for every presented output bit.

Diagnostics are `presentation.spn-role-required`, `presentation.spn-round-required`,
`presentation.spn-order-unsupported` and `presentation.spn-lineage-required`.
Correct the graph or use a raw trace. The standalone schedule instead follows
generation dependencies and source round-key identities; it does not require
the cipher's single state chain. See the runnable
[AES demos](../frontend/demos/AES_V2_DEMOS.md) and
[sliding-window schedule](../frontend/demos/slidingWindowLesson.ts).

V2 retains one immutable event per operation, including sources, with primitive
identity, resolved value and authored annotations. Existing trace budgets may
truncate it. Presentation keeps retained rows and omits edges with missing
endpoints; it never reruns a graph to obtain a value. Compiled lineage belongs
to the main-thread graph. It is absent from worker messages and snapshots;
the current worker recompiles the authored graph. Existing execution limits and
dry-run validation still apply.

## Overlay authoring and inspection

The compiler derives anchor pairs from ordinary cross-Step bindings, for example
`key1.value: {step: schedule, output: rk1.value}`. The source must be an earlier
executing Step, or the paired schedule named by a comparison's `keyChange`.
All keys must bind to that one schedule, every anchor must be an
exported `round-key` output of equal bit width, and no anchor may be reused by
two cipher keys. Source/output/concat nodes may all supply anchors. Names do not
identify them. Consumption must be monotonic forward or reversed relative to
schedule key identities, without mixing directions.

An omitted/false `overlay` disables overlay discovery even when bindings exist.
`overlay: true` is valid only for a v2 cipher `spn-cipher`, not standalone mode.
Invalid content receives `lesson.invalid-overlay-kind`,
`lesson.overlay-without-schedule-binding`, `overlay.unbound-round-key`,
`overlay.multiple-schedule-steps`, `overlay.duplicate-anchor`,
`overlay.not-round-key`, `overlay.width-mismatch` or
`overlay.schedule-order-inconsistent`; unavailable/later Step references use
the existing Lesson binding diagnostics. Correct the content and reload/rerun.

The current confirmed behavior is:

- The complete schedule starts closed, without persisted open state. A stateful
  toolbar toggle and generic show/close buttons on bound cipher rows open/close
  the same complete covering lane. Every control shows it while closed and closes
  it while open, preserving sizes. Single-execution overlays preserve origin;
  comparison overlays clear it. A different bound row does not
  select or filter a key. There is no automatic whole-key selection or scrolling.
- The lane covers cipher bit controls and aligns schedule keys to their cipher
  AddRoundKey operation rows. Cipher labels and values remain; outside content
  fades and table headings stay bold. Stage/source/round metadata columns remain
  horizontally reachable. Equal-size units align across rows. Alignment padding
  exists only while open; closing restores the compact geometry, with vertical
  movement accepted.
- Decryption reorders schedule blocks into consumption order while preserving
  each block's internal generation order and original key identity. Shared
  generation batches appear once. An expandable original-generation-order value
  table retains the forward reference; visible source metadata distinguishes it
  from consumption order. AES-128's inverse Step uses rk10 through rk0 from the
  same forward schedule.
- Cipher and schedule each have one independent view-wide unit control, including
  the covering/standalone schedule. Each offers the positive common divisors of
  its own selectable row widths and defaults to 1. There are no row-local sizes
  or forced shared cipher/schedule size. Authored `unit` boundaries stay separate.
- Deliberately clicking a unit replaces the origin with all its bits. Exact
  underlying dependencies determine related groups; touching a group never adds
  its other bits to traversal or visits an ancestor's unrelated descendants.
  In single-execution overlays, anchor bits correspond one-to-one in both
  directions, without cross-view edges. Comparison selection stays view-local.
  Deliberate and related groups have distinct states. Accessible status retains
  source view, row and selected group/range even when the source is covered.
- Group values use full-width hexadecimal from four bits, preserving leading
  zeroes (`0x0a`, `0x000a`); smaller units use binary. Labels, tooltips and status
  use the same values. Choices name 4/8/32 bits as nibble/byte/word in both locales.
  Relationship lines aggregate by group pair. No partial-bit fractions such as
  `8/32`, related-position lists or bit-detail panels appear. Row spacing remains
  readable through grouping and selection. Numeric byte separators preserve the
  full accessible value.
- Opening/closing from either control preserves both unit sizes and preserves
  origin for single executions; comparisons clear origin. Locale/resize or
  reselecting an active size preserves origin and sizes. An actual size change clears origin and
  preserves overlay visibility. Locale/resize and active-size re-click also
  preserve visibility. An actual direction change, replacement execution
  or Lesson re-entry clears origin, closes the lane and resets both sizes to 1.
  Explicit clear removes origin without changing visibility.

These rules incorporate [independent controls](https://github.com/CSUWangj/cryptography-learning/issues/109#issuecomment-6527372103),
[grouped inspection/hexadecimal/spacing](https://github.com/CSUWangj/cryptography-learning/issues/109#issuecomment-6532940081),
[alignment/toggle/named units](https://github.com/CSUWangj/cryptography-learning/issues/109#issuecomment-6542066925)
and the [restored bold headings and generic row controls](https://github.com/CSUWangj/cryptography-learning/issues/109#issuecomment-6542738836).
The latter supersedes the preceding comment's heading-weight and row-control
removal clauses. Grouped inspection supersedes the older D-Q4/P4-A2 fraction
and exact-position display obligations, while preserving exact traversal.
The current generic row actions reflect global visibility, so the earlier
identity-specific "another opener keeps open" interaction is not a separate
per-key mode. The source implements each visible Close action as a close.

## Manual author checklist

1. Audit the authored root and all locale documents. Keep `version: 1` for
   comparison/classical presentations or any content not yet manually converted.
2. Copy the Lesson before editing; declare `version: 2` explicitly. Preserve IDs
   and public destinations unless a separate content change authorizes a move.
3. Convert operations and ports deliberately, with explicit tables and ranges.
   Check gather versus scatter and full-state versus extracted-word semantics.
4. Add roles/rounds/iterations/grouping for the requested presentation. Remove
   legacy `traceLevel`, stage-name assumptions and v1 descriptor declarations.
5. Project exact logical bit ranges and export through nodes. Update later Step
   bindings to resolved widths. Check non-byte-aligned packing and AES-192 batches.
6. Choose raw, `spn-cipher`, or standalone `mode: key-expansion`. Request overlay
   explicitly and bind every cipher key to one earlier schedule's exported anchor.
7. Supply en-US/zh-CN titles, prose and every label override. Stable identifiers
   remain unchanged. Correct diagnostics rather than suppressing validation.
8. Validate defaults with `npm run validate-lessons -- <root>` under the pinned
   toolchain. Check known literal outputs/trace values and notice/version behavior.
9. Inspect the real Lesson in both languages, desktop/narrow layouts and supported
   themes. Check independent schedule access, groups, overlay ordering, preservation
   and resets. Compile/dry-run success alone does not prove these interactions.

Public synthetic fixtures and this guide belong here. Private Lessons, Lab
Descriptions, Challenges and Lab Registry content belong in the private content
repository; Host orchestration belongs in the private infrastructure repository.
No private migration, deployment change or timetable is part of #114. Manual
recovery remains correcting authored documents and reloading/rerunning the
existing workflow. See the delivery map for remaining verification gaps.
