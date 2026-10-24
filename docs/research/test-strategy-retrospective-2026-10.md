# Test strategy retrospective and selective verification proposal

Date: 2026-10-21. Source snapshot: `675f4b5b316a945ebac0e237827fbea60080db2b`.
History window: **2026-10-06 20:08:41 UTC to 2026-10-21 20:08:41 UTC** (15 days).

This is research and a proposed design, not an adopted verification policy or an
implementation ticket. Existing gates remain authoritative until amended through
[AGENTS.md](../../AGENTS.md) and an approved issue. The maintainer requested
classification, historical cost analysis, changed-file selection for development
and commit CI, and daily full verification, accepting next-day manual repair.
That request motivates this proposal; it is not silently substituted for an issue.
The operating model is already consistent with manual repair and tolerated downtime
([ADR 0005](../adr/0005-use-an-operator-managed-high-tolerance-operating-model.md)).

## Conclusions in priority order

1. **Change the verification policy and its enforcement together.** Frontend
   changes currently force a full suite through both prose and executable handoff
   rules. CI-only filtering cannot remove that local cost. A small shared path-to-
   suite planner should feed both CI and handoff validation.
2. **Remove repeated work before adding machinery.** Build CI has six unconditional
   jobs, two web-image builds and two executions of the baseline. Branch pushes
   and PR events may also duplicate workflows. Keep a single image acceptance
   lane when selected; its harness already includes smoke.
3. **Make nightly coverage explicit.** Current container acceptance skips Vite-only
   Worker/demo tests, and the relay-to-board E2E harness is not wired into CI.
   Moving today's commands to a cron job would retain those omissions.
4. **Measure commands, not polling or conversation gaps.** Existing handoff packets
   omit finish time and duration. They cannot quantify human waiting or reliably
   separate compilation, installation, test execution and timeouts.
5. **Do not reorganize every test merely to classify it.** Most useful boundaries
   already follow features/packages. Split a few expensive mixed suites only if
   a selected path still unnecessarily waits on unrelated DOM/CLI cases. An
   unwired, unreproducible frontend lint script is a separate maintenance finding;
   it is not a reason to delay selection or add another broad gate.

## Historical evidence and limits

Local session histories, nested tool output, retained execution logs and handoff
packets were inspected. Inherited session histories were deduplicated by tool-call
identity. Runner summaries are counted once across session output and packet logs;
reading the same log is not a new run. Failed and deliberate test-first runs remain
visible. A failed run does not automatically mean a product regression or wasted work.

The retained handoff corpus contains **58 packets and 251 distinct command attempts**,
all between October 18 and 21. The primary session corpus supplies earlier evidence.
The two other CLI history stores are incomplete for this window: one has relevant
cross-repository calls, while the other has only an in-window startup log. Missing
records mean unknown time, not zero. Raw command/source identities and client-specific
coverage are retained privately outside the checkout; no connection configuration or
private content is included here.

| Category | Timed records | Observed runner time |
| --- | ---: | ---: |
| Frontend full Vitest: unit/component/integration mixed | 39 | 116.25 min (6975.100 s) |
| Frontend focused Vitest: unit/component/integration mixed | 270 | 57.54 min (3452.210 s) |
| Real-browser Worker integration | 14 | 8.93 min (535.500 s) |
| Browser UI with simulated API | 3 | 1.49 min (89.300 s) |
| Served-image browser/E2E coverage (includes integration cases) | 5 | 9.99 min (599.300 s) |
| Rust unit/service integration mixed; excludes compilation | 9 | 0.85 min (51.100 s) |
| Schema contracts; rounded runner time | 2 | 0.00 min (0.000 s) |
| Python repository tooling unit/CLI integration | 13 | 3.36 min (201.405 s) |
| Python image smoke; excludes image build/start/restart | 6 | 0.07 min (3.997 s) |
| **Total observed fragments** | **361** | **198.47 min (3.308 h)** |

A timed record is an explicit runner summary or a grouped Rust command's test-binary
runtimes, not an individual test case. A single focused shell command can launch
several runners. The 39 timed full-suite records across the window include only
29 of the 42 recent packet attempts; missing timers and interrupted runs explain
the difference. Vitest accounts for about **87.6%** of this observed test runtime.

These numbers are **observed runner durations**, not a complete account of 15 days,
CPU-hours, CI billing, or maintainer waiting. Concurrent executions cannot be added
to obtain elapsed human time. Vitest totals include runner setup/transform/import
and mix unit, component and integration tests. There is no honest retrospective
split into pure unit versus integration wall time without per-case classification
and timing that these logs do not consistently contain.

The packet-only subset is particularly clear:

- Full Vitest: **42 attempts**, 16 passed, 22 failed and 4 unavailable/interrupted.
  Only 29 have explicit runner durations, totaling **89.88 minutes**. Thirteen
  measured non-passing attempts account for **34.36 minutes** of that total.
- Focused Vitest: **55 attempts**, 50 passed, 4 failed and 1 unavailable. Fifty-four
  have explicit timing, totaling **12.49 minutes**.
- Successful full attempts have a median of **199.66 seconds**, versus **7.43 seconds**
  for successful focused attempts. This is a difference in historical workloads,
  not a controlled speedup estimate for equivalent coverage.
- Full-suite timeout configurations total **3,000 seconds**. These are censored
  observations/configured limits, not additional measured duration to add blindly.
- **47 typecheck attempts have no explicit runtime.** Thirty-four Vite builds
  report **171.09 seconds** in total; three installs report a rounded **900 seconds**.
  These are setup/build costs, not unit-test time.
- One baseline attempt spent about **956 seconds in a Rust release-build stage**
  before failing on a busy published port. Python smoke runtime alone conceals that
  cost. Subsequent smoke checks also detected outdated GraphQL language arguments
  and localized fixture expectations: path-selected contract tests remain useful.
- Seven supplementary CLI validation groups have only call-to-result intervals
  totaling **196.915 seconds**, including cross-repository content validation.
  They are not added to measured web-repository test time. One focused test's
  output was filtered away, so its result cannot be reconstructed. Thirteen
  exploratory runtime probes are excluded from acceptance-test totals.

Remote CI runs and deployment state were not queried. Repository instructions
require permission before surveying those external systems, and local sources
suffice for this proposal. CI queue time, runner-minute cost and exact aggregate
maintainer waiting therefore remain unknown. No application suites were rerun for
this retrospective.

## Proposed design

### Outcome and scope

Development and commit CI wait only for checks selected by the entire change set
and the behavior being changed. The default branch receives a complete daily run.
A failure outside immediate coverage may be discovered overnight and repaired
manually the following day, as requested. Existing release-image identity and
publication acceptance contracts remain a separate gate.

This introduces the daily GitHub Actions schedule requested by the maintainer. It
needs no external scheduler, dependency service, queue, automatic repair, flaky-test
quarantine, extra retry policy, new cache, or historical test-prioritization system.
Existing toolchains, test runners and lockfile installation stay in use.

### One selection rule for local work and CI

Add a small standard-library Python planner under `scripts/`, with the mapping
stored alongside its code. It returns the selected existing suite IDs, commands,
changed files, and the reason for each selection. Reuse that result in
`review_handoff.py` and GitHub Actions; do not maintain three independent rule lists
in prose, CI YAML and the helper. The executable mapping is authoritative after
approval; agent guidance needs only a short invocation pointer and risk policy.

Keep **level**, **domain** and **purpose** separate. Examples: a SQLite test is
integration/completion/regression; a mounted-image health check is system/web/smoke;
a real Worker test is browser-integration/crypto/cancellation. Full versus focused
is selection breadth, not a test level. Installation, typecheck, formatting,
codegen and builds remain separate checks.

Select existing files and Cargo packages initially. Vitest's installed `related`
and `--changed` support can assist selection, but cannot be the only authority:
filesystem fixtures, CLI subprocesses, Worker entry points, public assets and
container configuration are real dependencies outside a simple import graph.
The installed implementation follows transformed module dependencies, including
resolvable dynamic imports; it does not infer arbitrary filesystem reads.

Use the detailed routing matrix in the inventory below, with these fixed semantics:

- Union every matching rule; overlapping changes must add coverage, not replace it.
- Local verification includes staged and unstaged changes plus relevant untracked
  files. A staged handoff continues to identify and classify all excluded work.
- For a PR, use the merge base of its base and head. For a push, compare the event's
  before and after SHAs, including every commit in a multi-commit push. `HEAD~1`
  alone is not an adequate PR or push range.
- Preserve old and new paths for renames, and the old path for deletions. Use
  NUL-delimited Git path output and argv arrays, not shell interpolation of filenames.
- Missing comparison refs, new branches with no usable base, and unknown executable
  paths select the owning tree's checks with a recorded reason. Root-wide build or
  toolchain changes may legitimately select both trees. Do not silently select zero.
- Known prose-only paths may select documentation checks only. Markdown under
  `baseline/content`, runtime fixtures, and content consumed by the application
  remains test input. File extension alone cannot establish documentation-only scope.
- A test-file change selects that test; fixture/helper changes select consumers.
  Contract changes such as GraphQL select both sides of that specific contract.
- An intentional empty plan is recorded explicitly. A selected suite matching no
  tests is an error; override the current `passWithNoTests: true` for that invocation
  and verify collected/ran counts. A shell exit code alone does not prove coverage.
- A ticket's explicit behavioral acceptance checks add to the plan. Selection does
  not excuse omitting the browser test needed to prove changed keyboard, Worker,
  routing or layout behavior.

Keep `--maxWorkers=1` for local selected Vitest checks initially; run heavy local
commands sequentially. Change worker counts only as an explicit separate diagnostic,
not to make a failed acceptance command appear to pass. The commit CI worker setting
should also be explicit. Do not promise a seconds-level SLA without measuring it.

### Commit workflow

Use push events for branch commits, matching the request for every-commit CI, and
remove the redundant PR event if merge-result testing is not required. A multi-commit
push validates the resulting tree against the whole pushed change range; it does not
run every intermediate tree. If PR merge-result checks are desired, the alternative
is PR events plus pushes only to the default branch, rather than both for every
branch. Choose and record that trigger policy in the implementation issue.

Keep the workflow itself present for every event. Run a lightweight plan job, then
conditional suite jobs, then one stable aggregate result that checks all selected
jobs actually passed. A skipped unselected job is expected; a selected job skipped
because a dependency failed must not appear green. This avoids required-check
ambiguity from top-level `paths` filters. Current branch protection was not queried;
any required-status rename must be coordinated with the maintainer.

Typical immediate coverage:

- A completion CSV mapping change runs its mapping/export tests, relevant route
  consumers and frontend typecheck/build as applicable; no crypto/relay/browser
  engine matrix merely because the repository also contains them.
- A relay-only change runs relay Cargo tests, including its controlled HTTP boundary;
  claims changes select all three dependent Rust packages.
- A GraphQL adapter/schema/query change selects backend schema parity, client
  codegen freshness, typecheck, and affected feature/API tests. An unrelated CSS
  change does not justify the entire backend suite.
- Worker transport/cancellation changes select the real-Worker Chromium tests in
  addition to domain tests. A WorkerStub is not adequate evidence for that behavior.
- Docker/startup/Compose changes build one candidate image and run image smoke;
  relevant served-browser behavior adds to that same image lane. Acceptance already
  runs baseline, so a second baseline job is unnecessary.
- Node lockfiles, Vite/shared setup and equivalent broad inputs select the full
  affected frontend checks. Broad changes can legitimately have broad coverage.

CI installs with `npm ci` when a Node job is selected. Local iteration can reuse an
already installed dependency tree only while the pinned toolchain and lockfile still
match; an initial clean install and dependency changes still require `npm ci`.
No new installation cache or dependency-state tracking mechanism is needed here.

### Daily full workflow

Propose `schedule: cron: '17 2 * * *'` (02:17 UTC, 03:17/04:17 in Stockholm) plus
`workflow_dispatch`. Run on the default-branch tip. This deliberately uses ordinary
UTC scheduling and avoids the top of the hour. GitHub documents possible delays or
dropped scheduled jobs, default-branch-only execution, and inactivity disabling in
public repositories. Therefore this is next-night best-effort detection, not a
promise that every latent regression is known by morning. Manual dispatch is the
recovery when a nightly run is missed; no watchdog is proposed.

A complete nightly plan includes:

1. Repository tooling tests; full Rust fmt/Clippy/tests and required build checks.
2. Frontend clean install, codegen parity, typecheck, all Vitest and production build.
3. Vite/dev browser coverage: explicitly select `crypto-graph-worker.spec.ts`,
   `visualizers.spec.ts`, `aes-cipher-demo.spec.ts` and `learning.spec.ts`, plus
   applicable mocked-API/layout cases. Run supported engine combinations and
   retain intentional OS/mode exclusions. Do not run bare `playwright test` against
   only Vite: `web-tier.spec.ts` has real catalog/health checks requiring the backend.
4. One web image and `acceptance/run.sh IMAGE --mode release`, which includes Python
   smoke and three-engine served-image acceptance. No separate duplicate baseline.
   Retain the existing candidate-image SQLite runtime diagnostic and minimum
   version 3.51.3; the acceptance harness does not execute that separate check.
5. Build the relay from the same checkout using
   `docker build --target completion-relay -t RELAY_IMAGE .`, then run
   `acceptance/completion/run.sh WEB_IMAGE RELAY_IMAGE` on Linux to execute signed
   relay-to-GraphQL/browser completion E2E with synthetic content. The existing
   harness uses host networking; no published relay image is assumed.
6. Existing native macOS Chrome Cmd+V evidence, retaining its advisory severity.

Run the Vite and image browser environments as distinct commands. Their opposite
skip conditions mean neither substitutes for the other. Report executed and skipped
counts per environment, and confirm the relay case executed rather than skipped.
Reuse the web image within its job for image and completion acceptance; build the
relay image once. There is no need for cross-job artifact distribution machinery.

A failed nightly run remains visible through the normal workflow result and retained
logs. The maintainer diagnoses and fixes it manually. No automatic issue creation,
messages, rollback or repair is included. Release-tag checks keep testing the exact
immutable image before publication; relaxing them would be a separate decision.

### Handoff and agent-environment changes

Implementation must update these together:

- [AGENTS.md](../../AGENTS.md), the verification section of
  [review-handoff.md](../agents/review-handoff.md), and
  [ticket-loop](../../.agents/skills/ticket-loop/SKILL.md): replace the unconditional
  full-frontend rule with the selected immediate-check plan and nightly deferral.
- [review_handoff.py](../../scripts/review_handoff.py) and its tests: require the
  selected checks, command identities and selection reasons for the pinned snapshot.
  Preserve failed attempts, formal-review axes and snapshot verification.
- [build.yml](../../.github/workflows/build.yml): consume the same plan, remove
  duplicate image/baseline work, and make the selected-result check stable.
- A nightly workflow using the same suite registry in full mode, plus existing
  harness changes only where needed to target a selected browser spec.

Deferred checks are explicit **not required for this immediate plan**, with a
nightly destination and accepted risk. They must not masquerade as passed tests.
Required but unavailable checks remain incomplete. Keep review and verification as
separate gates. On an unchanged snapshot reviewers consume the evidence already
captured; rerunning it needs a concrete concern. This design does not introduce
cross-snapshot result caching.

Extend the existing attempt record with finish timestamp and monotonic elapsed
seconds, plus suite/selection identity, selected-case count where available,
worker count, tool versions and permission context. Preserve full logs and original
exit status while showing concise excerpts. This closes a demonstrated information
access gap without a telemetry service or supervisor. Human waiting remains a
separate quantity unless a future study explicitly measures it.

### Reviewable implementation sequence and proposed checks

These are candidate checks for a future approved issue, not new acceptance authority:

1. Record the requested policy and accepted next-day risk in an issue; update the
   relevant repository rules. Keep the operating model unchanged unless its owner
   wants to record this specific detection tolerance there as well.
2. Add the small shared planner and table-driven cases: documentation-only,
   frontend leaf, GraphQL cross-tree, claims consumers, relay-only, Worker transport,
   external fixture consumers, demos, renamed/deleted files, unknown path, missing
   base, multi-commit range, dependency/toolchain change, intentionally empty plan.
3. Wire local handoff and commit CI to it; prove an unrelated feature check is
   omitted and affected cross-tree checks remain selected. Update existing helper
   tests that currently demand the full frontend command.
4. Wire the full nightly environments and manual trigger. Check that mode-dependent
   tests really run, that selected failures propagate, and that one image suffices
   for both smoke and served-browser acceptance. Keep release contracts intact.
5. Replay the planner against representative historical change lists without
   executing suites. After deployment compare measured selected-command time and
   actual nightly findings over a short observation period. No up-front savings
   percentage is justified by today's heterogeneous histories.

No mass test relocation, generalized dependency graph, stress suite, new frontend
lint toolchain, test deletion, automatic retry expansion or speculative robustness
is part of this proposal. If the large runtime/visualizer files still dominate
selected runs, split those specific files by exercised boundary as a follow-up.

## Primary sources for platform behavior

- [GitHub Actions events: schedule](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#schedule),
  accessed 2026-10-21: default branch, timing limitations and manual event options.
- [GitHub Actions workflow syntax](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions),
  accessed 2026-10-21: push/PR diff semantics and pending checks for filtered workflows.
- Installed Vitest 4.1.10 source, `filterTestsBySource` / `getTestDependencies` in
  `frontend/node_modules/vitest/dist/chunks/cli-api.BK8pd4xc.js`, and CLI `related` /
  `changed` options in `cac.DdICfEr1.js`. This is pinned local dependency source,
  not a proposed new dependency.
- Repository inventory below cites the checked-in source snapshot. Relative line
  references identify that snapshot and may move with later changes.

## Detailed source inventory and routing matrix

Source snapshot: `675f4b5b316a945ebac0e237827fbea60080db2b`, inspected 2026-10-21. Read-only source analysis; no application test suites or remote CI queries were run. Counts below are source declarations, not newly executed passing tests. Only tracked source files were counted; dependency/build output was excluded.

### Classification rule

Use the boundary actually exercised, not the test runner or directory name. Unit tests exercise an isolated function/module with doubles at external boundaries. Integration tests compose real modules, a database, filesystem, process, or network service. Browser integration tests use a real browser but may stub the backend; full-stack E2E crosses the real frontend and backend and relevant services. Smoke, compatibility, security, regression and performance are purposes/tags orthogonal to those levels. A Rust `tests/` file is a Cargo integration target, but may still test a small isolated parser; an inline `#[cfg(test)]` module can exercise real SQLite and HTTP routing. Vitest does not mean unit, and Playwright does not mean full-stack E2E.

### Inventory totals and counting limits

| Family | Files | Authored declarations | Notes |
| --- | ---: | ---: | --- |
| Rust | 21 | 102 | `#[test]` / `#[tokio::test]`; 71 web-server, 21 relay, 10 claims |
| Frontend Vitest | 18 | 236 | Anchored `it(`/`it.each(`/`test(` declarations; parameterized tables/loops expand to more runtime cases |
| Playwright | 10 | 46 | Before three browser projects, OS/environment skips, CI retry and parameterization |
| Python deployable baseline | 3 | 19 | 8 HTTP/SPA, 7 GraphQL, 4 terminal/defect-registry |
| Python repository tooling | 2 | 31 | 25 handoff, 6 release workflow/notes |

Do not sum these into an executed-test total. Runtime case counts must come from a fixed-snapshot runner report. No current dedicated benchmark, load, stress, soak, mutation or fuzz suite was found in tracked source/config.

#### Frontend Vitest: every current test file

All are selected by `npm test` / `vitest run`, configured with jsdom and shared setup, excluding `e2e` (`frontend/package.json:46`, `frontend/vite.config.mts:63`). Source path below is relative to `frontend/src/`.

| File | Declarations | Actual boundary/type |
| --- | ---: | --- |
| `practice/map.test.ts` | 5 | Unit mapping/contract; reads shared baseline GraphQL fixtures from outside frontend (`:10`) |
| `completion_board/map.test.ts` | 6 | Unit mapping/validation |
| `completion_board/export.test.ts` | 3 | Unit CSV serialization/security regression |
| `learning/LearningPage.test.ts` | 2 | Unit `inputText` formatting, despite page filename (`:3`) |
| `lesson_runtime/bitFlip.test.ts` | 4 | Unit value transformation |
| `app/primitiveLabels.test.ts` | 1 | Registry-to-bilingual-label contract |
| `runtimeVersions.test.ts` | 4 | Static package-policy contract, not behavior tests (`:6`) |
| `crypto_graph/index.test.ts` | 77 | Mixed isolated primitives/domain compiler+executor/worker-request contract/known-answer crypto vectors; one elapsed-time regression (`:1648`); no real browser Worker |
| `lesson_runtime/index.test.ts` | 34 | Mixed parser/validation units and compiler/session/crypto integration; fixture filesystem reads; WorkerStub (`:45`) runs request handler in process; CLI subprocess integration for lesson validator (`:790`, `:806`, `:824`) |
| `visualizers/index.test.ts` | 28 | Mixed presentation helpers, React/jsdom component integration, real lesson/crypto execution, stub Worker (`:19`); can be expensive without a browser |
| `visualizers/migration.test.tsx` | 10 | Cross-module Lesson/crypto/presentation/React integration with stub Worker (`:68`) |
| `visualizers/ClassicalReadability.test.tsx` | 4 | React presentation integration, bilingual content/readability |
| `ui/learning/index.test.tsx` | 18 | React component interaction/accessibility integration, keyboard selection/lineage (`:78`, `:201`) |
| `terminal/Terminal.test.tsx` | 11 | Component unit/integration with xterm/addons/WebSocket mocked (`:19`, `:101`); does not prove real terminal I/O |
| `transport/ApolloClientProvider.test.tsx` | 2 | Apollo/React transport integration with mocked HTTP/WS boundaries (`:24`, `:49`) |
| `app/Providers.test.tsx` | 1 | Provider/component integration |
| `app/PracticeNavigation.routes.test.tsx` | 5 | Router/feature/UI integration using mocked GraphQL responses |
| `app/CompletionRecords.routes.test.tsx` | 21 | Router/feature/UI/Apollo cache-state integration with mocked GraphQL responses |

The source uses nested parameterized tables and a loop that declares AES variant tests. Therefore 236 authored declarations is deliberately not presented as the Vitest executed-case count.

#### Backend: every current test-containing source file

Run all via `cd backend && cargo test --locked -- --nocapture`. Package-level subsets already exist through Cargo; no framework is needed.

| Relative path under `backend/` | Tests | Actual boundary/type |
| --- | ---: | --- |
| `crates/completion-claims/src/ids.rs` | 5 | Unit validated identifiers (`:158`) |
| `crates/completion-claims/src/completed_at.rs` | 2 | Unit timestamp parsing/formatting (`:164`) |
| `crates/completion-claims/tests/vectors.rs` | 3 | Isolated crypto API known-answer/negative-vector contract; reads fixture JSON (`:70`) |
| `apps/web-server/src/opts.rs` | 4 | Unit CLI argument contract (`:94`) |
| `apps/web-server/src/schema.rs` | 4 | Three SDL-normalizer units and a generated-schema contract (`:81`) |
| `apps/web-server/src/logging.rs` | 3 | Structured logging integration/contract (`:66`) |
| `apps/web-server/src/practice_catalog/mod.rs` | 14 | Mostly isolated in-memory domain/parser cases; final test is filesystem adapter integration (`:852`) |
| `apps/web-server/src/lesson_catalog.rs` | 3 | Filesystem/content catalog integration (`:376`) |
| `apps/web-server/src/model.rs` | 1 | GraphQL/catalog integration (`:322`) |
| `apps/web-server/src/bootstrap.rs` | 8 | Startup/config/filesystem/catalog/optional SQLite integration (`:303`) |
| `apps/web-server/src/serve.rs` | 1 | Real TCP graceful-shutdown integration (`:37`) |
| `apps/web-server/src/http/router.rs` | 9 | In-process HTTP router, static filesystem and API integration (`:286`) |
| `apps/web-server/src/completion/config.rs` | 8 | Unit policy parsing/validation (`:153`) |
| `apps/web-server/src/completion/store.rs` | 4 | Real SQLite storage/migration integration (`:241`) |
| `apps/web-server/src/completion/integration_tests.rs` | 8 | Real signing/policy/router/SQLite/GraphQL integration, in-process HTTP `oneshot` (`:154`); restart and concurrent duplicate regression |
| `apps/web-server/tests/schema_parity.rs` | 1 | Cross-tree backend SDL versus checked-in frontend schema contract (`:14`) |
| `apps/web-server/tests/manifest_compatibility.rs` | 1 | In-process compatibility contract with old parser shape, not launching an old executable (`:44`) |
| `apps/web-server/tests/sqlite_version_diagnostic.rs` | 2 | Binary CLI/startup integration (`:20`, `:55`) |
| `apps/completion-relay/tests/config.rs` | 13 | Filesystem/key/config integration and CLI/bind/log-redaction cases (`:72`, `:248`) |
| `apps/completion-relay/tests/key_generate.rs` | 3 | Binary CLI/filesystem/key permissions integration (`:17`, `:72`) |
| `apps/completion-relay/tests/completions.rs` | 5 | Real local HTTP relay plus controlled backend, signing, errors, timeouts/shutdown integration (`:350`) |

#### Browser tests: every current spec

`frontend/playwright.config.ts:4` selects `frontend/e2e`; `:23` defines Chromium/Firefox/WebKit. `:28` starts Vite app and demo servers only when `PLAYWRIGHT_BASE_URL` is absent. CI retry is one (`:10`), not zero. The misleading script name `test:terminal-browser` invokes the entire Playwright suite, not just terminal (`frontend/package.json:49`).

| Spec under `frontend/e2e/` | Tests | Actual boundary/type and applicability |
| --- | ---: | --- |
| `crypto-graph-worker.spec.ts` | 3 | Browser integration with real Worker/session/RenderHost; all skip when `PLAYWRIGHT_BASE_URL` is set (`:5`, `:27`, `:46`) |
| `visualizers.spec.ts` | 11 | Browser UI/session integration, synthetic GraphQL fixtures; ten skip for served-container mode, one checks demos are absent (`:190`) |
| `aes-cipher-demo.spec.ts` | 1 | Heavy browser demo interaction; Vite only (`:16`); 600-second timeout (`:17`), trace disabled due ~100k DOM nodes (`:3`) |
| `learning.spec.ts` | 7 | Mixed: served AES and comparison (`:54`, `:82`), XOR both mocked-dev and real served mode (`:105`), three synthetic/error cases skip in container mode (`:180`, `:208`, `:259`), real mounted-content fallback/error case (`:284`) |
| `home-layout.spec.ts` | 1 | Browser layout/navigation integration |
| `practice-navigation.spec.ts` | 6 | Chromium-only responsive/layout integration, mocks `/query` (`:60`, `:72`, `:272`) |
| `completion-records-layout.spec.ts` | 1 | Chromium-only geometry integration, mocks `/query` (`:26`, `:31`) |
| `terminal.spec.ts` | 11 | Real browser/xterm/WebSocket against Python synthetic Challenge fixture (`:14`); terminal-component E2E, not private Host/Challenge deployment. OS-specific native macOS and synthetic Linux cases (`:224`, `:322`) |
| `web-tier.spec.ts` | 4 | Served-image SPA/API/assets/health smoke plus one mocked GraphQL page-render test (`:45`); therefore not all four are complete real-data E2E |
| `completion-records.spec.ts` | 1 | Full relay -> signed backend ingest -> SQLite -> GraphQL -> browser matrix E2E; skipped without `COMPLETION_RELAY_URL` (`:24`) |

Dev-only, relay, OS and browser-specific skips prevent "all Playwright passed" from proving all browser coverage. Determine exact executed/skipped counts from a fixed-mode runner report.

#### Baseline and tooling checks

- `baseline/tests/test_http_spa.py:12`: 8 deployed-image HTTP/SPA/static/health smoke tests; it checks served shell/assets, not browser rendering.
- `baseline/tests/test_graphql.py:55`: 7 real GraphQL/content/asset-contract integration tests against the deployed image.
- `baseline/tests/test_terminal.py:46`: 2 static known-defect-registry checks plus 2 API/real WebSocket fixture integration tests (`:60`). Fixture startup can raise `SkipTest` (`:70`).
- `baseline/run.sh:14` builds the complete image then delegates to `acceptance/run.sh --mode smoke`.
- `acceptance/run.sh:42` starts the image, `:50` runs all 19 Python baseline tests, `:51` restarts it, then `:60` optionally runs browsers. `pr` is Chromium; `release` is Chromium+Firefox+WebKit in sequence (`:66`). Thus browser acceptance already includes smoke.
- `acceptance/completion/run.sh:94` generates an ephemeral signing key using a built relay image, then starts real web and relay containers (`:128`, `:141`) and runs only completion-records Chromium (`:187`). Existing harness, but no current workflow invokes it.
- `tests/test_review_handoff.py:17`: 25 CLI integration tests using temporary Git repositories/subprocesses, including evidence fingerprints, commands, checks, review status, and the mandatory full frontend suite.
- `tests/test_release_workflow.py:18`: 3 source-level workflow-contract tests; `:85` adds 3 release-notes/subprocess tests, including fake `gh`/publishing-shell integration. Neither is application E2E.
- `frontend/src/crypto_graph/test/operation-parameters.typecheck.ts`: compile-time API contract, included by `frontend/tsconfig.json:37`, not a Vitest runtime file.
- `frontend/scripts/validate_lessons.mjs:24`: lesson validation through real runtime+visualizer modules loaded by Vite; an explicit content validator, not a standalone benchmark or a CI all-content job.
- Static/build checks: Rust formatting, Clippy, TypeScript, codegen cleanliness, release build, Vite build, SQLite image version diagnostic, release-tag/changelog validation, immutable-image identity/public-pull verification. Separate these from unit-test elapsed time.

### Additional test purposes

- Smoke exists: baseline, web image health/API/assets, publication public-image pull.
- Crypto known-answer vectors exist: `completion-claims/tests/vectors.rs:70` and FIPS AES cases in `crypto_graph/index.test.ts:1577`, `:1734`, `:1956`.
- Performance regression exists: direct in-process AES schedule worker-request execution must fit its existing time budget (`crypto_graph/index.test.ts:1648-1663`). This is a single threshold test, not a representative benchmark/latency trend suite.
- Concurrency correctness exists: eight concurrent duplicate claims must produce one insert and seven existing results (`completion/integration_tests.rs:331-359`). This is not sustained load or capacity testing.
- Accessibility/geometry/native keyboard checks exist in React and browser suites; browser coverage is engine/OS dependent.
- Error, input validation, signatures, redaction, filesystem paths, restart and stale UI regressions exist within integration suites. No need to add stress infrastructure merely to complete the taxonomy.

### Current CI and duplicated work

Only two tracked workflows exist; neither has `schedule`.

`build.yml:3` triggers on every branch push and `pull_request`. On a branch with an open PR, both event types can create runs for the same change. Its six jobs:

1. `workflow-contract` (`:23`) runs all 31 Python repository tests (`:29`).
2. `backend` (`:31`) runs formatting, Clippy all targets, full Cargo tests, release build (`:49-60`).
3. `frontend` (`:62`) runs npm ci, codegen dirty-tree check, typecheck, full Vitest **without the locally mandated one-worker option**, Vite build (`:79-103`).
4. `baseline` (`:107`) builds a web image with its own BuildKit cache, then smoke (`:133`).
5. `container-browser` (`:143`) waits for backend/frontend (`:146`), builds a separate image, checks SQLite runtime, installs dependencies/browser, then acceptance `pr` (`:202`). That acceptance includes the same baseline tests again. This second image build does not declare the baseline job's GHA cache settings.
6. `macos14-chrome-cmd-v` (`:224`) waits for frontend, separately installs npm/browser, runs one selected native keyboard test; `continue-on-error: true` (`:228`). Evidence gathering, not release gate.

The Build workflow has a branch filter but no tag trigger. Its `startsWith(github.ref, 'refs/tags/')` release-browser branch therefore is not the release mechanism under the checked-in triggers. Actual release is `release-web-image.yml`, triggered by `web-v*` tags (`:3-6`). It validates tag/changelog, builds and publishes an immutable candidate by digest, runs three-engine acceptance, promotes the tested manifest, then anonymously pulls it and runs smoke (`:94`, `:156`). This is a separate existing release contract; do not silently weaken it while redesigning commit/nightly CI.

### Confirmed coverage/wiring gaps

1. Container-only Playwright CI is not comprehensive browser coverage: real Worker/dev-only render/demo tests deliberately skip under `PLAYWRIGHT_BASE_URL` (`acceptance/run.sh:61`, `crypto-graph-worker.spec.ts:5`). A full nightly job must include an explicit dev/Vite browser lane as well as image acceptance.
2. Completion E2E is present but skipped in normal Build and release because neither supplies relay environment nor invokes `acceptance/completion/run.sh` (`completion-records.spec.ts:24`). Calling current full test commands nightly without adding this harness would retain the gap.
3. Frontend `lint` is unwired in CI and uses `--fix`; `package.json`/lockfile contain no eslint/parser/plugins used by `.eslintrc`. Source evidence shows it is not a reproducible installed check as configured; no lint command was executed to assert an exact runtime error. Existing backend fmt/Clippy, frontend types/tests and repository tests mean the repo is not generally unguarded. Repairing lint is a separate optional concern, not a reason to delay test routing.
4. `frontend/vite.config.mts:67` enables `passWithNoTests: true`. A selective runner must distinguish an intentionally empty plan from an unexpectedly unmatched selected suite; do not trust exit zero alone.
5. No existing category split means elapsed Vitest time cannot honestly be divided into pure unit versus integration from command names alone. The current files themselves mix levels. Record mixed suite time as mixed, or split only the expensive mixed files when implementing finer selection.

### Dependency edges a changed-file selector must preserve

- `backend/apps/web-server/src/model.rs` -> generated backend SDL -> `frontend/schema/schema.gql` parity (`schema_parity.rs:6-25`). Frontend `**/*.gql`, `.codegen.yml`, schema, generated types and tooling pins affect codegen/type consumers. Path-based schema parity is possible; the current comment claiming any frontend-only change requires backend is broader than this actual edge (`build.yml:14`).
- `completion-claims` is a path dependency of web server and relay (`backend/apps/web-server/Cargo.toml`, `backend/apps/completion-relay/Cargo.toml`). Claims changes affect all three packages; relay-only code need not run unrelated frontend visualizer tests.
- `baseline/fixtures/graphql/**` feeds Python baseline, frontend mapping tests and browser web-tier tests through explicit filesystem reads (`practice/map.test.ts:10`, `web-tier.spec.ts:4`). A frontend import graph alone misses this.
- `baseline/content/**` feeds image acceptance and served Learning browser tests. Markdown here is executable test input, not documentation; do not blanket-skip `**/*.md`.
- `frontend/demos/**` feeds runtime/visualizer tests and dev browser demo, and is included by TypeScript (`lesson_runtime/index.test.ts:8`, `visualizers/index.test.ts:6`, `tsconfig.json:39`). It is not covered by the current handoff helper's mandatory-frontend path list.
- `frontend/src/lesson_runtime/fixture/**` and `frontend/scripts/validate_lessons.mjs` are filesystem/subprocess dependencies of runtime tests (`lesson_runtime/index.test.ts:25`, `:790`).
- `crypto_graph` -> `lesson_runtime` -> `visualizers`/shared learning UI -> `LearningPage`; worker adapter uses `new Worker(new URL('./worker.ts', import.meta.url))` (`worker_adapter.ts:50`). Worker transport is not proven by WorkerStub.
- `app/routes.tsx:10` loads feature modules dynamically; i18n resources and primitive JSON feed registry label contracts/rendering. CSS/public/assets/config changes can affect browser behavior without a static TS import edge.
- Terminal browser fixture imports shared baseline WebSocket protocol code. Route/Markdown components can contain Terminal. Browser fixture and harness files must route to terminal browser tests.
- Dockerfile, start script, Compose, lockfiles, build configuration and public assets affect the final image; the Dockerfile builds all backend workspace binaries and copies whole frontend before building (`Dockerfile:10`, `:26`).
- `scripts/review_handoff.py:103` requires `frontend-tests` for broad frontend paths; `:119` fixes its whole-suite command. `tests/test_review_handoff.py:108`, `:137`, `:154` enforce that behavior. Updating CI alone will leave agent sessions doing the full suite.
- `tests/test_release_workflow.py:18` reads release workflow and acceptance harness source; route harness/workflow changes there. Keep release identity and acceptance contract unchanged unless separately authorized.

### Minimal candidate routing matrix (design input, not adopted policy)

Use a short explicit path -> existing suite table shared by local verification and CI. No dependency graph service, historical prioritizer, third-party framework or cache system is needed. Union all matching rows; renames/deletions include both names. Known documentation-only paths may intentionally produce no application jobs. Unknown executable/config/test paths should select the owning tree's checks with a visible explanation rather than silently skip.

| Change area | Immediate selected checks | Broad coverage deferred to nightly |
| --- | --- | --- |
| Plain docs/agent prose only | Relevant Python workflow/handoff contract if its policy changed; diff/links as applicable | Application suites |
| Release scripts/workflow | `test_release_workflow.py`; syntax/release contract | Runtime full suites |
| Handoff or selector/governance | `test_review_handoff.py` and selector contract tests | Runtime suites unless runtime paths also changed |
| Relay only | `cargo test --locked -p completion-relay`; relevant fmt/Clippy | Web/frontend suites; completion E2E nightly unless relay behavior needs it immediately |
| Claims crate | Claims+relay+web Cargo suites | Browser/UI/complete image matrix |
| Web server only | Web package tests; schema contract when adapter/schema touched | Unrelated frontend visualizer suites |
| GraphQL contract or tooling | Schema parity, codegen freshness, frontend typecheck, affected feature mappings/routes | Unrelated browser matrix |
| Frontend feature (`practice`, `completion_board`, `terminal`) | Owning unit/component tests plus route callers and relevant browser Chromium tests when changed behavior requires real layout/I/O | Other features/all engines |
| Crypto/runtime/visualizers/UI | Owning and downstream module tests; real Worker browser for transport/isolation/cancel changes; selected visualizer browser for browser-only behavior | Other domains and full engine/demo matrix |
| App shell/providers/i18n/shared CSS/public | Affected shared/route tests; targeted Chromium layout; typecheck/build when bundle affected | Unrelated backend suites and broad browser matrix |
| Demos/runtime fixtures/validator | Runtime and visualizer consumers; validator CLI tests; relevant dev browser spec | Unrelated practice/completion/backend |
| Baseline fixtures/content | Named fixture consumers and relevant HTTP/GraphQL/served-Learning checks | Unrelated domains |
| Node lock/pin/Vite/TS/shared setup | Frontend full Vitest/typecheck/build and selected runtime browser smoke | Backend unrelated work; full browser matrix |
| Rust lock/toolchain/workspace | Backend full fmt/Clippy/tests/build | Frontend unrelated module tests |
| Dockerfile/start/Compose/acceptance harness | One image build plus smoke or selected image acceptance; release-workflow contract where harness changes | Duplicate image build and broad independent app suites |

For the first implementation, select existing files/package suites rather than moving all tests. The largest mixed files (crypto_graph, lesson_runtime, visualizers) may justify a small behavior-preserving split into pure/domain, integration/DOM and browser-only fixtures if historical timings show they dominate selected runs. The taxonomy should not require a repository-wide test relocation.

A genuine nightly full plan must explicitly cover full Python tooling, full backend, full frontend, Vite-only browser tests, image acceptance in supported browsers, completion relay-to-board harness, and the existing macOS compatibility evidence lane at its intended advisory severity. Build a web image once per workflow and reuse it for smoke+image-browser acceptance; do not execute separate baseline smoke before acceptance when acceptance already includes it. Keep release publication's immutable-image gate separate. Plain local source analysis cannot establish actual wall-time savings or whether host tests can run concurrently without contention; use measured history and preserve sequential heavy local checks until policy changes.
