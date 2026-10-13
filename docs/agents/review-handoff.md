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

## Converge the review

- Review the actual diff and evidence against the recorded acceptance boundary.
  The implementer's summary is an index, not proof.
- Keep finding IDs across rounds. Recheck fixes and affected behavior; a new
  blocker still needs an authorized requirement or a concrete defect under
  AGENTS.md. Reviewer preference is not requirement authority.
- Fix clear defects directly. For disputed requirements or new product behavior,
  pause affected work and record the maintainer's decision in the issue first.
- Keep optional improvements non-blocking. Do not automatically implement every
  finding merely because implement-spec asks to address review feedback.

## Report the review

Use this format only when reviewing an implementation diff. It reports the
defect and evidence, while leaving implementation choices to the implementer.

```md
## Review: changes required

- **Blocking R1** — `path/to/file.ts:42` — violates `<criterion or contract>`; observed `<failure>`; evidence: `<check or counterexample>`.

Non-blocking:
- `<optional observation>`
```

Use `## Review: pass` when there are no blocking findings.
