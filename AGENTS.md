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

Run the smallest checks that cover the change, and report any checks not run:

- Backend or schema: `cd backend && cargo test --locked -- --nocapture`
- Frontend: use `frontend/.nvmrc`, then `cd frontend && npm ci && npm run typecheck && npm test -- --maxWorkers=1 && npm run build`
- Deployable behavior: `./baseline/run.sh` (requires Docker)

Register every applicable issue and repository check before final verification;
unrun checks remain `not-run`. Inspect `python3 scripts/test_plan.py local --repo .`
to select immediate checks; the handoff and push workflow share this mapping.
Broad frontend configuration changes can select the full Vitest suite, while
feature changes use the selected tests. Documentation-only changes use relevant
documentation checks. The helper's concrete path coverage and commands are in
[`docs/agents/review-handoff.md`](docs/agents/review-handoff.md).

Keep each acceptance check's command and working directory fixed across attempts.
Record changed test selections or parallelism as separate diagnostic evidence;
preserve earlier failures when a later attempt passes. Run heavyweight checks
sequentially and record tool versions, worker count and permission context.
Use controlled base/target comparisons to investigate uncertain failures, with
the evidence limits and stopping conditions in `ticket-loop`.

Use `npm run lint` cautiously: the configured script includes `--fix` and modifies files.

Before executing a phase spec, handing work to another agent or CLI, or reviewing
an implementation diff, read
[`docs/agents/review-handoff.md`](docs/agents/review-handoff.md).
Its review report format does not apply to grilling or specification sessions.

For an authorized single-ticket implementation/review loop, use
[ticket-loop](.agents/skills/ticket-loop/SKILL.md) and
[`scripts/review_handoff.py`](scripts/review_handoff.py) to pin the review
snapshot and capture check results. Use the skill's maintainer-approved reusable
mapping for the actual coordinating main session, implementation, requirements
review, pre-review, independent formal review and escalation diagnosis.
For behavior-changing tickets, the selected formal-review model must review the
approved ticket, acceptance criteria, repository contracts, non-goals and execution note
for conflicts, omissions or invented requirements. Record its verdict and open
questions before dispatching implementation. The review may identify ambiguity;
only the maintainer resolves product requirements, and the model must not choose
new requirements or an implementation design on the maintainer's behalf.
Record each role's model, effort and execution route; reuse approved private
provider selections and ask only for missing choices or changes. Never use
implicit host defaults.
Delegate within that ticket and resolve clear defects without another approval.
Within this loop, the coordinator may choose existing public test interfaces
and record their coverage and limits without another maintainer confirmation.
The coordinator owns routine validation and evidence capture, directly or
through the assigned implementer, using existing tools and normal permissions.
Use completion notifications or bounded waits and read relevant log changes;
do not add a review-model supervisor polling a delegated coordinator or a general runner.
Escalate both stalled repairs and repeated counterexamples to the same authorized
rule after two repair rounds, as defined in the skill. First distinguish ambiguous
requirements from implementation failures and unavailable evidence. Requirement
conflicts, scope expansion and permission blocks go to the maintainer; confirmed
implementation failures may use the selected review model for diagnosis and
repair under the skill's escalation rule, followed by review independent of
diagnosis and repair. Escalate continued failure after that intervention to the
maintainer. A review pass and completed verification are separate gates. Record
both formal-review axes and finding dispositions against the handoff snapshot;
pending or disputed reviews and unresolved findings block delivery. Check both
gates with `verify --require-passed --require-reviewed` before staged delivery.
The helper checks recorded evidence, not review correctness or independence.
Committing and starting another ticket remain maintainer decisions.

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

## Requirement authority and complexity

Correctness means satisfying authorized behavior within the documented operating and threat
models. Optimize next for the fewest concepts and mechanisms, then legibility and reviewability,
then the least code and operational burden. Additional robustness is last and requires authority.
The repository defaults are recorded in
`docs/adr/0005-use-an-operator-managed-high-tolerance-operating-model.md`.

Agents may infer only behavior logically necessary for an explicit requirement, existing
repository contracts and decisions, ordinary correctness within the recorded models, and narrow
security measures needed to enforce those models. Do not strengthen requirements from generic
best practice, production readiness, hypothetical scale or attackers, rare failures, portability,
or anticipated future needs.

Before proposing such a strengthened guarantee, state all of the following and wait for explicit
maintainer approval:

- the proposed requirement and which of the grounds above motivates it;
- the concrete scenario and one specific example of failure or harm;
- whether everything needed to decide is known now;
- the conceptual, implementation, maintenance, and operational costs; and
- the simpler alternative and the risk it leaves accepted.

If relevant facts are unknown, identify them and stop that decision branch. Do not assume them,
start unrequested research, or defer discovery until implementation. The maintainer must
explicitly invoke a research session before that branch continues.

Explicit approval is required before introducing or materially expanding retries, queues,
background work, schedulers, reconciliation, caches, replicas, speculative batching or pooling,
new locks or leases, distributed coordination, idempotency machinery, crash-durability sync,
journaling, automated recovery or rollback, fault-injection frameworks, portability layers,
generalized abstractions or extension points, dependency-injection frameworks, redundancy,
self-healing, zero-downtime machinery, proactive migrations, feature flags, or other
future-proofing infrastructure. Approval is also required to rely on an experimental, unstable,
poorly documented, unusually difficult-to-use, or difficult-to-operate mechanism, even if it is
already present; existing use does not authorize expansion.

Block for the maintainer when a choice would add a non-functional guarantee, use one of those
mechanisms, change a recorded model or decision, make a difficult-to-reverse product choice,
resolve conflicting authorities, or depend on research. Otherwise choose the simplest option
consistent with authorized requirements, state any material assumption, and continue.

Chat alone is not requirement authority. Persist repository-wide agent rules here, operating and
threat assumptions in the repository-wide ADR, architectural choices in an ADR, and task-specific
requirements or approved exceptions in the GitHub issue before specification or implementation
continues. If the authoritative artifact cannot be updated, stop and identify what must be
recorded. Purely local, reversible implementation choices need no separate policy record.

Specifications should follow `docs/agents/spec-template.md`. Grouped provenance is sufficient,
but every acceptance criterion must trace to a maintainer-approved issue requirement, a cited
repository contract or decision, a stated necessary consequence, or a recorded approved
exception. Agent judgment, reviewer preference, and generic best practice are not requirement
sources. Spec-to-ticket transformations must preserve provenance, non-goals, accepted risks,
manual recovery, and approved exceptions; they must surface gaps instead of inventing or
strengthening requirements.

During review, block only for an unmet authorized requirement, a violated repository contract or
decision, a concrete correctness or security defect within the recorded models, unsupported
complexity, or a credible regression in promised behavior. Missing unrequested robustness is not
a defect. An optional robustness idea must be labeled non-blocking and include the same scenario,
example, evidence status, costs, and simpler alternative.

A security finding may block without ticket-specific wording when it identifies the protected
asset and trust boundary, uses attacker capabilities already in the threat model, gives a concrete
attack example, cites the violated contract or invariant, and recommends the smallest adequate
mitigation. A concern outside that model is a proposed scope expansion; uncertainty requires an
explicitly invoked research session.

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
