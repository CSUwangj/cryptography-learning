# Agent guidance

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

Run the smallest checks that cover the change, and report any checks not run:

- Backend or schema: `cd backend && cargo test --locked -- --nocapture`
- Frontend: use `frontend/.nvmrc`, then `cd frontend && npm ci && npm run typecheck && npm test && npm run build`
- Deployable behavior: `./baseline/run.sh` (requires Docker)

Use `npm run lint` cautiously: the configured script includes `--fix` and modifies files.

## Keep changes reviewable

- Make the smallest change that solves the request. Do not fold in unrelated
  refactors, cleanup, migrations, or new abstractions unless they are needed to
  make that change safe or possible.
- Keep work easy to review. Split independently understandable changes at a
  meaningful boundary; if a larger change must stay together, explain why.
- Match verification to the risk and changed behavior. Start with the narrowest
  meaningful check; run broader checks when a cross-tree contract, build path,
  or deployable behavior is affected. Say which relevant checks were not run.
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

## Agent skills

### Issue tracker

Issues and specs for the public web tier live as GitHub issues in
`CSUWangj/cryptography-learning`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use the default label strings. See
`docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository: use `CONTEXT.md` and `docs/adr/` at the repository root.
See `docs/agents/domain.md`.
