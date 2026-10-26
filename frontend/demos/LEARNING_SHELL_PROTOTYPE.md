# Learning Shell prototype

Throwaway evidence for [#95 P0-A5/A6](https://github.com/CSUWangj/cryptography-learning/issues/95).
Question: do the real Shell's Learning navigation, long localized titles and
prose/trace spacing work together on desktop and narrow screens?

## Run

From `frontend`, activate its pinned Node version and run:

```sh
npm run prototype:learning-shell
```

- English: <http://127.0.0.1:4181/learning/aes-192-long?prototype=shell&lang=en-US>
- Chinese: <http://127.0.0.1:4181/learning/aes-192-long?prototype=shell&lang=zh-CN>
- Catalog: <http://127.0.0.1:4181/learning?prototype=shell&lang=en-US>

Vite selects another port if 4181 is occupied; use the printed port. The entry
exists only in the development demo runner. The production route tree does not
import it. On this machine use Fish and `nvm use` before Node commands.

## Accepted preview and fixture boundary

- One candidate follows the already scoped Shell preview. No new A/B/C/D variants,
  theme presets or overlay decisions are introduced.
- The real `Shell` owns the header, existing destinations, language selector and
  light/dark control. The preview renders that production Shell directly and
  supplies only local Apollo catalog data; no Shell override or injection hook is
  used. Original callers retain their existing behavior.
- The Learning popup follows Practice's two-column category/entry interaction,
  closes on navigation, and keeps `/learning` available as the full catalog. Opening
  it on a Lesson selects that Lesson's category. Header truncation retains the
  full accessible title; the page breadcrumb, heading and menu wrap the full text.
- Fixture metadata provides two categories and four Lessons, including long
  English and Chinese names. All three naming surfaces use these same objects.
  Foundations provides text-only pages; Block ciphers adds a wide trace.
- Following maintainer feedback, accepted spacing starts at 24px desktop / 16px
  at or below 520px and a centered 60rem prose measure. The bottom spacing
  disclosure changes these values in memory. Reload resets them. The trace
  viewport keeps the full width inside the gutters and its own horizontal
  scrolling, extending beyond the centered prose on wide screens. The maintainer
  accepted this layout in the subsequent canvas-border feedback.
- The visualization has a 1px border using `learningColors.border`, a 4px corner
  radius and 12px internal spacing to distinguish its scrollable canvas. This
  styling stays in the prototype; the shared renderer is unchanged. Existing
  browser scrolling remains available; no pointer-drag/pan gesture was added.
- Within this prototype, the home label becomes an icon at 1100px; utility and
  Practice labels become icons at 768px. At 520px the header breadcrumb also
  hides its category. The full page breadcrumb remains visible. This preview
  arrangement is accepted; production integration remains a later phase.
- `Markdown` and `LearningPresentationView` retain production typography and
  controls. The trace adapter uses the public AES demo plaintext, first round
  key and initial XOR value, with 128 individually selectable bits per row.
  It does not calculate a new execution, attach lineage, or exercise any D
  overlay interaction. No AES prototype CSS is imported.
- The real Practice menu receives one local fixture category/Lab. Home, Practice,
  Feedback and Completion destinations have placeholder bodies in this runner;
  their URL navigation is inspectable, but their application workflows are not
  under test. No backend or Challenge connection is made.

## Verification

The runnable browser check is `demos/learning-shell.browser.mjs`:

```sh
node demos/learning-shell.browser.mjs
```

Use `PROTOTYPE_ORIGIN` for a different local port. If Playwright's default Chromium
is unavailable, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed executable.
The check exercises both locales, desktop/narrow navigation, full-title wrapping,
keyboard activation and dismissal, catalog routes, trace scrolling/selection,
language changes, existing destination navigation, and adjustable spacing.
It writes local screenshots to `/tmp/learning-shell-{en-US,zh-CN}-{1440,320}*.png`.

Initial preview verification on 2026-10-13:

- Pinned Node 24.18.1: `npm ci`, `npm run typecheck`, `npm run build` passed.
- Initial `npm test -- --maxWorkers=1`: 17 files / 222 tests passed. The final
  full rerun had 221 passing tests and one failure at
  `CompletionRecords.routes.test.tsx:95`: the initial lazy route remained on its
  loading spinner when the heading query timed out. The focused rerun
  `npm test -- src/app/CompletionRecords.routes.test.tsx --maxWorkers=1` passed
  all 24 tests. The failure's timing cause was not established; the final full
  run is not claimed green. The existing jsdom/xterm canvas warning remains;
  no test or timeout was weakened.
- Playwright passed both locales at 1440, 1100, 768, 521, 520, 390 and 320px.
  Assertions cover non-overlapping Shell buttons, Tab/Enter/Escape, category
  selection, close-on-navigation, matching popup/catalog/breadcrumb titles,
  text-only pages, local trace scrolling, selecting bit 127, language changes,
  existing destination navigation, reload and adjustable/resettable spacing.
  Popup geometry is checked after Blueprint's CSS opening transition finishes.
- Desktop and 320px screenshots were inspected in both languages, including
  the popup. Final browser run reported no page errors.
- The local server and Chromium required execution outside the sandbox because
  the sandbox blocked listening sockets / browser startup. No live Host or
  deployment probing was performed.
- Backend tests and Docker baseline were not run: no deployable data path or
  schema changed. The real destination workflows, D interactions and real v2
  execution are not covered by this preview.

Centered 60rem iteration verification on 2026-10-13:

- Typecheck passed. The updated browser check passed both locales at all seven
  widths above, including exact 960px maximum prose width, symmetric centering,
  full-width local trace scrolling, adjustable widths and the 60rem reload default.
- Desktop screenshots in both locales and the Chinese 320px screenshot were
  inspected. No browser errors were reported.
- Full unit tests, build, backend tests and Docker baseline were not repeated
  for this two-line prototype layout change. The earlier full-suite failure
  remains recorded above and is not considered resolved by these browser checks.

Canvas-border iteration verification on 2026-10-13:

- Typecheck passed. The browser check passed both locales at all seven widths,
  including full-width trace bounds, local scrolling and bit selection. Desktop
  and 320px screenshots were inspected in both languages.
- The first browser run passed the English viewport checks but timed out waiting
  for the prototype after reloading the Completion placeholder. An unchanged
  rerun passed the entire check with no page errors. The timeout's cause was not
  established; no assertion or timeout was weakened.
- Full unit tests, build, backend tests and Docker baseline were not repeated
  for this prototype-only border change. Earlier verification limitations remain.

## Decision status

The maintainer requested 60rem and centering in
[this feedback](https://github.com/CSUwangj/cryptography-learning/issues/94#issuecomment-6154232149),
superseding the initial 48rem left-aligned candidate. The implementation centers
prose and preserves the full-width trace viewport. The maintainer subsequently
[accepted this layout and requested a canvas border](https://github.com/CSUwangj/cryptography-learning/issues/94#issuecomment-6154411316).
The fixture's unusually long title was also questioned. Checked-in public Lessons
and demos use shorter names, such as `AES-192 cipher` / `AES-192 密码` and
`AES-128 comparison and avalanche` / `AES-128 比较与雪崩`. The long title is a
stress fixture, not representative observed content. No private content was
inspected and no maximum title length or separate menu title was approved.
For a normal-length title, open `/learning/aes-128?prototype=shell&lang=zh-CN`.

On 2026-10-13 the maintainer explicitly
[accepted the current implementation, including long-text presentation](https://github.com/CSUwangj/cryptography-learning/issues/94#issuecomment-6155016469).
This confirms the current Shell navigation, centered 60rem layout, desktop/narrow
arrangement, long-title treatment and canvas border under P0-A5/A6. No shortening
rule or separate menu title is required by this feedback.

Together with the previously confirmed D-Q8 baseline, the recorded acceptance
completes P0's prototype decision gate. The prototype does not establish production
architecture or satisfy the first-real-page checkpoint. The P1 metadata-parser
prerequisite remains unresolved. D remains closed; backend parsing, themes and
P1-P5 implementation are outside this session.

This final confirmation changes documentation only; runtime checks were not
repeated and the verification limitations above remain. Existing staged work and
all stashes are preserved; the agent does not commit this prototype.
