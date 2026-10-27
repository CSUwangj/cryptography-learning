# UI optimization prototype

Approved design reference for #116, confirmed by the maintainer on 2026-10-25
after the Home theme correction. Variant D combines A's body and C's navbar,
with visible Learning, Practice and Feedback labels and an unchanged Home
layout. The code remains a throwaway prototype; production integration and
acceptance checks are still outstanding. The approved requirements and
implementation boundary are recorded in GitHub issue #116.

## Run the confirmation preview

On this machine, from `frontend`:

```sh
fish -lc 'nvm use; and npm run prototype:ui-optimization'
```

- AES-256: <http://127.0.0.1:4182/learning/aes-256-preview?prototype=ui-optimization&variant=D&lang=en-US>
- Practice: <http://127.0.0.1:4182/practice/classical/affine?prototype=ui-optimization&variant=D&lang=en-US>
- Home layout reference: <http://127.0.0.1:4182/?prototype=ui-optimization&variant=D&lang=en-US>

**D is the default and the approved implementation reference.** It keeps A's
centered 1000px card, 24px/28px interior spacing and page breadcrumb, and uses
C's contextual navbar. Learning, Practice and Feedback retain visible text,
including on phones. Only home, theme and language use icons alone. The
contextual trigger shows the current category and entry; on phones it hides
the category and truncates long entry titles without hiding destination labels.

The layout redesign applies only to Learning and Practice routes. Home retains
the production Shell and HomePage layout, labels and control arrangement, without
a new card or switcher. Theme fixes also apply to Home: the existing theme button
shares the prototype's saved choice, and both real navigation popovers, the
navbar and the page surface follow it. A temporary opt-in Shell fixture prop
provides the controlled theme; scoped prototype CSS replaces fixed popup and
navbar backgrounds with the Blueprint palette. Production callers keep their
existing behavior. Other routes also retain their existing shell layout.

A/B/C remain historical comparisons. Use the bottom A/B/C/D controls to compare
layouts. The arrow buttons and background Left/Right keys also switch layouts.
Keys inside the trace, inputs, menus and other
interactive controls retain their normal behavior. Language, variant and preview
parameters survive catalog navigation, reload and browser history. Old XOR preview
links redirect to the AES-256 preview.

- **A — compact top navigation:** one 56px global bar; the full page breadcrumb
  sits inside a centered 1000px content card.
- **B — side navigation:** a 184px desktop rail holds destinations and utilities;
  the page breadcrumb and canvas share a wider content card. Narrow screens use
  a compact horizontal bar. Utilities appear only once.
- **C — context in one bar:** the current context is one breadcrumb menu button
  beside the home and utility icons. A full-width content card uses the available
  workspace. Omitting the duplicate body breadcrumb is a design option in C,
  not an approved change to the original issue's page-breadcrumb requirement.

On Learning and Practice routes, all variants constrain vertical scrolling to
the content viewport. Text, graph outputs, trace and step controls stay inside
the same card. The trace keeps its
full natural width and its own horizontal scrollbar.

## Real components and deliberate prototype changes

- `LearningPage`, `PracticePage`, their Markdown and the Lesson runtime remain
  production components. Navigation uses Blueprint `Navbar`, `Button`,
  `PopoverNext`, `Breadcrumb` and `Breadcrumbs`; the outer card uses Blueprint
  `Card` with the normal light/dark theme.
- The navigation controls are deliberately replaced because they are being
  redesigned. Their local two-column panels follow the existing category/entry
  interaction with the same fixture metadata as the pages. They are not new
  production navigation APIs.
- The top trigger contains non-interactive Blueprint `Breadcrumb` spans and
  chevron icons inside one accessible button. It contains no nested links or
  overflow-menu buttons. C and D hide the category segment on phones and retain
  the full accessible path.
- A, B and D render the real Blueprint `Breadcrumbs` ordered list in a named page
  navigation landmark, with an actionable catalog link and `aria-current=page`.
  Scoped prototype CSS hides the old hand-built Lesson breadcrumb.
- `uiOptimizationPrototypeFixture.ts` reuses `aesKeyExpansionGraph(256)` and
  `aesCipherGraph(256)` primitives to calculate the initial round key,
  AddRoundKey 0 and SubBytes 1 from the public demo inputs. It opens immediately
  in the actual block-cipher renderer. Each state row has 128 selectable bits.
  The AES key is 256 bits; only the initial 128-bit round key is consumed in this
  two-operation slice. Later rounds and full key expansion are outside it.
- Prototype CSS reduces the renderer's row spacing so the two operations are
  visible together; the bit widths, relationships and selection remain real.
- The Practice fixture retains the public Affine Lab example. Its Apollo data
  now includes the typenames needed for fragment reads. TCP text uses a reserved
  example hostname. WebSocket endpoints are omitted, so no live Lab connection
  is offered. Completion Records is an explicitly labeled placeholder.
- Theme resolution is saved local choice > system theme > existing light
  fallback. Clicking the icon saves to the prototype's own local-storage key.
  System changes apply while no choice is saved. Blueprint supplies component
  theme behavior; scoped palette colors cover custom trace controls, text and
  selected lineage strokes.

## Focused preview evidence

After the Home theme clarification, both real Learning and Practice popovers
were inspected in light and dark themes. Dark panels use a dark Blueprint
surface with light headings; light panels use a white surface with dark text.
The original Home theme control saved the shared choice, which survived
navigation to Learning, reload, and a return Home. No page errors occurred.
Home's layout and control arrangement remain unchanged.

The combined D preview was inspected at 1440px in light/dark themes: its body
measured 1000px with 24px/28px padding and one page breadcrumb. Practice rendered
with the same card width. At 390px, Learning, Practice and Feedback labels were
visible in English and Chinese without document or navbar horizontal overflow.
Returning Home rendered the original Shell and HomePage layout without the
redesigned card or switcher; its Learning menu returned to D. No page errors occurred.

The previous round below covers the original A/B/C alternatives, not acceptance
of the combined D preview.

## First-pass checklist

Before starting a UI prototype, record the following for the specific question:

- **Target route:** identify the real production route being examined.
- **Production reuse:** name its production components and the representative
  fixture or content the preview will reuse.
- **Stand-ins and departures:** list any replaced component, fake data, or
  behavior that differs from production.
- **Fixed boundaries:** cover Home layout, page breadcrumb, long content, and
  narrow-screen behavior where they apply; record what stays fixed.
- **Blueprint and theme:** identify the Blueprint surfaces and inspect the
  active light and dark themes for custom colors and component behavior.

Record confirmed interactions and rejected alternatives with their reasons
before dependent production work begins. Prototype-only browser omissions do
not waive any production acceptance checks.

The earlier Practice preview reproduced an undefined `.map` error and a blank
page: Apollo could not match fragment types in the untyped fixture. The corrected
fixture renders the real Practice page.

A local browser smoke check on 2026-10-25 covered only the reported preview
problems and requested visual surfaces:

- A/B/C rendered in light and dark at 1440px without page errors or document
  horizontal overflow. Practice rendered in both themes.
- AddRoundKey 0 and SubBytes 1 each rendered 128 selectable bits; clicking a bit
  updated its selected state. The trace measured 2794px wide, with viewport
  widths of 910px (A), 1112px (B), and 1296px (C).
- All variants rendered at 390px in Chinese; category/entry menus navigated
  while retaining the selected variant.

This is prototype inspection, not a production acceptance pass. The planner's
`demo_browser`, `frontend-tests`, `frontend_build`, `frontend_install` and
`frontend_typecheck` checks remain `not-run` for this prototype-only iteration.
Backend tests and Docker baseline were also not run. The maintainer has approved
D's visual design, including Home theme fixes. Production implementation still
requires the repository's applicable checks; this prototype-only limit does not
waive them. A/B/C are historical alternatives, not additional production modes.
