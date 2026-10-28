# i18next usage in large React projects

## Question and evidence boundary

How can this frontend use one readable translation-call style without rebuilding
component-local copy dictionaries after moving text into i18next resources?

This research inspects primary source from three active public repositories on
2026-10-28. Links pin the inspected commits, so the observations do not depend on
later changes to their default branches. This is a sample of real production
components, helpers, and initialization code, not an exhaustive repository audit.
The examples are design evidence. The maintainer subsequently approved updating
ADR 0012 and #122 with the upgrade and call-style decision; the final section
records that refinement. The earlier installed-version analysis remains useful
as the pre-upgrade baseline.

## Comparison

| Project and inspected revision | React call style | Ordinary helper call style | Resource organization and relevant trade-off |
| --- | --- | --- | --- |
| [Rocket.Chat](https://github.com/RocketChat/Rocket.Chat/tree/aa67056b48c35933771b58edffa74cca86e54398), commit dated 2026-10-28 | Native `const { t } = useTranslation()` followed by `t('Back')`. | A presentation-oriented unread-data helper receives native `TFunction` and passes it to another helper. Both call `t(key, options)` directly. | JSON resources, English fallback, and namespaces. Its older project-specific translation hook is explicitly deprecated in favor of `react-i18next`. This is the closest inspected example to this repository's component/builder split. |
| [Cal.com](https://github.com/calcom/cal.com/tree/56da01b4b1664894b784aca636eccab0c56cc141), commit dated 2026-10-27 | `const { t } = useLocale()` followed by `t('title')`. The project hook exposes native `TFunction`. | Recurrence-formatting helpers accept `t: TFunction` and call it directly. | JSON `common` resources; the hook handles Next.js App Router contexts and an embedded platform context. The useful call style does not require copying its context/cache infrastructure. |
| [Grafana](https://github.com/grafana/grafana/tree/a2359d4d4486f4c2c7ed0f67d90ef45aac2d0e39), commit dated 2026-10-28 | Imports `t` and `Trans` from `@grafana/i18n`; calls `t('profile.change-password.old-password-label', 'Old password')`. | Navigation-title helpers import the same global `t`. | English defaults live at call sites; non-English resources load asynchronously. A custom wrapper supports initialization and plugin namespaces. The short import is real, but adopting the complete design would change this repository's JSON-only copy and pure-builder decisions. |

### Rocket.Chat: a hook and an explicit native translator

The production [BackButton](https://github.com/RocketChat/Rocket.Chat/blob/aa67056b48c35933771b58edffa74cca86e54398/apps/meteor/client/views/room/Header/Omnichannel/BackButton.tsx#L1-L10)
imports the native React hook and obtains `t`; the
[rendered label](https://github.com/RocketChat/Rocket.Chat/blob/aa67056b48c35933771b58edffa74cca86e54398/apps/meteor/client/views/room/Header/Omnichannel/BackButton.tsx#L38)
calls it directly:

```tsx
const { t } = useTranslation();
// The remaining button props are omitted here.
return <HeaderToolbarAction title={t('Back')} icon='back' onClick={back} />;
```

The ordinary
[`getSubscriptionUnreadData` helper](https://github.com/RocketChat/Rocket.Chat/blob/aa67056b48c35933771b58edffa74cca86e54398/apps/meteor/lib/getSubscriptionUnreadData.ts#L1-L33)
imports `TFunction` from `i18next`. `getUnreadTitle` receives that function and
uses `t('mentions_counter', { count: mentions })`; its public caller also accepts
`t: TFunction` and
[passes it through](https://github.com/RocketChat/Rocket.Chat/blob/aa67056b48c35933771b58edffa74cca86e54398/apps/meteor/lib/getSubscriptionUnreadData.ts#L41-L52).
The translated strings are used where the presentation result is constructed;
there is no intermediate object renaming every resource key to a local property.

This is also the project's stated direction, not just an isolated example:
[client guidance](https://github.com/RocketChat/Rocket.Chat/blob/aa67056b48c35933771b58edffa74cca86e54398/docs/frontend/i18n.md#L5-L21)
recommends `useTranslation` from `react-i18next`. The older
[`ui-contexts` hook](https://github.com/RocketChat/Rocket.Chat/blob/aa67056b48c35933771b58edffa74cca86e54398/packages/ui-contexts/src/hooks/useTranslation.ts#L1-L7)
is marked deprecated. Its provider
[registers JSON resources and English fallback](https://github.com/RocketChat/Rocket.Chat/blob/aa67056b48c35933771b58edffa74cca86e54398/apps/meteor/client/providers/TranslationProvider.tsx#L69-L90);
its resource [documentation](https://github.com/RocketChat/Rocket.Chat/blob/aa67056b48c35933771b58edffa74cca86e54398/docs/i18n.md#L7-L21)
explains that language files are flat JSON.

Useful qualification: a map from domain states to literal translation keys is
different from a duplicate translated-copy object. Rocket.Chat
[recommends the former](https://github.com/RocketChat/Rocket.Chat/blob/aa67056b48c35933771b58edffa74cca86e54398/docs/frontend/i18n.md#L23-L67)
when the domain alternatives need explicit coverage. That does not justify
mapping every static `title`, `instructions`, and `caption` through a second
vocabulary before rendering.

### Cal.com: the same consumer syntax behind a framework-specific hook

The production
[`CreateEventTypeForm`](https://github.com/calcom/cal.com/blob/56da01b4b1664894b784aca636eccab0c56cc141/packages/features/eventtypes/components/CreateEventTypeForm.tsx#L37-L54)
uses this straightforward shape:

```tsx
const { t } = useLocale();
// Used directly in the form:
label={t("title")}
placeholder={t("quick_chat")}
```

Its
[`recurringStrings` helpers](https://github.com/calcom/cal.com/blob/56da01b4b1664894b784aca636eccab0c56cc141/packages/lib/recurringStrings.ts#L1-L24)
accept `t: TFunction`, then call `t("every_for_freq", { ... })`. Another helper
[passes the same function onward](https://github.com/calcom/cal.com/blob/56da01b4b1664894b784aca636eccab0c56cc141/packages/lib/recurringStrings.ts#L26-L42).
This independently demonstrates explicit translation in ordinary functions
without a bespoke translation interface or per-component copy table.

The
[`useLocale` implementation](https://github.com/calcom/cal.com/blob/56da01b4b1664894b784aca636eccab0c56cc141/packages/lib/hooks/useLocale.ts#L1-L29)
returns the native `TFunction` and delegates to `useTranslation('common')`. Its
[other branches](https://github.com/calcom/cal.com/blob/56da01b4b1664894b784aca636eccab0c56cc141/packages/lib/hooks/useLocale.ts#L34-L72)
handle App Router and embedded contexts, construct instances, and obtain
`getFixedT(locale, ns)`. Those branches solve Cal.com's framework integration;
they are not prerequisites for writing `t('key')` in a Vite SPA.

Its
[`server.ts`](https://github.com/calcom/cal.com/blob/56da01b4b1664894b784aca636eccab0c56cc141/packages/i18n/server.ts#L4-L18)
loads `locales/en/common.json`; the
[server translator](https://github.com/calcom/cal.com/blob/56da01b4b1664894b784aca636eccab0c56cc141/packages/i18n/server.ts#L58-L80)
returns a language-bound `getFixedT`. Copying the caches or server instance
management would add requirements unrelated to this repository's syntax concern.

### Grafana: globally imported translation with explicit source defaults

The production
[`ChangePasswordForm`](https://github.com/grafana/grafana/blob/a2359d4d4486f4c2c7ed0f67d90ef45aac2d0e39/public/app/features/profile/ChangePasswordForm.tsx#L1-L4)
imports `t` from `@grafana/i18n`;
[field labels](https://github.com/grafana/grafana/blob/a2359d4d4486f4c2c7ed0f67d90ef45aac2d0e39/public/app/features/profile/ChangePasswordForm.tsx#L48-L69)
use calls such as:

```tsx
t('profile.change-password.old-password-label', 'Old password')
```

The ordinary
[`getNavTitle` helper](https://github.com/grafana/grafana/blob/a2359d4d4486f4c2c7ed0f67d90ef45aac2d0e39/public/app/core/utils/navBarItem-translations.ts#L1-L23)
imports the same function and maps backend-defined navigation IDs to calls such
as `t('nav.home.title', 'Home')`. Again, this is meaningful ID-to-label mapping,
not a second copy object used to shorten static UI access.

The short call site hides a deliberate library contract:

- Grafana defines its own
  [`TFunction`](https://github.com/grafana/grafana/blob/a2359d4d4486f4c2c7ed0f67d90ef45aac2d0e39/packages/grafana-i18n/src/types.ts#L80-L83)
  requiring `id`, `defaultMessage`, and optional interpolation values.
- Its
  [`t` wrapper](https://github.com/grafana/grafana/blob/a2359d4d4486f4c2c7ed0f67d90ef45aac2d0e39/packages/grafana-i18n/src/i18n.tsx#L201-L218)
  performs initialization handling and forwards to a stored i18next translator.
- Initialization uses
  [`getFixedT` and plugin namespaces](https://github.com/grafana/grafana/blob/a2359d4d4486f4c2c7ed0f67d90ef45aac2d0e39/packages/grafana-i18n/src/i18n.tsx#L22-L50).
  The code explicitly skips default-language resource downloads because those
  messages are embedded in the source.

This is a viable alternative when a product chooses global translation and
inline source messages. It does not demonstrate that this repository must
introduce such a wrapper to get uniform syntax. It would require revisiting
ADR 0012's explicit dependencies and JSON source-of-truth boundary.

## What the inspected evidence supports

The closest low-complexity convention is the Rocket.Chat/Cal.com consumer style:
use `t(key, options)` directly in both components and ordinary presentation
helpers. Components obtain `t` from a React hook; helpers receive the same native
translator as a parameter. Uniform call syntax does not require identical
dependency acquisition in React and non-React code.

None of the inspected component/helper pairs creates a `textFor(t)` object
solely to turn `t('some.title')` into `text.title`. This is evidence that those
indirections are unnecessary for the demonstrated use cases, not a claim that
the three entire repositories contain no such objects. Domain mappings and
already-translated component props can still be useful where they represent a
real interface.

## Version and verification limits

- Cal.com's inspected i18n package declares
  [`i18next` 23.2.3](https://github.com/calcom/cal.com/blob/56da01b4b1664894b784aca636eccab0c56cc141/packages/i18n/package.json#L14-L20).
- Grafana's inspected package declares
  [`i18next` ^26.3.6 and `react-i18next` ^17.0.9](https://github.com/grafana/grafana/blob/a2359d4d4486f4c2c7ed0f67d90ef45aac2d0e39/packages/grafana-i18n/package.json#L54-L68).
  Its [README](https://github.com/grafana/grafana/blob/a2359d4d4486f4c2c7ed0f67d90ef45aac2d0e39/packages/grafana-i18n/README.md#L1-L5)
  still labels the package ALPHA; it is researched here as source evidence, not
  proposed as a new dependency.
- Rocket.Chat's inspected i18n package develops against
  [`i18next` ~26.4.2](https://github.com/RocketChat/Rocket.Chat/blob/aa67056b48c35933771b58edffa74cca86e54398/packages/i18n/package.json#L36-L46).
- These projects use newer versions than this repository's declared i18next
  ^19.9.2 / react-i18next ^11.12.0. Newer type signatures, selector APIs,
  `keyPrefix`, namespace options, and formatters must not be assumed compatible
  merely because a project uses them. The basic direct-call pattern and the
  exact installed-version API need separate assessment.
- Only source and manifests of those three projects were inspected. No external
  application was run and no deployment was queried. Local API probes are
  described separately below; project dependencies remain unchanged.

## Findings in this repository

The main checkout at `b7f1013` contains ADR 0012, not its implementation. A
separate staged implementation of #122, based on `9d96261`, was inspected
read-only. These observations describe that local snapshot, not committed
production behavior:

- Fourteen `textFor(translate)` functions recreate resource keys as local text
  properties: six in `src/visualizers` and eight in `demos`. Together their
  declarations occupy 278 lines, including braces. This is a source count, not
  an estimate of net removable lines or a performance measurement.
- For example, `visualizers/ExecutionTrace.tsx:15-59` maps
  `title: translate('visualizers.executionTrace.title')` and dozens of sibling
  keys, then the presentation reads `text.title`. This maintains an additional
  vocabulary between the resource and its consumer.
- `app/i18n/index.ts:11` defines a custom `Translate` type, which is re-exported
  by `app/index.ts` and imported by the visualizers. The installed i18next
  package already provides `TFunction`; using it removes this application-module
  type dependency. This is a dependency/readability observation, not evidence
  of a runtime import cycle.
- Renderer wrappers, including `ExecutionTrace.tsx:178-182`, obtain `i18n`
  through the hook and separately memoize `getFixedT(locale)`. This is useful
  when a view intentionally has its own language. It is unnecessary for
  ordinary application UI that follows the hook's current language; the staged
  `LearningPage.tsx:376` already passes `i18n.language` to that view.

The ADR settled resource ownership and explicit translation dependencies, but
left consumer syntax and the need for these mapping objects unspecified.
Its central decisions can be retained while making the call-site convention
more precise.

## Initial convention before upgrade approval

Use native `t(key, options)` at the point where a label is needed. Acquire that
same function through the appropriate existing boundary:

| Context | Proposed convention |
| --- | --- |
| React component using the application language | `const { t } = useTranslation('visualizers')`; render `t('executionTrace.title')` directly. |
| Existing pure presentation builder | Receive `t: TFunction` from `i18next`; use the same direct calls when constructing the presentation. |
| Explicit-language test, preview, or non-React entry point | Initialize the instance, then obtain `i18n.getFixedT(locale, 'visualizers')` at the entry point and pass it onward. |
| Shared UI primitive accepting a label/caption | Continue passing the translated string through its real UI interface. It does not need to depend on i18next. |

For example, the component-side portion can use the existing builder without
an extra translator memo or a resource-to-property adapter:

```tsx
const { t } = useTranslation('visualizers')
const presentation = useMemo(
  () => executionTracePresentation(execution, t, executionIdentity),
  [execution, t, executionIdentity],
)
```

Inside that builder, the title assignment is simply
`title: t('executionTrace.title')`; its translator parameter has the native
`TFunction` type. Other helpers accept the same function only when they actually
translate text. Keep graph calculations and trace data independent of i18n.

Remove the `textFor` functions whose only purpose is renaming translation keys.
Do not replace them with `returnObjects: true`, a prefix-building helper, a new
`useCopy` hook, or a custom translation service. A real domain-state-to-key map
or the existing small `FlowText` label interface can remain where it expresses
an actual relationship rather than duplicating an entire resource subtree.

Native namespaces can shorten the current keys without introducing wrappers:
retain the existing application namespace and `primitives`, and give
`visualizers` and `demos` their own JSON resources under each locale. The
[official namespace guidance](https://www.i18next.com/principles/namespaces)
explicitly supports application-section or feature grouping. Resource files
may still be statically imported at initialization; namespaces do not require
lazy loading or a new backend. Deleting the mapping layer can also be done
first with the current fully qualified keys, independently of file splitting.

Keep application UI language separate from a Lesson's authored-content fallback
language. Removing a UI-only locale prop must not remove the locale needed to
load or interpret Lesson documents. Initialization and language switching stay
at the app/demo boundaries; the same translated UI must update when language
changes. Do not precompute translated strings at module scope.

The global-import style seen in Grafana is a real alternative, but it changes
the dependency contract and does not by itself subscribe React to language
changes. This repository already has a working hook boundary. The native
hook/parameter pattern achieves consistent calls with less architectural change.

## Compatibility with the pre-upgrade dependencies

Both the lockfile and installed packages were checked: i18next is **19.9.2**,
and react-i18next is **11.18.6**. The latter satisfies the declared ^11.12.0
range; the lockfile is the exact version evidence.

- Native `useTranslation`, namespaces, `TFunction`, interpolation, and
  `getFixedT(language, namespace)` are available. The version-pinned
  [core implementation](https://github.com/i18next/i18next/blob/v19.9.2/src/i18next.js#L311-L331)
  takes two `getFixedT` arguments.
- `useTranslation(..., { keyPrefix })` requires i18next >=20.6.0 as well as
  react-i18next >=11.12.0, according to the
  [official hook reference](https://react.i18next.com/latest/usetranslation-hook#optional-keyprefix-option).
  The React package alone is not enough. The current core silently ignores a
  third `getFixedT` prefix argument. Use namespaces or complete keys here.
- The hook's `lng` option requires react-i18next >=12.3.1, per the same
  [reference](https://react.i18next.com/latest/usetranslation-hook#optional-lng-option).
  Retain boundary-level `getFixedT` for intentional language overrides.
- Do not copy newer selector syntax such as `t($ => $.title)` or newer
  namespace-generic type signatures into this pinned-version proposal. No
  dependency upgrade is necessary to remove the duplicate copy adapters.

## Pre-upgrade verification and limits

A small assert-based probe was run outside the checkout with Node 24.18.1
through Fish+nvm against the installed i18next 19.9.2. It passed namespace
lookup, interpolation, en-US/zh-CN output, English fallback for an unsupported
language, current-language changes, and isolation of language-bound translators.
It also confirmed that the unsupported `keyPrefix` argument is ignored. The
probe command was:

```sh
fish -lc 'cd frontend; and nvm use; and node /tmp/i18next-native-api-probe.mjs'
```

The shell emitted an unrelated fnm startup symlink warning; nvm selected the
pinned Node version and the assertions completed with exit zero.

This probe validates the available API, not a completed React migration. No
application typecheck, full tests, production build, or browser suite was run
because no runtime implementation was changed. A later implementation should
retain bilingual behavior and prove language switching, Lesson-content
fallback separation, and existing presentation behavior through the existing
tests. That research pass left ADR 0012, #122, and the implementation worktree
unchanged. The following refinement records the later authorized documentation
update; it does not claim an implementation migration.

## Approved upgrade and native call convention

On 2026-10-28, the maintainer requested an i18next upgrade to simplify usage and
selected updating ADR 0012 and #122 before changing their implementation.
The decisions are recorded in [ADR 0012](../adr/0012-centralize-localized-ui-copy.md)
and [#122](https://github.com/CSUWangj/cryptography-learning/issues/122).

The public npm registry reported these stable `latest` versions on that date:

| Package | Current lockfile | Upgrade target | Declared peer requirements |
| --- | --- | --- | --- |
| [i18next](https://registry.npmjs.org/i18next/26.5.11) | 19.9.2 | 26.5.11 | Optional TypeScript 5, 6, or 7. |
| [react-i18next](https://registry.npmjs.org/react-i18next/17.1.9) | 11.18.6 | 17.1.9 | i18next `>=26.2.0`, React `>=16.8.0`, TypeScript 5, 6, or 7. |

The repository's React 19 and TypeScript 6 satisfy those peer ranges. Preserve
Node 24.18.1 and the existing toolchain; peer compatibility is not proof that
the application migration passes. Upgrade the two existing packages and their
lockfile entries. Keep the existing detector/backend unless implementation
checks demonstrate an incompatibility; a blanket dependency update is outside
scope.

Use native string-key `t(key, options)` consistently. The inspected release's
[type options](https://github.com/i18next/i18next/blob/v26.5.11/typescript/options.d.ts#L246-L248)
still default `enableSelector` to `false`; selector callbacks are not mandatory.
The native
[React hook signature](https://github.com/i18next/react-i18next/blob/v17.1.9/index.d.ts#L245-L252)
supports namespace and `keyPrefix` inference. For a component limited to one
subtree, `useTranslation('visualizers', { keyPrefix: 'executionTrace' })` gives
`t('title')` without a mapping object.

Prefix scope must match helper scope. The current BlockCipher builder invokes
both ExecutionTrace and KeyExpansion. Keep this composition on unprefixed
`TFunction<'visualizers'>`, with calls such as `t('executionTrace.title')`. A
prefixed function is not interchangeable with that root-scoped input. The
[official API](https://www.i18next.com/overview/api#getfixedt) requires clearing
`keyPrefix` for a cross-namespace lookup from a prefixed translator, for example
`t(primitiveId, { ns: 'primitives', keyPrefix: '', keySeparator: false })`.
Use this local escape only when needed, not a new adapter or one translator
parameter per label group.

The [migration guide](https://www.i18next.com/misc/migration-guide) identifies
the relevant checks across v19 to v26:

- v21 changes plural suffixes to JSON v4; v24 removes older JSON formats and
  requires `Intl`. No legacy plural suffixes were found in the inspected UI
  resources. Completion Records does use `count` in `{{label}}: {{count}}`, so
  preserve that interpolation even though it has no plural alternatives.
- v23 defaults `returnNull` to `false` and redesigns TypeScript types. Inspect
  string return assumptions and update native translator types, without casts
  that hide a wrong namespace or prefix.
- v25 changes language matching and consecutive `changeLanguage` handling.
  Verify supported languages, English fallback, and actual React language
  switching; do not equate Lesson-content fallback with UI language.
- v26 removes `initImmediate` and legacy `interpolation.format`. Neither was
  found in the inspected application setup. Check any affected test setup as
  part of implementation rather than introducing unused compatibility options.
- Preserve escaping and interpolation semantics for runtime values; modern
  defaults must not turn data into resource keys or translated content.

An isolated assert-based probe loaded the published i18next 26.5.11 CJS bundle
outside the checkout under pinned Node 24.18.1. It passed prefix lookup, explicit
cross-namespace lookup, composition across visualizer subtrees, bilingual
interpolation, English fallback for `fr-FR` and `zz-ZZ`, language changes, fixed
translator isolation, and count interpolation for 0, 1, and 2. It also passed
initialization with the currently installed detector and HTTP backend, with
the backend's Node reload interval disabled for the one-shot probe. No HTTP
resource loading or detector browser behavior was exercised.

The probe exited zero; the same unrelated shell startup warning occurred as in
the earlier probe. It does not test react-i18next 17 in the application. No
project package, lockfile, runtime source, or separate implementation worktree
was modified. Application typecheck, tests, build, and browser acceptance
remain implementation requirements in #122.
