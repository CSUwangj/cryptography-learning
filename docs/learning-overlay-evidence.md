# First real Learning overlay evidence (#108, #109 correction)

This candidate implements [#108](https://github.com/CSUWangj/cryptography-learning/issues/108)
against the accepted D and Shell decisions linked there. It prepares the
[first-real-page checkpoint #109](https://github.com/CSUWangj/cryptography-learning/issues/109);
automated checks do not approve that checkpoint or authorize P5.

The maintainer rejected the per-row unit controls on October 30, 2026. The
recorded #109 correction gives all cipher rows one selection-unit control and
all schedule rows a separate control, including the covering overlay. Each
control offers the positive common divisors of its own view's row widths and
starts at 1. AES-192 therefore permits a 128-bit cipher unit independently of a
64-bit schedule unit (the schedule contains both 128-bit keys and 192-bit states).
Standalone schedule
inspection has one control for its complete schedule. Sizes belong to each
inspection instance, without an application preference or persistence.

Changing either size clears the shared exact origin and preserves visibility
and the other size. Selecting the active size, opening/closing,
language changes and resizing preserve both sizes and selection. Execution,
direction and re-entry resets retain their existing boundaries. This corrected
candidate still requires refreshed review and explicit human approval in #109.

The next maintainer correction, recorded in
[#109 on October 30, 2026](https://github.com/CSUWangj/cryptography-learning/issues/109#issuecomment-6532940081),
supersedes the older partial-bit display contract. Unit inspection now selects
complete groups and draws each visible source/target group pair once. Related
groups remain distinct from deliberate selections, but no fractions, related-bit
position lists or bit-lineage detail panels are displayed. Exact dependency
traversal still determines related groups without widening them into new origins.
The independent original-order schedule value table remains available.

Units of at least four bits use full-width hexadecimal, including leading zeroes;
smaller units remain binary. Buttons, accessible names, status and tooltips agree.
V2 operation rows use consistent readable base spacing through unit changes and
selection, while overlay-only alignment rows still disappear on close.

The [October 31, 2026 maintainer correction](https://github.com/CSUWangj/cryptography-learning/issues/109#issuecomment-6542738836)
supersedes the earlier assistant interpretation of heading weight and row-control
removal in comment 6542066925. Bound cipher rows retain generic localized show/close
buttons without numbered round-key suffixes, alongside the toolbar toggle. Every
control reflects and toggles the complete schedule; closing and reopening preserve
the exact origin and both view sizes. Legacy round-key caller lifecycles remain unchanged. Equal-size
cipher units align across operation rows, including differing binary and hexadecimal
values. Original table headings retain bold weight, and table cells outside the open
schedule fade relative to its retained generation, stage, source, round and value
columns. Both languages name 4-bit, 8-bit and 32-bit units as nibble, byte and word;
other common divisors remain available.

## Reproduce the real page

Use the pinned Node version through Fish and nvm. Install once with `npm ci`,
then keep dependencies unchanged during checks. From the repository root:

```sh
fish -lc 'cd frontend; and nvm use; and npm run typecheck'
fish -lc 'cd frontend; and nvm use; and npm test -- src/lesson_runtime/overlay.test.ts src/visualizers/overlay.test.tsx src/visualizers/aesV2.test.ts --maxWorkers=1'
fish -lc 'cd frontend; and nvm use; and npm run build'
fish -lc 'cd frontend; and nvm use; and PLAYWRIGHT_ARTIFACT_DIR=/tmp/ticket109-20261030/browser-review npx playwright test e2e/overlay.spec.ts --project=chromium'
```

The existing Playwright configuration starts the local app and demo servers.
For built-asset inspection, first run `npx vite preview --host 127.0.0.1 --port 4177`
through the same Fish/nvm environment in `frontend`; Playwright reuses that local
server. Leave `PLAYWRIGHT_BASE_URL` unset: these tests intentionally substitute
only the authored document/catalog boundary. Compilation, session navigation,
execution and the browser Worker are real. No fabricated execution snapshots or
prototype adapters are used. Screenshot paths stay outside the checkout.

For interactive maintainer inspection, add `--debug` and select a case with
`--grep 'production AES'`. Step through the two theme screenshots before ending
the test. The long title is a bilingual test document variation; the schedule,
anchors and ciphertext are the public AES-192 fixture.

## Evidence map

| Contract | Runnable evidence |
| --- | --- |
| Explicit opt-in; complete, unique, equal-width anchors from one schedule; stable diagnostic categories; names do not identify anchors | `src/lesson_runtime/overlay.test.ts`; RenderHost repeat-export case checks canonical anchors, real execution values and exact bit mapping; Chinese invalid-document browser case rejects before creating a Worker |
| Default closed; operation-row alignment; covered cipher controls unavailable; reversed blocks with original identities and unique shared work | `src/visualizers/overlay.test.tsx`; reversed three-anchor real Learning browser case |
| Shared exact origin; related groups without bit details; no ancestor sibling widening; deliberate groups replace the origin | RenderHost interaction suite, compiled SPN/schedule `relatedBitIds` regressions and browser selection contract; two real AES cross-batch origins and deliberate-word case |
| One independent control per complete cipher/schedule view; separate common-divisor choices; no row overrides or cross-instance preference | RenderHost AES 128-bit cipher / 64-bit schedule case; real Worker independent-control and standalone checks. SPN gather and schedule projections retain exact traversal across common-unit boundaries while displaying groups. |
| Full-width hexadecimal from four bits; binary smaller units; matching accessible values | Compiled Teaching SPN 0x0a/0x000a and binary cases; real AES 128-bit leading-zero value; grouped browser controls/status/tooltips |
| Stable readable spacing and one relationship per visible group pair | Public LineageDiagram pair/state regression; real Learning standalone/cipher/covering geometry at units 1/4/8/32 before/after selection, with anchor alignment and compact close |
| Granularity, actual direction, different execution and re-entry resets; locale/resize and unchanged-mode preservation; independent clear | RenderHost direction/result tests; real Learning toggle/reset/locale/resize/input/direction cases. The direct direction test changes metadata on a mounted RenderHost; the browser direction case reloads changed authored content. |
| Generic bound-row controls and stateful toolbar toggle for the complete schedule, compact close and open-only alignment padding | Bilingual RenderHost and browser shared-selection lifecycle; small and AES-192 geometry cases compare initial closed and reclosed table/row heights, padding, IDs and values with the opt-out baseline while retaining origin |
| Equal-size cipher-unit widths and positions across all rows; original bold headings and accepted outside-overlay fading; bilingual named sizes | Small real Worker geometry case measures every unit at 1/2/4/8/16/32 bits in both locales, light/dark themes and 1440px/390px viewports; retains schedule metadata-column, marker-containment and right-edge checks |
| Original-generation positions and expandable original-order values | RenderHost reversed-block suite and three-anchor fixture |
| Standalone schedule, immutable prior snapshots and truncated values/edges | Standalone real Learning selection, RenderHost snapshot comparison and bounded real Worker browser case |
| Accepted Shell, centered 60rem prose, full-width trace, 24px/16px gutters, local scrolling and long titles | Production Learning geometry case; real AES grouped screenshots in en-US/zh-CN at 1440px and 320px, light and dark |

Source fixtures are
[`aes192-v2.yaml`](../frontend/src/lesson_runtime/fixture/aes192-v2.yaml) and
[`overlay-three-anchor-v2.yaml`](../frontend/src/lesson_runtime/fixture/overlay-three-anchor-v2.yaml).
The accepted reverse order is `[rk2]`, `[RotWord, SubWord, Rcon, XOR, rk1]`,
`[Input, rk0]`, preserving forward operations inside each block.
AES-192 round key 1 is `10111213141516175846f2f95c43f4fe`; the generated first
batch is `5846f2f95c43f4fe544afef55847f0fa4856e2e95c43f4fe` and the ciphertext is
`dda97ca4864cdfe06eaf70a0ec0d7191`.

## Limits and checkpoint

The browser harness supplies public authored documents and catalog metadata; it
does not validate deployment content or a live Host. Chromium is the required
browser evidence here; Firefox, WebKit and Docker baseline are not part of this
candidate's executed checks. No backend or schema contract changes are made.
The retained failed attempts and exact staged-check logs belong to the external
handoff packet, not this document.

Historical #108 AES browser attempts failed before overlay interaction while
waiting for the cipher mount, including on that investigation's immutable base.
The overlay cases retain their explicit mount waits and separate origins without
enlarging deadlines. The required `demo_browser` attempts (12/13, then 11/13) also
remain failed, with locale reload/readiness timeouts and no established cause or
approved exception. New focused evidence does not erase those failures or prove
the complete planner suite. Review the external packet's actual check status and
retained first failures; this correction introduces no performance fix.

The maintainer still needs to inspect the first real page and decide #109.
No theme redesign, additional cipher variants, comparison support or P5 work is
included.
