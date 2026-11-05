# Markdown dependency assessment for issue #125

Research date: November 4, 2026. Source snapshot:
`712b99b8764ef64acd81f163c959a9cb53e7d1a3`.

This report supports the maintainer's choice between migration and justified
retention. It does not select a disposition or authorize dependency changes.
[Issue #125][issue] requires preservation of prose, code highlighting, math,
and admonitions. Its November 4 scope comment explicitly permits either
migration or retention for public 1.3. No general dependency modernization is
implied.

## Current chain and consumers

The lockfile resolves the reported chain exactly:

```text
react-markdown 4.3.1
  remark-parse 5.0.0
    trim 0.0.1
```

The evidence is
[`frontend/package-lock.json:6260`](../../frontend/package-lock.json#L6260),
[`frontend/package-lock.json:6428`](../../frontend/package-lock.json#L6428),
and [`frontend/package-lock.json:7097`](../../frontend/package-lock.json#L7097).
The parser requests `trim` at the exact version `0.0.1`. The lockfile records
the deprecation message "Use String.prototype.trim() instead". This is a
runtime dependency, not a development-only warning.

| Consumer | Source passed to the renderer | Repository evidence |
| --- | --- | --- |
| Practice Lab Description | The selected Lab's content from GraphQL | [`frontend/src/practice/LabPage.tsx:111`](../../frontend/src/practice/LabPage.tsx#L111), [`frontend/src/practice/map.ts:31`](../../frontend/src/practice/map.ts#L31) |
| Practice TCP connection command | A generated fenced Bash block containing the configured endpoint | [`frontend/src/practice/LabPage.tsx:123`](../../frontend/src/practice/LabPage.tsx#L123) |
| Learning step prose | Localized Lesson text after asset URL rewriting | [`frontend/src/learning/LearningPage.tsx:315`](../../frontend/src/learning/LearningPage.tsx#L315) |

Learning imports the renderer exported by `practice`, so replacing it affects
both experiences. The separate Lesson Markdown module validates authored text
and rewrites asset references; it is not a second Markdown renderer.
[`frontend/src/practice/index.ts:3`](../../frontend/src/practice/index.ts#L3)
and [`frontend/src/lesson_runtime/markdown.ts:25`](../../frontend/src/lesson_runtime/markdown.ts#L25)
establish that distinction.

The current rendering behavior to preserve is broader than plain paragraphs:

| Capability | Current implementation and relevant detail |
| --- | --- |
| Prose and links | `ReactMarkdown` receives the source directly. HTTPS links open a new tab with `noopener noreferrer`; other links keep ordinary navigation. See [`Markdown.tsx:58`](../../frontend/src/practice/markdown/Markdown.tsx#L58) and [`Markdown.tsx:150`](../../frontend/src/practice/markdown/Markdown.tsx#L150). |
| Code | Fenced blocks use `react-syntax-highlighter`; inline code has a separate renderer. Highlight colors follow the Blueprint light/dark body class. See [`Markdown.tsx:63`](../../frontend/src/practice/markdown/Markdown.tsx#L63) and [`Markdown.tsx:156`](../../frontend/src/practice/markdown/Markdown.tsx#L156). |
| Math | `remark-math` 3.0.1 produces math nodes. Custom renderers use `@matejmazur/react-katex` and imported KaTeX CSS for block and inline math. See [`Markdown.tsx:1`](../../frontend/src/practice/markdown/Markdown.tsx#L1) and [`Markdown.tsx:160`](../../frontend/src/practice/markdown/Markdown.tsx#L160). |
| Admonitions | `remark-containers` 1.2.0 parses `:::` containers. Five renderer entries map `none`, `primary`, `success`, `warning`, and `danger` to the existing Callout component. Title/icon handling and click-to-expand behavior are application code. See [`Markdown.tsx:35`](../../frontend/src/practice/markdown/Markdown.tsx#L35), [`Markdown.tsx:140`](../../frontend/src/practice/markdown/Markdown.tsx#L140), and [`Callout.tsx:40`](../../frontend/src/practice/markdown/Callout.tsx#L40). |
| Tables and narrow screens | Existing browser fixtures contain GFM tables. CSS keeps wide code, tables, and math in local scrolling regions. See [`practice-navigation.spec.ts:49`](../../frontend/e2e/practice-navigation.spec.ts#L49) and [`Markdown.tsx:91`](../../frontend/src/practice/markdown/Markdown.tsx#L91). |

## Actual impact and trust boundary

There is a security advisory in addition to the deprecation warning.
[GHSA-w5p7-h5w8-2hfq][trim-advisory], also CVE-2020-7753, describes regular
expression denial of service in `trim()` for versions below `0.0.3` and names
`0.0.3` as patched. The locked `0.0.1` is in that affected range. The advisory
is evidence about that package, not proof of an exploitable student input path
in this application.

Installed package source confirms that `remark-parse` calls `trim()` while
parsing paragraphs, and that `react-markdown` parses synchronously. Relevant
locations are `frontend/node_modules/remark-parse/lib/tokenize/paragraph.js:96`
and `frontend/node_modules/react-markdown/lib/react-markdown.js:50`. These are
installed dependency files, not tracked application files; their versions and
published archive locations are recorded in the lockfile above. A pathological
document reaching this browser render could therefore stall the page. This is
an inference from the call path, not a reproduced performance result.

The inspected application paths load authored content from configured files:

- Lab content comes from the configured content root and is stored in the
  catalog. See
  [`backend/apps/web-server/src/practice_catalog/content.rs:23`](../../backend/apps/web-server/src/practice_catalog/content.rs#L23)
  and [`practice_catalog/mod.rs:243`](../../backend/apps/web-server/src/practice_catalog/mod.rs#L243).
- Lesson documents come from the Lesson catalog's filesystem reader and are
  returned through GraphQL. See
  [`backend/apps/web-server/src/lesson_catalog.rs:285`](../../backend/apps/web-server/src/lesson_catalog.rs#L285)
  and [`backend/apps/web-server/src/model.rs:30`](../../backend/apps/web-server/src/model.rs#L30).
- The Lesson compiler checks localized strings before rendering. Its Markdown
  validator rejects raw HTML and restricts recognized links to HTTPS, anchors,
  or contained assets. It has no general input-size or parser-runtime limit.
  See [`compiler.ts:1268`](../../frontend/src/lesson_runtime/compiler.ts#L1268)
  and [`markdown.ts:26`](../../frontend/src/lesson_runtime/markdown.ts#L26).
  The Practice consumer does not call that Lesson validator.

No student-authored string flowing into these Markdown calls was established
by this inspection. That limits the demonstrated exposure; it does not make
the affected package safe or prove that all content is harmless. Private
content, deployment state, and live Hosts were not inspected.
[ADR 0005](../adr/0005-use-an-operator-managed-high-tolerance-operating-model.md)
treats configured operators and the deployment environment as trusted. A
retention decision can use that existing boundary without inventing a new
requirement to defend against a malicious operator.

There are also compatibility costs independent of the advisory. The locked
`react-markdown` declares React 15/16 peers while
[`frontend/package.json:27`](../../frontend/package.json#L27) declares React 19.
This is a declared support mismatch, not evidence that current rendering is
broken. The `remark-containers` owner archived its repository on February 20,
2026. Its source directly modifies the old parser's `blockTokenizers` and
`blockMethods` APIs. [Container repository][containers] and
[container source][container-source] provide the primary evidence.

## Migration fit and cost

The upstream releases page lists `react-markdown` 10.1.0 as the newest release
on the research date. Its manifest accepts React and React types `>=18`, uses
ES modules, and depends on `remark-parse` 11. The current parser manifest no
longer declares `trim`. This provides a route away from the identified chain;
the final resolved dependency graph would still need checking after an
approved migration. [Releases][releases], [renderer manifest][renderer-manifest],
and [parser manifest][parser-manifest].

The repository already uses ES modules and Node 24.18.1. These declarations
fit the candidate's documented Node 16+ and React 18+ requirements. They are
not a successful build or browser compatibility result.
[`frontend/package.json:5`](../../frontend/package.json#L5),
[`frontend/.nvmrc:1`](../../frontend/.nvmrc#L1), and [upstream documentation][renderer-docs].

The work is not a version-only change:

| Area | Required investigation or adaptation |
| --- | --- |
| React adapter | Upstream changed `source` to `children`, `plugins` to `remarkPlugins`, and `renderers` to HTML-oriented `components`. Existing link, code, and math adapters must be mapped deliberately. The changelog also documents removal of the old `inline` prop on code components. [Migration history][renderer-changelog]. |
| Prose | Modern default syntax is CommonMark. `remark-gfm` supplies tables and other GFM extensions, so preserving the existing table fixture requires an explicit choice of extension support. [Renderer documentation][renderer-docs]. |
| Highlighting | Upstream documents integration with `react-syntax-highlighter`, so migration does not inherently require replacing the highlighter. Preserve language handling, inline/fenced distinctions, copyable text, theme changes, and existing scrolling behavior. [Renderer documentation][renderer-docs] and the local code above. |
| Math | Current upstream documents `remark-math` with `rehype-katex`. Modern math nodes use HTML code classes, unlike the current `math`/`inlineMath` renderer entries. Adapting the existing TeX component is another implementation option. The documented `rehype-katex` 7.0.1 manifest requests KaTeX `^0.16.0`, while this app requests `^0.13.18`; adopting it would require an explicit KaTeX/CSS choice. [Math documentation][math-docs] and [KaTeX adapter manifest][katex-manifest]. |
| Admonitions | The installed container plugin cannot be assumed compatible with the modern parser. `remark-directive` offers container syntax and an application-defined rendering transform, but its documented syntax such as `:::note{.warning}` differs from this app's header/title convention. It is not a drop-in replacement. Retaining the authored syntax requires a compatibility implementation; changing it requires content migration and maintainer approval. [Container source][container-source] and [directive documentation][directive-docs]. |

The installed `remark-math` 3.0.1 also hooks the old parser, at
`frontend/node_modules/remark-math/block.js:29` and `inline.js:28`. Keeping both
old plugins unchanged while replacing only `react-markdown` is therefore not
a supported plan. Actual adaptation effort depends on the authored math and
admonition examples the maintainer needs preserved. No reliable day estimate
can be derived from dependency version numbers alone.

## Choices for the maintainer

| Direction | Benefit | Cost and accepted limitation |
| --- | --- | --- |
| Retain the current stack for public 1.3 | Avoids parser and content changes during this release. Matches the explicitly permitted retention outcome in #125. | Keep the install warning, the affected `trim` version, the React peer mismatch, and an archived container plugin. Record why the observed authored-content boundary and release priorities justify these limitations. Reconsider if Markdown accepts student input or an ordinary-content failure is demonstrated. |
| Migrate the renderer and necessary plugins | Removes the identified old parser chain and aligns with current upstream React support. | Requires rendering compatibility work for both Practice and Learning, with admonition syntax the largest unresolved content contract. Verify math, GFM tables, highlighting, links/assets, and responsive/theme behavior. The implementation and final dependency graph remain unproven. |

A targeted override to patched `trim` would be a separate, narrower mitigation
to investigate if the maintainer wants to address the advisory while retaining
the renderer. It would not modernize the parser or container plugin. Because
the old parser pins `0.0.1`, this would deliberately change its declared
dependency contract and needs compatibility evidence. This report did not test
that route or establish whether its install warning disappears.

The pending decision is: should public 1.3 retain this stack with the documented
limitations, or include migration and its compatibility work? If migration is
selected, must existing `:::` source remain unchanged, or may content authors
convert it to an approved replacement syntax? That answer determines whether
the application needs a compatibility parser or a coordinated content change.

## Evidence limits and follow-up proof

This was a source and documentation assessment. No dependency installation,
code change, build, application test, exploit probe, or live environment query
was performed. Nothing here proves production exploitability, migration
compatibility, bundle-size improvement, or runtime-speed improvement.

Existing tests provide useful starting points but do not settle migration:

- [`frontend/e2e/practice-navigation.spec.ts:139`](../../frontend/e2e/practice-navigation.spec.ts#L139)
  checks wide Markdown containment and code whitespace. Its fixture includes
  same-line `$$...$$`, but the test does not require a display-math element to
  exist. It is not complete math or admonition coverage.
- [`frontend/src/lesson_runtime/index.test.ts:941`](../../frontend/src/lesson_runtime/index.test.ts#L941)
  checks Lesson URL validation and asset rewriting. It does not compare
  rendered output between parser versions.

If migration is approved, use representative authored prose, fenced and inline
code, inline and multiline math, all five admonition intents with title/icon
and expansion behavior, tables, and Lesson asset references to compare visible
results. Include both light/dark themes and a narrow viewport. Obtain relevant
private-content examples from the maintainer through the appropriate private
repository rather than copying them into this public checkout. Let the changed
paths and approved acceptance criteria determine the executable check plan.

## Primary sources

All external sources below were consulted on November 4, 2026. Versioned URLs
identify the checked candidate where available; `main` and release-list URLs
may change. Repository citations above refer to the recorded source snapshot.

- [Issue #125 and disposition scope][issue].
- [GitHub-reviewed trim advisory, GHSA-w5p7-h5w8-2hfq][trim-advisory].
- [react-markdown releases][releases].
- [react-markdown 10.1.0 manifest][renderer-manifest].
- [react-markdown 10.1.0 documentation][renderer-docs].
- [react-markdown 10.1.0 migration history][renderer-changelog].
- [remark-parse manifest, declaring 11.0.0][parser-manifest].
- [remark-containers repository and archive notice][containers].
- [remark-containers parser implementation][container-source].
- [Current remark-math documentation][math-docs].
- [rehype-katex manifest, declaring 7.0.1][katex-manifest].
- [remark-directive documentation][directive-docs].

[issue]: https://github.com/CSUWangj/cryptography-learning/issues/125
[trim-advisory]: https://github.com/advisories/GHSA-w5p7-h5w8-2hfq
[releases]: https://github.com/remarkjs/react-markdown/releases
[renderer-manifest]: https://github.com/remarkjs/react-markdown/blob/10.1.0/package.json
[renderer-docs]: https://github.com/remarkjs/react-markdown/blob/10.1.0/readme.md
[renderer-changelog]: https://github.com/remarkjs/react-markdown/blob/10.1.0/changelog.md
[parser-manifest]: https://github.com/remarkjs/remark/blob/main/packages/remark-parse/package.json
[containers]: https://github.com/Nevenall/remark-containers
[container-source]: https://github.com/Nevenall/remark-containers/blob/master/src/index.js
[math-docs]: https://github.com/remarkjs/remark-math/blob/main/packages/remark-math/readme.md
[katex-manifest]: https://github.com/remarkjs/remark-math/blob/main/packages/rehype-katex/package.json
[directive-docs]: https://github.com/remarkjs/remark-directive
