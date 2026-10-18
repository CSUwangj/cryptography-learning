---
name: ticket-loop
description: Coordinate one approved cryptography-learning ticket through implementation, independent review and fixes, ending with staged changes and verifiable evidence. Use when asked to execute or resume a single-ticket implementation/review loop.
---

# Ticket loop

Act as coordinator for one authorized ticket. Use separate implementation and
review agents, sequentially, resuming them across fix rounds. Select their
models explicitly with the maintainer before delegation. This workflow grants
no new permission to change requirements, publish tracker updates, commit,
push, merge, close issues, or start another ticket.

Read repository `AGENTS.md`, applicable subtree guidance, and
[review-handoff.md](../../../docs/agents/review-handoff.md). That document owns
the handoff commands and review format. Follow
[issue-tracker.md](../../../docs/agents/issue-tracker.md) to read the approved
issue and its linked decisions.

## Select models before delegation

Require explicit maintainer selections for implementation and review before
launching either role. Reuse selections already approved for this ticket or an
explicitly approved reusable role mapping; do not ask again each repair round.
If either selection is missing, ask once for the missing role assignments.
Read-only preparation may continue while waiting; implementation may not.

Record each role's provider, exact model selector, and execution route/platform
in the execution note. Record reasoning effort when the platform exposes it;
obtain the maintainer's choice of a level or its model default. The coordinator
is the current session; record its identity only as exposed by the runtime,
otherwise mark it unknown. A config file is a configured choice, not proof of
the model actually serving a session.

Use this format when collecting choices; these placeholders are not defaults:

```text
Implementation: provider=...; model=...; runner/platform=...; effort=...
Review: provider=...; model=...; runner/platform=...; effort=...
```

The same model may fill both roles with independent contexts. An explicit
maintainer choice to inherit the current session is valid; implicit inheritance,
automatic model selection and silent provider/model substitution are not.
Pass the selected model through the platform's supported dispatch mechanism;
writing a model name in an agent prompt does not select the serving model.
Record the actual dispatch selection and any runtime identity the platform
exposes, keeping unverified identity explicit.

Role selections may name different providers or platforms. Check the available
local tools/configuration before promising automatic cross-provider dispatch;
this skill does not supply a gateway or assume that one platform can control
another. If the requested route is unavailable, stop before that role and
provide a concrete handoff for the maintainer's chosen external runner, or ask
for an available alternative. Do not self-review as a substitute. Model/route
changes require a new selection; prior approval remains valid otherwise.

## Prepare the execution boundary

1. Confirm the user authorized implementation of this ticket and its dependencies
   and human checkpoints are satisfied. A request for a plan or review alone
   does not authorize implementation. Use the approved issue as authority;
   historical drafts and prototypes are subordinate context.
2. Choose one checkout and base SHA. Prefer the current checkout when clean.
   If unrelated work requires isolation, prepare the worktree before editing;
   resolve permission failures through the host's approval mechanism. Keep
   implementation, checks and review in that checkout through delivery. Do not
   silently fall back to another checkout and later copy partially tested work
   back. Preserve and classify existing unrelated changes.
3. Write a short English execution note outside the checkout. For each acceptance
   criterion, link its source and identify the public entry point, expected
   result and check. For an error-prone restriction, name the constrained object
   and scope, an allowed example, a rejected example, and the exact authoritative
   source. Use the boundary format in review-handoff.md; examples must distinguish
   plausible wrong interpretations, not just confirm the implementation.
   Record reuse points, likely files, non-goals, accepted risks and check names.
   File guidance may expand to
   necessary callers/tests within the same requirement; explain such expansion.
4. Resolve ordinary implementation choices yourself: fixture IDs, internal names,
   localized wording following existing style, and minimal diagnostic details.
   Ask the maintainer only for the decision branches required by AGENTS.md or
   genuinely missing authorization. State the conflicting sources and the
   smallest decision needed. Record approved requirement changes in the proper
   authority before dependent work; obtain publication permission if absent.

Proceed once the note covers the ticket and no blocking product decision
remains. The note is an execution aid, not a second specification. Do not ask
for another approval merely because planning has finished.

## Implement and capture

Send the implementer the checkout, base, issue, execution note and applicable
guidance. Give this brief:

> Implement only this ticket using the named existing interfaces. Prove the
> observable acceptance criteria and identified counterexamples. Documentation
> examples must run using the files actually shown. Ordinary local choices are
> yours; return requirement conflicts or scope expansion to the coordinator.
> Stage the completed ticket files, record finding dispositions and evidence
> limits in the notes, and use review_handoff.py to create and check the packet.
> Run the planned checks through the capture command. Deliver the actual packet
> path and stop editing so another agent can review this snapshot.

The coordinator verifies the packet exists and `verify` passes before launching
review. Return missing files, unstaged fixes, or stale evidence directly to the
implementer. An invalid handoff is a delivery problem, not a code finding.
Escalate unresolved permission/environment problems rather than treating checks
without completed results as passed. Only the implementer edits production
files; do not run review concurrently with implementation.

## Review and converge

Give a fresh reviewer the approved issue/decisions, repo guidance and packet;
do not pre-supply the implementer's preferred conclusion. Give this brief:

> Verify the packet, then independently establish expected behavior from the
> approved issue and linked decisions before inspecting the implementation.
> Check the note's constrained objects and allowed/rejected examples against
> those sources, including superseding decisions. Tests and earlier reviews do
> not establish requirement authority. Then inspect the exact diff and connected code.
> Assess acceptance coverage and credible regressions through public behavior.
> Reproduce key cases; the implementation summary is an index, not evidence.
> Keep the reviewed checkout, tests and requirements unchanged. Temporary probes
> belong outside the checkout. Report in review-handoff.md's format with stable
> finding IDs. Every blocker needs an authorized requirement or concrete defect,
> a location, and evidence. Keep preferences and extra robustness non-blocking.
> Report verification limits separately; verify the snapshot again at the end.

Handle the report without asking the maintainer to relay it:

- Before forwarding any blocker, the coordinator checks its cited authority,
  scope and counterexample against the current decision. Record that assessment
  under its finding ID in the existing notes. An unsupported interpretation goes
  back to the reviewer for correction; a requirement conflict goes to the maintainer.
- Confirmed clear defect: send the finding to the implementer without another
  approval for the smallest fix and relevant regression proof. Create a new
  packet after edits, then resume the
  reviewer to recheck the finding and affected behavior. Preserve IDs.
- Factual disagreement: inspect the cited code or run the smallest counterexample.
  Return the evidence to the agents; do not change acceptance criteria to settle
  the dispute. A new blocker needs the same evidence as the original findings.
- Requirement conflict, new behavior or an approval-required mechanism: pause
  that branch and request the maintainer's decision with source citations.
- Optional suggestion: leave it non-blocking and unimplemented unless separately
  authorized. Do not manufacture findings or require a quota to justify review.

Stop and report when the same finding returns after a repair without new evidence
or progress; do not repeat the same repair/review attempt indefinitely. New
evidence can justify continuing within the ticket. The reviewer may return pass
while verification is incomplete; that is not completed delivery.

## Deliver

Finish when the current packet passes `verify --require-passed`,
acceptance evidence covers the ticket, including source-checked allowed/rejected
examples and justified unaffected evidence,
no blockers remain, and required human decisions are recorded. An explicitly
accepted verification gap must be recorded under repository authority; otherwise
report blocked/incomplete rather than implying completion.

Deliver the staged file list, base, packet path, final finding dispositions,
verification status and limitations, plus the repository's Change Manifest.
Identify excluded changes and any preserved scratch checkout. The maintainer
owns committing; leave a clear ticket-specific staging boundary and stop here.
