# AES-192 overlay prototype

Throwaway reference for [#95 P0](https://github.com/CSUWangj/cryptography-learning/issues/95).
The maintainer selected D's covering surface and AddRoundKey alignment in
the [P0 feedback record](https://github.com/CSUWangj/cryptography-learning/issues/94#issuecomment-6148361856).
The complete D-Q1-Q7 interaction baseline is confirmed by
[D-Q8](https://github.com/CSUwangj/cryptography-learning/issues/94#issuecomment-6153109659);
the focused D interview is closed.
The prototype's independent styling is not a production acceptance baseline.
This delivery covers the AES-192 overlay slice only; the separate Learning Shell
preview and phases P1-P5 are not implemented.

## Run

From the repository root, with the pinned Node toolchain:

```sh
fish -lc 'cd frontend; and nvm use; and npm run prototype:aes192'
```

Open `http://127.0.0.1:4180/testaescipher?prototype=overlay&variant=D` for the
selected interaction. A/B/C remain available for comparison.
The focused D decision session does not reopen A/B/C.
Vite chooses another port if 4180 is already occupied; use the printed address.

The existing AES demo route hosts the prototype only with `prototype=overlay` in
development. The production app and default AES demo remain unchanged.

| Variant | Surface | Schedule key alignment |
| --- | --- | --- |
| A | Simultaneous cipher/schedule | Cipher round-key row |
| B | Simultaneous cipher/schedule | AddRoundKey operation row |
| C | Toggleable covering lane | Cipher round-key row |
| D | Toggleable covering lane | AddRoundKey operation row |

The bottom arrows or unfocused left/right keys switch variants. URL parameters
`lang=zh-CN` and `direction=reverse` also survive reloading. The covering variants
start closed; a round-key control opens/closes the lane. The toolbar's layer/close
control provides the same action. Cipher bit controls are unavailable while covered;
their operation labels and values remain visible. Selection remains observable
when closing the lane so the consequence of a schedule selection can be inspected.

## Evidence boundaries

- Values come from the existing AES-192 key-expansion, forward-cipher and inverse
  CryptoGraphs, using the incremental-byte key and FIPS plaintext. No new AES
  implementation, v2 compiler, worker, backend or private content is introduced.
- The prototype adapts existing `keyExpansionPresentation` and
  `blockCipherPresentation` data. It renders with shared `TraceTable`,
  `ComparisonRow`, `ValueCell` and `LineageDiagram` components. Its separate explicit
  `visualizers/prototype.ts` entry is imported only by the demo, not the production
  Visualizer catalog or RenderHost.
- The adapter exposes the initial schedule state, first generated six-word batch
  and rk0/rk1/rk2. Round-key projection edges are explicit fixture relationships:
  rk1 combines initial-key w4/w5 and generated w6/w7. This is a P0 fixture adapter,
  not an implementation of generic v2 lineage or binding discovery.
- Cross-anchor dependencies are directed from schedule to cipher. Ancestors and
  descendants are traversed separately from the selected bits using the existing
  `relatedBitIds`; reaching an ancestor never starts another descendant traversal.
  Unit aggregation is for drawing only. Related counts and the bit-lineage table
  retain exact bit identities. Displayed unit values do not indicate differences
  between executions; this is not an avalanche comparison.
- The reverse slice is the final three key consumptions of the real AES-192 inverse
  execution, preceded by its actual state before rk2. It is not a complete decryption
  display. It uses the same source schedule as forward mode. Schedule blocks are
  displayed in reverse consumption order, while RotWord/SubWord/Rcon/XOR stay in
  computation order. Original source-order numbers and a generation-order table
  remain visible. The maintainer accepted this ordering in D-Q3 below; the
  first-real-page checkpoint remains separate.
- Fixed-fixture assertions check known ciphertext, inverse recovery, cross-batch
  rk1, absence of word widening/cousin propagation, whole-word selection and all
  four direction/anchor combinations. These checks do not prove P2-P5 acceptance.
- No persistence. Full relevant selection/layout state is also logged to the browser
  console after changes. No prototype decision has been promoted into production.

## Verification (2026-10-13)

- Pinned Node: `npm ci`, `npm run typecheck` and `npm run build` passed.
- `npm test -- --maxWorkers=1`: 17 files, 222 tests passed outside the sandbox.
  The first sandboxed run encountered child-process EPERM and timing failures;
  no tests or time limits were changed. The successful run still emits the existing
  jsdom/xterm canvas warning.
- Playwright checked all four variants in both directions, exact byte/word/bit
  selection, key/operation anchors, covering controls, bilingual rendering and
  keyboard switching. Desktop and 390/320px widths passed; horizontal overflow
  stays inside the trace viewport. Desktop/mobile screenshots were inspected.
- Backend and Docker baseline checks were not run: this change is demo-only.
- The maintainer selected D's surface/alignment and confirmed D-Q1 through D-Q7
  below, including final shared-understanding confirmation in D-Q8. No D interaction
  decision remains open. The Learning Shell preview is outstanding, so P0 is not
  complete. P1-P5 have not started.

## Maintainer feedback (2026-10-13)

- **Selected: D.** Cover the cipher controls with a toggleable schedule lane and
  align schedule round keys to cipher AddRoundKey operation rows. Side-by-side
  variants A/B were rejected because the real 1-bit view has constrained horizontal
  space. D is preferred over C; no separate anchor rationale was supplied.
- **Production fidelity:** reuse the current production components and visual
  conventions. Do not copy this prototype's palette, typography, spacing, custom
  unit buttons or page layout into production without separate approval. Confirm
  the interaction in the actual Learning 1-bit view at the first-real-page gate.
- **Themes:** excluded from the focused D decision session. No theme system, new
  default styling or phase expansion is authorized by this feedback.
- Existing staged ADRs remain unchanged. The newer #94 feedback record resolves
  their previously pending interaction choices; the issue records govern that scope.

## Confirmed D interactions

Authority: [D-Q1 through D-Q4](https://github.com/CSUwangj/cryptography-learning/issues/94#issuecomment-6152987752),
explicitly accepted by the maintainer on 2026-10-13.

- **D-Q1:** default closed; open deliberately. This supersedes the stash's automatic
  expansion. Do not persist the open state.
- **D-Q2:** one shared lineage selection survives opening and closing. The historical
  multiple-opener interaction is superseded below. Only choosing a unit replaces the source bits with
  all bits of that unit. Keep its source view/row and bit range identifiable in
  the visible selection status even when covered. Clear/reset actions end it.
  This is the v2 single-execution contract, not a change to v1 or #67 comparison.
- **D-Q3:** reverse schedule blocks, preserving their internal operation order
  and original identities. The slice is `[rk2]`, `[RotWord1, SubWord1, Rcon1,
  XOR1, rk1]`, `[Input, rk0]`; do not duplicate the shared batch. Upward dependencies
  are accepted. Retain original order/numbering and the expandable original-order
  value table. Screen order does not imply reverse key generation.
- **D-Q4 (historical display contract, superseded):** visible related counts such as `8/32`, a distinct explicit-selection
  state, and inspectable exact positions are sufficient. Keep accessible counts,
  tooltip ranges and the bit-lineage details; within-word shading is not required.
  Only eight bits propagate until the student deliberately selects the word.
  Apply these meanings through existing production styling.

The [October 30, 2026 #109 correction](https://github.com/CSUWangj/cryptography-learning/issues/109#issuecomment-6532940081)
supersedes D-Q4's fractions, related-bit lists and detail-panel display requirements.
Production inspection now displays group relationships with full-unit selection,
hexadecimal values from four bits and stable readable row spacing. Exact traversal
remains required. The prototype descriptions and screenshots above are historical;
they do not define the current production display contract.

Authority for the following refinements:
[D-Q5 through D-Q7](https://github.com/CSUwangj/cryptography-learning/issues/94#issuecomment-6153060431).

- **D-Q5:** actually changing selection granularity clears selection but preserves
  overlay visibility. A different execution result, a direction change, or leaving
  and re-entering the Lesson clears selection and restores the default closed view.
  Language changes, resizing and re-clicking the active mode preserve both. Explicit
  clear only ends selection. No persistent state is added.
- **D-Q6 (historical opener UI, superseded):** a round-key opener shows the complete schedule. Re-clicking that opener
  closes it; clicking another while open changes its indication and leaves the
  schedule open with the same selection. It does not filter to one round, select
  the whole key or automatically scroll to an anchor. The toolbar controls only
  whole-schedule visibility.
- **D-Q7:** alignment padding exists only while the overlay is open. Closing removes
  overlay-only gaps and restores compact cipher row order. Vertical movement is
  accepted; selection and dependency meaning do not change.

The [October 31, 2026 maintainer correction](https://github.com/CSUWangj/cryptography-learning/issues/109#issuecomment-6542738836)
supersedes the earlier assistant interpretation of heading weight and row-control
removal in comment 6542066925. Production v2 retains bound-row buttons with generic
localized show/close text and no numbered round-key suffix, plus the separate
toolbar toggle. All toggle the complete schedule, preserving exact selection and
independent view sizes. Original bold headings are restored and the accepted
outside-overlay fading is retained. D-Q6 remains historical prototype context;
legacy production callers retain their existing lifecycle.

## Decision and prototype differences

The assembled D baseline is confirmed by D-Q8 and the focused interview is closed.
This confirms requirements only; it does not start the Shell preview, P1-P5 or
theme work. The first-real-page checkpoint and real-Shell preview remain separate.

This documentation round does not modify prototype runtime behavior. The prototype
still clears selection on re-clicking the active mode and retains alignment gaps
while closed; both differ from D-Q5/Q7. Its fixed fixture does not exercise execution
replacement, and its selection status does not consistently identify the source
view. Verify D-Q2's explicit source-view/row status and the complete reset/layout
contract on the first real page. Earlier prototype tests do not prove these changes.

## Remaining Learning Shell preview

The separate #95 P0-A5/A6 preview is still required and has not been built:

- Use the real Shell, two Learning categories and fixture title metadata.
- Show localized titles in the popup, catalog and current-Lesson breadcrumb,
  including long English/Chinese titles, catalog access and existing destinations.
- Include representative prose and a wide trace, coherent left edges and local
  trace scrolling. Start with candidate 24px desktop/16px narrow gutters and about
  48rem prose width; these are adjustable candidates, not approved fixed dimensions.
- Inspect both locales on desktop and narrow screens, including navigation below
  the current 520px Shell breakpoint. Reuse production visual conventions.
- Record maintainer acceptance before declaring this part of P0 complete. No
  backend parsing, P1-P5 implementation or theme presets are included.

Capture confirmed interactions, rejected alternatives and reasons in #94 before
dependent work. Repository policy forbids agent commits; preserve this prototype
as staged work for maintainer-controlled capture, without changing the existing stash.
