# Agent guidance

## Communication and records

- Communicate with the maintainer in Chinese.
- Record work in English, including code comments, documentation, issue or PR text, review notes, and change summaries.
- Keep agent-provider identities and connection details in private local configuration
  or execution notes outside the checkout. Redact them from repository files and
  published issue/PR records, including copied logs and handoffs.

## Hard constraints

- Never run `git commit`. Stage completed work with `git add` and stop; committing is the
  maintainer's decision, even when another workflow or skill says otherwise.
- Ask before probing a live Host, scanning ports, querying deployment state, or surveying
  external systems. Inspect the checked-out source first; the maintainer can usually supply
  missing environment details more cheaply than they can be inferred.
- Do not add private Lab content or deployment configuration here. Challenges, Lab
  Descriptions, and the Lab Registry belong to the private content repository; Host
  orchestration belongs to the private infrastructure repository.

## Repository contracts

- `backend/` is Rust; `frontend/` is React/TypeScript. Read a subtree's own `AGENTS.md`
  before changing files there.
- New or changed student-facing frontend copy must provide both `en-US` and `zh-CN`
  translations unless an issue explicitly approves an exception. Stable identifiers and
  user-supplied content remain untranslated.
- The GraphQL schema is a cross-tree contract. Rust GraphQL adapters in
  `backend/apps/web-server/src/model.rs` are authoritative, while
  `frontend/schema/schema.gql` is the hand-maintained client copy.
  Keep both sides synchronized; `backend/apps/web-server/tests/schema_parity.rs`
  enforces parity.
- Preserve the pinned toolchains unless a modernization ticket changes them: Rust
  1.97 (see `rust-toolchain.toml`) and the Node version in `frontend/.nvmrc`. Use
  lockfile-respecting commands (`--locked`, `npm ci`).
- `baseline/` characterizes current deployable behavior. It is not a declaration that
  every observed behavior is desirable. Known terminal defects remain documented in
  `baseline/terminal/known_defects.md`.

## Verification

Before phase execution, delegation, or diff review, read the
[handoff guide](docs/agents/review-handoff.md).
Before development checks, follow its [preview](docs/agents/review-handoff.md#preview-checks-during-development)
and [local execution](docs/agents/review-handoff.md#run-local-checks-across-worktrees) rules.
For staged delivery, follow [snapshot capture and evidence](docs/agents/review-handoff.md#capture-a-staged-handoff).
For failed checks or broader verification, follow [verification scope and stopping](docs/agents/review-handoff.md#verification-scope-and-stopping).

For ticket stages and roles, use [ticket-loop](.agents/skills/ticket-loop/SKILL.md).
The handoff review report format does not apply to grilling or specification sessions.

## Keep changes reviewable

- Make the smallest change that solves the request. Do not fold in unrelated
  refactors, cleanup, migrations, or new abstractions unless they are needed to
  make that change safe or possible.
- Keep work easy to review. Split independently understandable changes at a
  meaningful boundary; if a larger change must stay together, explain why.
- Tests should show the requested observable behavior or guard a credible
  regression. Do not rely only on implementation-detail assertions or mocks
  that merely repeat the implementation's assumptions.
- Never delete, weaken, skip, or call a test flaky just to make work pass,
  unless the requested behavior itself is changing and the reason is clear.
- For ambiguous or multi-component work, state the intended behavior,
  assumptions, and evidence that will show it works before changing code.
- Before declaring work complete, read the final diff against the request.
  Passing tests and CI are evidence, not proof that the requested result was
  delivered.

## Completion gate

- Every coding-task final response must include this exact `### Change Manifest` section. Do
  not substitute a prose summary or declare completion before it.

  ```md
  ### Change Manifest
  - `path:start-end` - observable behavior changed - verification result
  - Staged verification: `<command/result>`
  - Untracked files: `<classification or none>`
  - Checks not run: `<reason or none>`
  ```

- It should only summary one edit(means one prompt) not whole session.
- For a no-change task, don't include this section.

## Agent skills

### Issue tracker

Issues and specs for the public web tier live as GitHub issues in
`CSUWangj/cryptography-learning`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use the default label strings. See
`docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository: use `GLOSSARY.md` and `docs/adr/` at the repository root.
See `docs/agents/domain.md`.

Requirement authority and complexity rules live in
[`docs/agents/requirement-authority.md`](docs/agents/requirement-authority.md).
Grill decision records follow [`docs/agents/grill-decision-ledger.md`](docs/agents/grill-decision-ledger.md).
