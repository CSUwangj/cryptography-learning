# Requirement authority and complexity

Correctness means satisfying authorized behavior within the documented operating and threat
models. Optimize next for the fewest concepts and mechanisms, then legibility and reviewability,
then the least code and operational burden. Additional robustness is last and requires authority.
The repository defaults are recorded in
[`docs/adr/0005-use-an-operator-managed-high-tolerance-operating-model.md`](../adr/0005-use-an-operator-managed-high-tolerance-operating-model.md).

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

Chat alone is not requirement authority. Persist repository-wide agent rules in `AGENTS.md`,
operating and threat assumptions in the repository-wide ADR, architectural choices in an ADR, and
task-specific requirements or approved exceptions in the GitHub issue before specification or
implementation continues. If the authoritative artifact cannot be updated, stop and identify
what must be recorded. Purely local, reversible implementation choices need no separate policy
record.

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
