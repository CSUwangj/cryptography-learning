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
- `run` checks the snapshot before and after the command, captures stdout/stderr
  in a sibling log, and saves the command, cwd and actual exit code. Attempts
  are retained. When the command returns, the attempt also records `finished_at`
  as an observed UTC completion timestamp and `elapsed_seconds` as nonnegative
  execution time measured with a monotonic clock. This duration covers command
  execution, including process launch, rather than snapshot verification.
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
  includes latest status, attempt count, the latest attempt's `elapsed_seconds`,
  earlier failed/unavailable counts and incomplete checks. Full attempt records
  and logs remain in the packet. Unknown timing appears as JSON null in the
  summary, distinct from a recorded numeric zero. An unchanged rerun may pass
  without hiding earlier failures.
  Older packets without timing fields remain readable with unknown timing and
  unchanged verification behavior, but missing mandatory checks or mixed commands
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
The helper neither monitors nor cleans up abandoned child processes.

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
