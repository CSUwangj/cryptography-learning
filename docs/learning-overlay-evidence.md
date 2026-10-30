# First real Learning overlay evidence (#108)

This candidate implements [#108](https://github.com/CSUWangj/cryptography-learning/issues/108)
against the accepted D and Shell decisions linked there. It prepares the
[first-real-page checkpoint #109](https://github.com/CSUWangj/cryptography-learning/issues/109);
automated checks do not approve that checkpoint or authorize P5.

## Reproduce the real page

Use the pinned Node version through Fish and nvm. Install once with `npm ci`,
then keep dependencies unchanged during checks. From the repository root:

```sh
fish -lc 'cd frontend; and nvm use; and npm run typecheck'
fish -lc 'cd frontend; and nvm use; and npm test -- src/lesson_runtime/overlay.test.ts src/visualizers/overlay.test.tsx src/visualizers/aesV2.test.ts --maxWorkers=1'
fish -lc 'cd frontend; and nvm use; and npm run build'
fish -lc 'cd frontend; and nvm use; and PLAYWRIGHT_ARTIFACT_DIR=/tmp/ticket108-20261030/browser-review npx playwright test e2e/overlay.spec.ts --project=chromium'
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
| Shared exact origin; partial counts and positions; no ancestor sibling widening; deliberate words replace the origin | RenderHost interaction suite and browser selection contract; two real AES cross-batch bit origins and deliberate-word case |
| Granularity, actual direction, different execution and re-entry resets; locale/resize and unchanged-mode preservation; independent clear | RenderHost direction/result tests; real Learning opener/reset/locale/resize/input/direction cases. The direct direction test changes metadata on a mounted RenderHost; the browser direction case reloads changed authored content. |
| Same/different opener behavior, whole-schedule toolbar, compact close and open-only alignment padding | Browser shared-selection contract; small and AES-192 geometry cases compare initial closed and reclosed table/row heights, padding, IDs and values with the opt-out baseline while retaining origin |
| Original-generation positions and expandable original-order values | RenderHost reversed-block suite and three-anchor fixture |
| Standalone schedule, immutable prior snapshots and truncated values/edges | Standalone real Learning selection, RenderHost snapshot comparison and bounded real Worker browser case |
| Accepted Shell, centered 60rem prose, full-width trace, 24px/16px gutters, local scrolling and long titles | Production Learning geometry case; real AES 1-bit screenshots in en-US/zh-CN at 1440px and 320px, light and dark |

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

An existing AES browser test also failed before overlay interaction while waiting
for the cipher mount, including on the immutable base. The new AES cases use an
explicit mount wait before retaining the visible assertion, and separate
independent origins without enlarging deadlines. This evidence does not establish
a general application performance fix. Review the recorded failures alongside the
passing candidate checks. Initial test-authoring failures are retained too.

The maintainer still needs to inspect the first real page and decide #109.
No theme redesign, additional cipher variants, comparison support or P5 work is
included.
