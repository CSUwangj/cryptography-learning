# Execution and review handoff

## Execute a confirmed phase

- Use the approved issue and linked decisions as the acceptance boundary.
  Carry forward non-goals, accepted risks, and approved exceptions.
- A ticket is ready only when its dependencies and recorded product checkpoints
  are satisfied. Execute independent ready work while affected work waits.
- When using implement-spec, deliver staged changes for maintainer review;
  do not commit. Skill instructions to commit or merge do not override AGENTS.md.
  Do not claim that uncommitted work has been integrated into another branch.
- A prototype confirms behavior, not implementation structure. Record confirmed
  interactions, rejected alternatives and reasons, and unresolved questions in
  the issue before implementing dependent work. Silence is not approval.

## Preview checks during development

Before running development checks, and whenever a new file category is introduced,
preview the current working-tree plan from the repository root:

```sh
python3 scripts/test_plan.py local --explain
```

Inspect the changed paths, selected check IDs, commands, working directories,
configured environment, combined reasons, and intentional omissions. Working
directories are relative to the displayed repository root. Configured environment
values supplement the caller's environment; the preview does not capture that
environment. Unknown-path warnings retain the planner's conservative fallback
checks. Correct an unsuitable mapping in `scripts/test_plan.py` and preview again
before execution; do not drop paths or override coverage to shorten the plan.

The preview is read-only: it runs no checks and creates no acceptance evidence.
Its provisional scope includes net differences between HEAD and the working tree
plus non-ignored untracked paths. Staged changes canceled in the working tree can
be absent, such as a staged new file whose working copy is deleted. Recompute when
paths or file categories change. The default output remains JSON:

```sh
python3 scripts/test_plan.py local
```

Final handoff capture still discovers its own classified staged target and freezes
its own plan. The preview does not replace exclusions, snapshot verification, or
the rejection of caller-defined acceptance commands described below.

## Verification scope and stopping

Start with the reported failure, changed behavior and directly affected consumers.
Use the planner-selected checks as the required handoff baseline. Add supplemental
checks only for an explicit acceptance criterion or a concrete regression path;
record what the extra check proves. A shared component justifies its affected
consumers, not every suite in the repository. Full-suite commands in `AGENTS.md`
are references, not an additional checklist on top of the plan.

Default to one relevant validation round and, if needed, one affected recheck
after a correction. Run final required checks once on the candidate and reuse
passing evidence across review stages while its inputs remain unchanged.
Role changes, renamed findings and new packets do not reset the investigation
budget. After two unsuccessful rounds for the same failure, report the specific
remaining gap and proposed next step; obtain maintainer direction before more
diagnostic variants, base comparisons or performance recordings unless those
steps were already explicitly authorized. A failure does not by itself authorize
product optimization or broader validation.

For a timeout, inspect the existing log and source first. Distinguish a stalled
operation or violated product deadline from a finite test sequence making
progress. For the latter, increase only the affected test's budget to a bounded
value supported by observed duration or an existing comparable case, then run
one focused recheck. This is an authorized test-budget adjustment unless the
ticket explicitly forbids it; preserve assertions, retries and application
deadlines, and retain the original timeout evidence. A repeated timeout ends
this branch with its remaining gap rather than starting another investigation.

This budget limits investigation effort, not evidence honesty. Required failed
or unrun checks remain incomplete; a focused pass is not a full-suite pass.
An acceptance exception still requires explicit maintainer approval under the
delivery rules. Report a planner mismatch instead of silently replacing its
frozen command or expanding the plan to chase a passing result.

## Coordinate shared check failures

When several tickets may have the same failure, coordinate diagnosis before
starting another baseline campaign:

1. Find an existing related issue and name one owning ticket and one investigator.
   Use that issue as the discoverable evidence record rather than requiring a new
   issue per ticket. Record a stable finding ID, affected tickets, failing baseline
   and candidate revisions, relevant source versions, command and cwd, fixtures,
   failure stage and symptom, execution conditions, evidence, known limits and
   repair revision when known. Mark unknown fields explicitly. Link the record
   and its open or resolved blocker status from each affected ticket.
2. Before reusing diagnosis, compare each ticket's relevant source and baseline
   with the record, including test/assertion and fixture versions, exact command
   and cwd, toolchain/dependencies, workers, settings and permission context.
   Record matches, differences and unknowns, and explain why the demonstrated
   cause applies. A same-named test or generic timeout is insufficient. Incompatible
   baselines, missing applicability evidence and new failure stages stay separate
   from the shared diagnosis until evidence supports attribution.
3. Carry the finding ID, evidence, consumed investigation rounds and remaining
   budget across investigators, tickets and agents for the same source-backed
   failure rule. Apply [verification scope and stopping](#verification-scope-and-stopping)
   to their aggregate effort. Transfers and renamed findings do not reset it.
   When correcting attribution, preserve the old record and its spent budget;
   link a separate finding for a genuinely different cause. At the stopping limit,
   report the remaining gap and seek maintainer direction before more diagnosis.
4. Keep each ticket's original failed attempts and final candidate checks on its
   own snapshot under the staged-handoff rules. Reuse diagnosis, never another
   candidate's pass. Shared diagnosis grants no acceptance exception or automatic
   flaky classification. Keep an unresolved shared blocker visible in every
   affected ticket while unaffected independent work continues. After a repair,
   record its revision and applicability limits, then run each ticket's required
   final checks; retain earlier failures even when those checks pass.

Keep detailed logs, traces and private execution configuration outside the
checkout and published records. Issue conclusions contain only public-safe
symptoms, source/evidence references, attribution, limits and next steps. This
procedure grants no tracker-write permission. Without it, keep publication drafts
outside the checkout and hand them off with the unresolved publication action.

### Example of a shared diagnosis

- When three tickets match on the byte-span source, contiguous-value assertion,
  fixtures and execution conditions, they can reuse one accessible-value diagnosis
  under one owning ticket.
- An initial loading failure stays in a separate branch even when its test name
  matches the accessible-value case.
- Transfer the same finding ID with its already-spent investigation budget.
  The recipient stops if that budget is exhausted. Each ticket retains its original
  failed attempts and runs its own required final candidate checks.

## Run local checks across worktrees

Use `scripts/local_check.py -- COMMAND [ARG ...]` for development checks. Run it
from the command's working directory so Fish+nvm finds the pinned Node version:

```sh
cd frontend
python3 ../scripts/local_check.py -- npx playwright test --project=chromium e2e/local-run.spec.ts
python3 ../scripts/local_check.py -- npm test -- --maxWorkers=1
python3 ../scripts/local_check.py -- npm run build
python3 ../scripts/local_check.py -- npm test -- --maxWorkers=1 src/crypto_graph/index.test.ts
```

The development entry and `review_handoff.py run` share one advisory lock at
`~/.cache/cryptography-learning/heavy-check.lock`. It is outside every worktree
and shared by managed invocations under the same local account. The executable
classification in `scripts/local_check.py` leaves Python unittest commands, Rust
formatting, frontend typecheck/codegen, and npm tests selecting only existing
`.test.ts` or `.test.tsx` files outside the lock when their combined positional
filters leave at least one actual unit test unselected. The inventory uses the
command directory's `src` and `demos` trees, excluding `node_modules`, `dist`,
and `e2e`. A selection covering that entire inventory takes the slot, even when
all files are named explicitly. An empty inventory also takes the slot.
Test file paths are resolved from the command's working directory. Named tests may also use
`--maxWorkers=...` and `--passWithNoTests=...`. Other test arguments conservatively
take the heavyweight slot, including broad filters such as `.test.ts`.
Other commands take the heavyweight slot,
including browser suites, full frontend tests, builds, installs, and image
acceptance. The planner records this classification as `heavyweight` on each
check after combining test selections. Hosted CI keeps its existing planner
execution route and check selections without acquiring the local lock.

Both local routes activate direct npm/npx/node commands through Fish+nvm, retain
argv and cwd, and preserve the command's endpoint and artifact settings. The
development entry prints a `Local check:` JSON record to stderr with separate
`wait_seconds` and `elapsed_seconds` values and the command exit code. Handoff
attempts record the same durations. Lightweight checks record zero wait.
Execution time includes launch and owned-child cleanup, excluding resource
waiting and snapshot verification. Invoke `review_handoff.py run` directly.
Nested heavyweight entry fails explicitly rather than reacquiring or bypassing
the lock. Lightweight nested commands remain available.

The Linux local routes adopt command descendants, including detached process
groups. After success, failure, or handled SIGINT/SIGTERM, they send SIGTERM to
remaining owned children and wait for them to exit and be reaped before releasing
the slot. Cancelling a waiter does not stop its owner. A handled cancellation
returns exit 1 and records an unavailable attempt or development record with a
null command exit code and no invented execution completion. Further SIGINT and
SIGTERM signals are ignored during cleanup so they cannot release the slot early.

This boundary covers cooperative repository tooling on one development machine.
Commands outside these routes can still contend for resources. A child that
ignores termination can keep cleanup and the slot occupied; inspect and terminate
only confirmed owned processes manually. After abrupt runner termination such as
SIGKILL, inspect and stop any confirmed owned leftovers before retrying. Do not
delete the lock file while managed invocations are active. There is no automatic
crash recovery, multi-user or distributed coordination, machine-wide enforcement,
or zero-flake guarantee.

## Transfer the work

Give the next agent these facts, with links rather than copied conversation:

1. Repository/worktree, issue, confirmed phase, and remaining product decisions.
2. Base SHA and review target: staged diff, working-tree diff, or committed range.
   A base SHA plus staged changes is valid; a new commit is not required.
3. Acceptance criteria and the commands/results that support each changed behavior.
4. Checks not run, unavailable capabilities, and evidence limitations.
5. Outstanding finding IDs and their disposition: fixed, disputed, or non-blocking.
6. Unstaged/untracked files and whether they are required, generated, or unrelated.

Stage only intended changes. Preserve unrelated work and identify it explicitly.
Evidence must describe the exact review snapshot; unstaged fixes cannot prove a
staged change. Recheck affected evidence after changing that snapshot.

## Capture a staged handoff

Use `scripts/review_handoff.py` for the single-ticket loop. It uses Python's
standard library and does not stage, commit, change branches, or contact a
service. Prepare English notes outside the checkout; the packet embeds them.

After staging intended ticket files, create a packet. The script discovers staged
paths, derives and freezes the check plan, and requires `--exclude PATH REASON`
for every unrelated staged, unstaged, untracked, or excluded change. `--output`
is optional; the script prints its external temporary path and snapshot ID.
The planner's top-level `omissions` list is descriptive (`not-run` plus a reason)
and is preserved in the packet; CI executes only entries in `checks`.

```sh
python3 scripts/review_handoff.py create --issue '#96' --notes /tmp/issue96-notes.md
python3 scripts/review_handoff.py run /tmp/review-handoff-...json
python3 scripts/review_handoff.py verify /tmp/review-handoff-...json --require-passed --require-reviewed
```

`run` executes every frozen check sequentially and retains logs and attempts.
The hidden `--label CHECK_ID` form reruns one planned check with its frozen
command and working directory. Caller-defined paths, checks, commands, and
working directories are rejected; fix the planner and create a new packet.
Use `review` to record formal review evidence with explicit snapshot, status,
and evidence arguments. Final verification requires both `--require-passed`
and `--require-reviewed`.


Serialize all `run` and `review` writes to one packet; concurrent writes can
overwrite each other's records. Reviewers can inspect code in parallel while
the coordinator records their returned reports sequentially.
Use the host's normal permission flow if a check needs escalation; the wrapper
does not grant permission or bypass the sandbox. Inspect the log for meaningful
test coverage, not just a zero exit code. Add an existing tool version command
when needed to make environment-dependent evidence interpretable.

- `create` rejects an empty target, unstaged target changes, unresolved merges,
  whitespace errors, and unclassified changes. Classify each unrelated changed
  or untracked file with `--exclude PATH REASON`; nothing is removed or reset.
  Required ticket files belong in the staged target, never in exclusions.
- The packet contains the review command, file list, target diff fingerprint,
  full index fingerprint, unstaged diff fingerprint and non-ignored untracked
  file fingerprints. Changes outside the target also invalidate evidence;
  reviewers must assess whether excluded work affects ticket behavior.
- `run` checks the snapshot before waiting, again after acquiring the execution
  slot and before launch, and after the command. A candidate changed while waiting
  receives unavailable evidence without launching the check. It captures stdout/stderr
  in a sibling log, and saves the command, cwd and actual exit code. Attempts
  are retained. When the command returns, the attempt also records `finished_at`
  as an observed UTC completion timestamp and `elapsed_seconds` as nonnegative
  execution time measured with a monotonic clock. `wait_seconds` records resource
  waiting separately, including an interrupted wait. Execution duration covers
  process launch and owned-child cleanup, rather than waiting or snapshot verification.
  A failed command is `failed`; a command with no recorded
  completion, failed launch or changed snapshot is `unavailable`. A check with
  no attempt is `not-run`. Only exit zero on the recorded snapshot is `passed`.
  Failed launch and handled interruption keep an explicit reason and a null
  exit code, without `finished_at` or `elapsed_seconds`. Abrupt abandonment leaves
  the initial unavailable record without inventing completion metadata.
- Planner-selected labels accept only their frozen argv and cwd. Local npm/npx/node
  commands run through Fish+nvm. Caller-supplied commands and working directories are
  rejected before execution and cannot replace earlier evidence.
  Inspect the actual selected tests; fixed command text does not prove coverage or
  freeze environment variables, installed dependencies or external services.
- `verify` checks snapshot and log identity. `--require-passed` also requires
  every planner-selected check to be declared, consistent command identities, and
  the latest attempt of every declared check to pass. Its summary
  includes latest status, attempt count, the latest attempt's `wait_seconds` and `elapsed_seconds`,
  earlier failed/unavailable counts and incomplete checks. Full attempt records
  and logs remain in the packet. Unknown timing appears as JSON null in the
  summary, distinct from a recorded numeric zero. An unchanged rerun may pass
  without hiding earlier failures.
  Packets without timing fields remain readable with unknown timing when their
  frozen plan still matches. Plan changes, including added classification metadata,
  require a new packet. Missing mandatory checks or mixed commands
  cannot satisfy `--require-passed`; create a new packet and recheck as needed.
  `--require-reviewed` separately requires both formal-review axes to pass on this
  snapshot with no open or disputed findings. Normal delivery requires both flags. Ordinary
  `verify` permits incomplete evidence; none of these modes judges coverage,
  review correctness or reviewer independence.

### Record formal reviews

Send reviewers the packet and the snapshot ID printed by `create` or `verify`.
New packets and older packets without review records have both axes pending.
Before restarting an axis on the same snapshot, record `pending` using the
dispatch note as evidence. After each report returns, record its actual status
(`passed`, `changes-required` or `disputed`); pre-review is not a formal verdict.
Use `disputed` while a reported blocker awaits adjudication, even if another
reviewer passed. Store reports and disposition reasons in English outside the
checkout. The helper embeds their text, so later edits do not rewrite history.

For example, after both independent formal reports have actually returned a pass:

```sh
python3 scripts/review_handoff.py review /tmp/issue96-round1.json \
  --axis standards --status passed --snapshot SNAPSHOT_ID \
  --evidence /tmp/issue96-formal-standards.md
python3 scripts/review_handoff.py review /tmp/issue96-round1.json \
  --axis spec --status passed --snapshot SNAPSHOT_ID \
  --evidence /tmp/issue96-formal-spec.md
python3 scripts/review_handoff.py verify /tmp/issue96-round1.json \
  --require-passed --require-reviewed
```

Add `--finding ID STATUS` for each finding raised or updated in that report:
`open`, `disputed`, `resolved`, `withdrawn` or `non-blocking`. IDs are scoped to
their axis. Omitted IDs retain their previous status, including when recording
a pass; clearing a finding requires an explicit disposition and its reason in
the evidence. Review entries are retained. A different snapshot needs fresh
review records; carry outstanding finding IDs into that review from the notes.
The helper checks recorded state, not whether a report omitted a real finding
or falsely claimed a pass.

Use a new packet filename after code changes; the helper refuses to overwrite
an existing packet at creation. Run affected checks against the new snapshot,
and explicitly justify any unaffected prior evidence in the notes. Do not
copy old passing attempts into a new packet. An environmental retry on the
same snapshot uses `run` again, retaining the failed attempt and its log.
Keep the command and cwd unchanged; record tool versions, worker count and
permission context in the notes. Changed test selections or parallelism are
diagnostic evidence. Run heavyweight checks sequentially, including base/target
comparisons, and use ticket-loop's failure diagnosis branch when causality is unclear.
After a runner interruption, confirm its command has exited before retrying.
Handled SIGINT/SIGTERM waits for owned-child cleanup. Abrupt termination still
requires manual inspection and cleanup of confirmed owned leftovers.

Keep notes, packets and logs outside the checkout. Ignored dependencies/build
outputs, external services, and transient edits restored before verification
are outside the fingerprints; keep the execution environment stable and report
relevant limitations. Fingerprints prevent accidental snapshot confusion, not
deliberate tampering. Preserve artifacts until maintainer acceptance.

## Converge the review

- Before reading the implementation diff, establish expected behavior from the
  approved issue and linked decisions, checking the notes' scope and examples
  against those sources. Then review the actual diff and evidence against that
  boundary. The implementer's summary is an index, not proof.
- Keep finding IDs across rounds. Recheck fixes and affected behavior; a new
  blocker still needs an authorized requirement or a concrete defect under
  AGENTS.md. Reviewer preference is not requirement authority.
- The coordinator validates each blocker's source, scope and counterexample
  before forwarding it for repair, recording the assessment in the existing
  finding disposition. Return unsupported interpretations to the reviewer.
  Fix confirmed clear defects directly. For disputed requirements or new product behavior,
  pause affected work and record the maintainer's decision in the issue first.
- Keep optional improvements non-blocking. Do not automatically implement every
  finding merely because implement-spec asks to address review feedback.

## Report the review

Use this format only when reviewing an implementation diff. It reports the
defect and evidence, while leaving implementation choices to the implementer.

```md
## Review: changes required

- **Blocking R1** — `path/to/file.ts:42` — violates `<linked criterion/decision or contract location and scope>`; expected `<source-backed behavior>`; observed `<failure>`; evidence: `<check or counterexample>`.

Non-blocking:
- `<optional observation>`
```

Use `## Review: pass` when there are no blocking findings.
Report verification separately: passed, failed, or incomplete, with the packet
and evidence limitations. A review pass alone does not resolve missing required
checks or supply a recorded human product checkpoint.
