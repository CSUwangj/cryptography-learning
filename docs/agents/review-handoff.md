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
service. The caller remains responsible for authorizing each check command.
Read `python3 scripts/review_handoff.py --help` for the three subcommands.

Prepare an English notes file outside the checkout. Include the approved issue
and decision links, acceptance-to-check mapping, non-goals and accepted risks,
ordinary implementation assumptions, selected role/model/provider/execution
routes and any unverified runtime identity, remaining product decisions (or none),
finding IDs/dispositions, and checks not run with their reasons. The script
embeds those notes; it does not judge their completeness or requirement authority.

For `ticket-loop`, also record the resolved skill paths, test interfaces and
coverage limits, review stage/axis and repair progress. Carry the selected model
mapping into nested reviews and record any escalation diagnosis or repair
takeover. Pre-review pass is not formal acceptance; a review context that edits
the ticket cannot supply its independent formal verdict.

For an error-prone restriction, use this compact entry in the existing
acceptance-to-check mapping: `source/decision -> constrained object and scope ->
allowed example -> rejected example -> check/result`. For example, the
[#96 decision](https://github.com/CSUWangj/cryptography-learning/issues/96#issuecomment-6255143506)
constrains each v2 operation to one output port: two single-port output nodes
exporting two graph values are allowed; one operation with multiple output ports
is rejected. A graph-wide output-node count tests a different restriction.
Retain superseded finding IDs and link the replacing decision; historical tests
or review agreement do not turn an interpretation into authority.

After staging the final ticket files, create a packet. Replace the example
paths, issue, base, and check names with the actual task. `--base` must resolve
to the current HEAD: this helper handles staged changes, not committed ranges.
Each `--paths` entry is an exact repository-relative file, including both paths
of a rename. List every check planned for this snapshot using `--check`.

```sh
python3 scripts/review_handoff.py create \
  --repo . --base BASE_SHA --issue '#96' \
  --notes /tmp/issue96-notes.md --output /tmp/issue96-round1.json \
  --check typecheck --check tests --check build \
  --paths frontend/src/lesson_runtime/compiler.ts frontend/src/lesson_runtime/index.test.ts

python3 scripts/review_handoff.py run /tmp/issue96-round1.json \
  --label typecheck --cwd frontend -- fish -lc 'nvm use; and npm run typecheck'

python3 scripts/review_handoff.py verify /tmp/issue96-round1.json
python3 scripts/review_handoff.py verify /tmp/issue96-round1.json --require-passed
```

Run the other declared checks through `run` with the repository's pinned tools.
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
  are retained. A failed command is `failed`; a command with no recorded
  completion, failed launch or changed snapshot is `unavailable`. A check with
  no attempt is `not-run`. Only exit zero on the recorded snapshot is `passed`.
- `verify` checks snapshot and log identity. `--require-passed` also requires
  the latest attempt of every declared check to pass. Ordinary `verify` permits
  reviewing code with explicitly incomplete evidence; it is not a completion
  gate. Neither mode decides whether the planned checks cover the acceptance
  criteria.

Use a new packet filename after code changes; the helper refuses to overwrite
an existing packet at creation. Run affected checks against the new snapshot,
and explicitly justify any unaffected prior evidence in the notes. Do not
copy old passing attempts into a new packet. An environmental retry on the
same snapshot uses `run` again, retaining the failed attempt and its log.
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
