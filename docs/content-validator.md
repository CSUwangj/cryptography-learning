# Public v1.3 content validator

The `web-v1.3.0` validator checks one Lesson directory or one Lab Markdown file.
Its release attachment is
`cryptography-learning-validator-web-v1.3.0.tar.gz`. The package includes its
JavaScript dependencies. It requires Linux and Node **24.18.1**, matching
`frontend/.nvmrc`. Consumers do not install npm packages or need this checkout.
Other operating systems and Node versions have not been accepted for this package.
The build and release workflow prepare this attachment; they do not establish
that a release has been published.

## Extract and run

With the archive already present in the current directory:

```sh
tar -xzf cryptography-learning-validator-web-v1.3.0.tar.gz
node cryptography-learning-validator-web-v1.3.0/validator.cjs --version
node cryptography-learning-validator-web-v1.3.0/validator.cjs lesson ./example-lesson
node cryptography-learning-validator-web-v1.3.0/validator.cjs lab ./example-lab.md
```

The Lesson directory contains `lesson.yaml` and `locales/<locale>.yaml` files.
For example, `locales/en-US.yaml` and `locales/zh-CN.yaml` describe the same
Lesson in its supported locales. The Lab command takes a single UTF-8 Markdown
file. Paths resolve from the caller's current directory. Each invocation writes
one JSON object to standard output. Exit code 0 means validation passed; a
nonzero exit means invalid arguments, unreadable input or failed validation.

The version response is:

```json
{"release":"web-v1.3.0","node":"24.18.1"}
```

The extracted `identity.json` records the same release and required Node version.
This identifies the target contract, rather than the consumer's documents or
the runtime actually installed on their machine.

## Read the reports

Lesson reports retain `ok`, `diagnostics`, `notices` and, after successful
default execution, `dryRun.steps`. Each diagnostic has a stable `code`, a
`message`, a logical `path` and `details`. A `span` supplies `file`, `line` and
`column` when the parser or runtime has that information. Missing locations
remain absent. Lesson spans use paths such as `lesson.yaml` and locale files
relative to the Lesson root. Lab spans use the supplied document path.

Lesson schema v1 and v2 coexist in public v1.3. V1 retains the
`lesson.schema-v1-deprecated` notice. Validation compiles declarations and
references, then executes the authored defaults through the shared runtime.
This includes ordinary executions, generic comparisons, data avalanche,
standalone key avalanche and dependent cipher comparisons. Default bit-flip
controls derive their initial variant from the baseline using the first
declared source and its MSB-first bit 0, as the application does.

An intentionally accepted operation diagnostic remains in its Step as
`execution: "accepted-error"` with `diagnostics`. An equality check reports
`check: {"kind":"equal","matched":true}` or `matched: false`. A wrong answer
alone does not invalidate the Lesson. Choice checks report `{"kind":"choice"}`;
validation does not select a student's answer. A failed compile or execution
returns `ok: false` and diagnostics rather than a completed `dryRun`.

Lab reports contain `ok` and `diagnostics`. The validator uses the application's
current Markdown parser, math and container plugins, renderers and KaTeX
settings. Parsing or rendering exceptions report `lab.render-error`.
Recognized invalid formulas report `lab.invalid-math`, including formulas in
collapsed callouts and formulas for which the page would show KaTeX error UI.
Existing tolerated syntax remains tolerated, including `$x`, escaped HTML, HTTP
links and relative links. Lab prose does not acquire the Lesson-specific prose
restrictions. Correct the authored input and rerun after a failure.

## Build and verify from source

Use the pinned Node runtime in `frontend/.nvmrc` and the frontend dependencies
installed from the lockfile by the checkout's normal build instructions.
From `frontend`:

```sh
node scripts/build_validator.mjs
npm test -- --maxWorkers=1 --passWithNoTests=false src/lesson_runtime/validatorPackage.test.ts
```

The build writes the archive and extracted package under `frontend/dist/validator`.
It bundles the existing validation code with Vite and includes this guide,
the repository license and bundled dependency licenses. The package test builds
and extracts the archive into a temporary Linux directory, invokes both commands
with filesystem reads restricted to that directory, and compares their reports
with the candidate's shared application entries using public synthetic fixtures. Repository development checks use the
local execution route described in `docs/agents/review-handoff.md`. The package
test takes that route's heavyweight slot because it runs a real bundle build.

The `release-web-image.yml` workflow builds and verifies this package for the
`web-v1.3.0` tag before passing the archive to `publish_release_notes.sh` through
`VALIDATOR_ARCHIVE`. The publisher attaches it to the release and replaces the
same-named attachment on a retry. Other tags retain their existing release path.
The package test and local archive checks do not contact GitHub or live systems.

## Limits

Validation checks authored format and the default execution path. It does not
establish teaching correctness, verify explanations or Challenge answers,
enumerate student inputs, check whether assets or URLs exist, certify browser
interactions or layout, or establish deployment readiness. It exposes commands,
not a new consumer library API. Content consumers own acquisition, version
selection, updating and workflow integration.

This package retains the accepted v1.3 Markdown dependencies and their known
maintenance and security limitations under the maintainer-authored-content
boundary. It does not repair that stack or guarantee that arbitrary documents
cannot stall parsing or execution. See `docs/research/issue-125-markdown-dependencies.md`
in the source checkout for the assessment. Markdoc, Lesson v1 retirement and
v1.4 authoring changes are outside this package's contract.
