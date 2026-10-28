# Centralize localized UI copy in i18next resources

For [#122](https://github.com/CSUWangj/cryptography-learning/issues/122), all
Localized UI Copy in the production frontend and runnable demos comes from
per-language JSON resources loaded by the existing i18next setup. This includes
the application resources previously embedded in `app/i18n/index.ts`. Keep
`en-US` and `zh-CN` complete, use `en-US` as the fallback for unsupported
languages, and keep Lesson/Lab content, stable identifiers, and user-supplied
text outside the application UI resources.

The maintainer-approved refinement on 2026-10-28 adopts native translation
calls and upgrades the existing i18next dependencies to support them. The
implementation targets i18next **26.5.11** and react-i18next **17.1.9**, with
resolved versions recorded in the lockfile. Node, React, and TypeScript pins
remain unchanged. See [the research](../research/i18next-project-patterns-2026-10.md)
for production examples and compatibility evidence; #122 owns migration checks.

Use `t(key, options)` directly where a label is rendered or a presentation is
constructed. React components obtain `t` from native `useTranslation`; pure
builders receive native `TFunction` from `i18next`, with namespace/prefix types
matching the function they receive. They do not import a global i18n singleton.
Remove the custom `Translate` interface and resource-mirroring `textFor(t)`
adapters. Do not replace them with another copy hook, translation service,
prefix wrapper, or `returnObjects: true` dictionary. Domain-state-to-key maps
and existing UI interfaces that accept translated labels remain valid.

Keep the application `translations` namespace and `primitives` resources, and
use `visualizers` and `demos` namespaces for their feature copy. Each namespace
has a JSON file under `app/i18n/locales/{en-US,zh-CN}/`; static imports suffice.
Use native `keyPrefix` for a component confined to one subtree:

```tsx
const { t } = useTranslation('visualizers', { keyPrefix: 'executionTrace' })
return <h2>{t('title')}</h2>
```

Existing builders compose multiple subtrees, such as BlockCipher calling
ExecutionTrace and KeyExpansion. Pass them an unprefixed
`TFunction<'visualizers'>` and call `t('executionTrace.title')` or
`t('keyExpansion.title')` directly. Do not pass a subtree-prefixed function to
a helper expecting namespace-root keys. At a prefixed call site, an occasional
cross-namespace lookup must explicitly set `ns` and `keyPrefix: ''`; retain
`keySeparator: false` for stable primitive identifiers containing dots. The
uniform convention is the native `t` call, not a forced prefix for every caller.

Ordinary app/demo UI follows the hook's current language; translated memoized
presentations depend on `t`. Use `getFixedT` at explicit-language test, preview,
or non-React boundaries, not as a second language binding in every renderer.
Remove redundant UI-only locale plumbing while preserving the distinct locale
used to load authored Lesson content. Keep string keys; selector syntax and
translation code generation are not needed for this migration.

Component-local dictionaries and translated resource mirrors duplicate the
resource vocabulary. Global imports hide builder dependencies and do not
subscribe React to language changes. Native hooks and explicit `TFunction`
inputs give consistent calls without adding a translation abstraction. The
existing bilingual, interpolation, language-switching, and presentation
contracts remain acceptance requirements for the upgrade.
