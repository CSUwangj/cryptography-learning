# Specification template

Use only the sections that carry information. Keep each entry brief, and link to repository
decisions instead of copying them.

## Outcome

State the observable result.

## Requirements and provenance

Group requirements when they share a source. For each group, cite one of:

- a maintainer-approved issue requirement;
- a repository contract or ADR;
- a necessary consequence of another requirement, with the reasoning; or
- an explicitly approved exception or strengthened guarantee recorded in the issue.

Requirements without one of these sources are proposals, not acceptance criteria.

## Operating assumptions

Reference the repository operating and threat model. State only task-specific deviations.

## Complexity budget

- **Simplest acceptable path:**
- **Acceptable manual recovery:**
- **Explicit non-goals:**
- **Approved mechanisms:** Name each approval-required mechanism and the requirement it serves,
  or write `None`.

## Acceptance criteria

Give each criterion a provenance reference to the requirement group above.

## Open decisions

For every proposed stronger guarantee, include its motivation category, concrete scenario,
specific failure or harm example, evidence status, costs, and simpler accepted-risk alternative.
Do not promote it to a requirement until the maintainer records approval in the issue. If facts
are unknown, name them and require the maintainer to invoke a research session.
