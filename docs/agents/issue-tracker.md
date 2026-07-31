# Issue tracker: GitHub

Issues and PRDs for this repository live as GitHub issues in
`CSUWangj/cryptography-learning`. Use the `gh` CLI for all operations.

Cross-repository work and private deployment orchestration are tracked separately in
`CSUAuroraLab/cryptography-learning-infra`. Because this checkout's remote may use a local
alias, commands should explicitly pass `--repo CSUWangj/cryptography-learning` (or use the
equivalent repository path in `gh api` calls).

## Conventions

- **Create an issue**: `gh issue create --repo CSUWangj/cryptography-learning --title "..." --body "..."`.
- **Read an issue**: `gh issue view <number> --repo CSUWangj/cryptography-learning --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --repo CSUWangj/cryptography-learning --state open --json number,title,body,labels,comments` with appropriate label and state filters.
- **Comment on an issue**: `gh issue comment <number> --repo CSUWangj/cryptography-learning --body "..."`.
- **Apply or remove labels**: use `gh issue edit <number> --repo CSUWangj/cryptography-learning` with `--add-label` or `--remove-label`.
- **Close**: `gh issue close <number> --repo CSUWangj/cryptography-learning --comment "..."`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares one number space across issues and PRs, so resolve an ambiguous bare number by
checking the pull request first and then the issue, always against the infrastructure repository.

## When a skill says "publish to the issue tracker"

Create a GitHub issue in `CSUWangj/cryptography-learning`.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --repo CSUWangj/cryptography-learning --comments`.

## Wayfinding operations

Used by `/wayfinder`. The map is one issue with child issues as tickets.

- **Map**: an issue labelled `wayfinder:map`, holding Notes, Decisions-so-far, and Fog.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue. If sub-issues are unavailable, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Apply the relevant `wayfinder:<type>` label.
- **Blocking**: use GitHub's native issue dependencies. The dependency endpoint requires the blocker's numeric database ID, not its issue number or node ID. If dependencies are unavailable, put `Blocked by: #<n>` at the top of the child body.
- **Frontier query**: list the map's open children, then exclude assigned tickets and tickets with open blockers. The first remaining ticket in map order is next.
- **Claim**: assign the ticket to the driving developer; this is the session's first tracker write.
- **Resolve**: comment with the answer, close the ticket, and append its context pointer to the map's Decisions-so-far.

For API calls, target `repos/CSUWangj/cryptography-learning/...` explicitly.
