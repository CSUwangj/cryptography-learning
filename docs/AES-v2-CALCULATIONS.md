# AES-192/256 v2 calculation evidence

These authored Lesson fixtures implement the calculation slice of [#105](https://github.com/CSUWangj/cryptography-learning/issues/105), following [#95 P3](https://github.com/CSUWangj/cryptography-learning/issues/95) and the [#99 Lesson-data ownership clarification](https://github.com/CSUWangj/cryptography-learning/issues/99#issuecomment-6294254536). They reuse the AES-128 v2 fixture's registered primitives and public Lesson compiler/runtime. No algorithm factory, renderer, dependency or interactive demo is added.

## Independent known answers

The expected literals are the approved original FIPS-197 Appendix C.2/C.3 vectors ([NIST source](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.197.pdf)), rather than values calculated by the implementation under test. Both use plaintext `00112233445566778899aabbccddeeff`.

| Value | AES-192 | AES-256 |
| --- | --- | --- |
| Input key | `000102030405060708090a0b0c0d0e0f1011121314151617` | `000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f` |
| rk0 | `000102030405060708090a0b0c0d0e0f` | `000102030405060708090a0b0c0d0e0f` |
| rk1 | `10111213141516175846f2f95c43f4fe` | `101112131415161718191a1b1c1d1e1f` |
| Final round key | rk12 `a4970a331a78dc09c418c271e3a41d5d` | rk14 `24fc79ccbf0979e9371ac23c6d68de36` |
| Ciphertext | `dda97ca4864cdfe06eaf70a0ec0d7191` | `8ea2b7ca516745bfeafc49904b496089` |

## Authored state and source identities

- [AES-192 fixture](../frontend/src/lesson_runtime/fixture/aes192-v2.yaml): `batch-0` generates w6..w11, with value `5846f2f95c43f4fe544afef55847f0fa4856e2e95c43f4fe`. `round-key-1` concatenates `key.value[128,64]` and `batch-0.value[0,64]`. The first 64 output bits correspond to original-key bits 128..191; the next 64 correspond to batch-0 bits 0..63. Upstream XOR dependencies retain their corresponding-position structural fan-in. `batch-7` generates w48..w51 in its leading 128 bits and retains w46..w47 in its tail, keeping a 192-bit state. Only the leading generated bits are exported as rk12.
- [AES-256 fixture](../frontend/src/lesson_runtime/fixture/aes256-v2.yaml): batches 0..5 each generate eight words, including byte substitution on word 3 between the two four-word XOR chains. `batch-6` generates w56..w59 without a middle SubWord, retains w52..w55 in its tail and keeps a 256-bit state. Only its leading generated bits are exported as rk14.
- Schedule operation rows carry full-width values, `role: state`, zero-based `iteration` and 32-bit grouping units. Export nodes carry `role: round-key` and their consumption round. All 13/15 exported keys are 128 bits and bind from the `schedule` Step to the corresponding `cipher` source ports. The retained final tails are state, never additional newly generated round keys.
- Each fixture has en-US and zh-CN title, summary and Step prose resources beside it. Primitive labels reuse the existing bilingual registry. No new label override is needed.

## Reproducible regression checks

Run from the repository root, using the pinned frontend Node version:

```sh
fish -lc 'cd frontend; and nvm use; and npm test -- src/lesson_runtime/aesV2.test.ts src/visualizers/aesV2.test.ts --maxWorkers=1'
fish -lc 'cd frontend; and nvm use; and npm run typecheck'
```

[Lesson regressions](../frontend/src/lesson_runtime/aesV2.test.ts) compile the authored fixtures and execute both Steps through `createBrowserLessonSession` and real worker requests. They check the known answers, every rk1 concat dependency, batch-0 XOR dependencies, final-state widths, exact final projections, tail pass-through, middle SubWord presence/omission, exported/bound widths and identities, preserved schedule snapshots, and independent copies of exported, traced and consumed values.

[Shared-renderer regressions](../frontend/src/visualizers/aesV2.test.ts) compile the same fixture documents and execute real worker requests. They check full-width state rows, 128-bit final-key rows, bilingual primitive labels and locale resources, and accessible final key/ciphertext rows through `RenderHost`.

Source-backed red calculations reversed the AES-192 rk1 concat and omitted the AES-256 middle SubWord. Each failed its independent known-answer assertion, then passed after the fixture was corrected. Other assertions passed on first execution and document existing compiler/runtime/rendering behavior.

The session tests replace Worker transport with an in-process stand-in; they do not verify browser Worker isolation, cancellation or timing. Rendering checks use jsdom and supply no browser interaction, theme/layout or overlay acceptance. Full planner checks, production build and independent reviews remain separate evidence; these calculations do not satisfy the #94 first-real-page gate or expand #109 demos.
