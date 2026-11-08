---
name: ticket-loop
description: Execute or resume one approved ticket through requirements review, implementation/TDD, applicable pre-review, independent formal review and fixes, ending with staged changes and verifiable evidence.
---

# Ticket loop

Coordinate one authorized ticket. Read repository and applicable subtree
`AGENTS.md`, [review-handoff.md](../../../docs/agents/review-handoff.md), and
the approved issue/decisions using [issue-tracker.md](../../../docs/agents/issue-tracker.md).
The handoff document owns snapshot commands and review reporting. This workflow
does not authorize tracker writes, commits, pushes, merges or another ticket.

When preparing an invocation prompt, include only the ticket, authorization,
and per-run overrides or experiment variant. Read reusable workflow rules here
and acceptance criteria from their authoritative sources instead of copying them.

## Route the skills

Resolve these installed skills once and record their actual `SKILL.md` paths in
the execution note. Give each role only its applicable skills and references;
read their instructions, using file reads when the host has no Skill tool.
Search installed skills if a named skill is absent from discovery. If a required
skill remains unavailable, stop before the affected stage and identify it;
do not silently substitute another version or install new tooling.

| Role | Instructions |
| --- | --- |
| Coordinator | This skill; run `code-review` for each code-review stage |
| Implementer | `implement`; `tdd` for executable behavior changes and non-trivial logic |
| Pre-review and formal review | `code-review`, with independent Standards and Spec contexts |
| All roles | Repository [caveman](../caveman/SKILL.md) at **lite**; plugin `ponytail:ponytail` at **full** |

Use the discovered plugin source for Ponytail, not the separate unnamespaced
copy. Record the resolved source rather than hard-coding a machine's cache path.
These are the maintainer-approved overrides within this loop:

- `implement` is the implementation-stage reference, including when its host
  permits only manual invocation. At its review step, return control to the
  coordinator, who runs `code-review`; stage instead of executing its commit step.
- The coordinator selects existing public test interfaces and records what each
  proves and misses. This satisfies the TDD seam gate without another question.
  Requirement conflicts, scope expansion and approval-required interface choices
  still need the maintainer. Expected results come from sources, not current code.
- `code-review` uses the packet's exact staged diff and explicit issue/decisions,
  not its default committed-range discovery. Preserve both axes in the repository
  report format. Smell heuristics are non-blocking unless an authorized contract
  or concrete defect justifies a blocker; they do not authorize extra refactoring.
- Caveman compresses communication, never requirements, negations, evidence or
  necessary progress updates. Persisted records remain normal English prose.
  Ponytail minimizes the complete solution, not acceptance scope or required checks.

Pass these overrides with the skill paths to each delegated role; do not rely
on a child or external runner inheriting the coordinator's context.

Behavior-changing tickets normally use requirements review, implementation/TDD,
pre-review, then formal review. Only tickets admitted to the
[bounded trial](#bounded-three-ticket-review-trial) omit the separate pre-review
stage. Requirements review is separate from the applicable code-review stages
and does not replace them.
Pure documentation, comments or formatting use relevant checks and formal review,
without pre-review or artificial red tests. Classify by effects: configuration,
workflow policy, data and executable examples that change behavior take the
behavior-changing path.

## Bounded three-ticket review trial

[#139](https://github.com/CSUwangj/cryptography-learning/issues/139) authorizes a
temporary exception for three explicitly identified small, clearly scoped local
behavior-change tickets after #136, #137, #138 and delivery of these rules are
complete. Before a ticket uses the exception, record its ID on #139 and its
qualification and exception use in the owning ticket. Ordinary implementation
authorization and repository constraints still apply.

Exclude GraphQL or Lesson schema changes, compatibility changes, security
boundaries, evidence tooling, verification-policy changes and changes to the
trial's own gates. #139 itself uses the ordinary full path, including requirements
review and independent two-axis pre-review and formal review. Its policy prose
uses meaningful source-backed walkthroughs, never an artificial red test.

Eligible tickets omit only the separate two-axis pre-review stage. Preserve
requirements review, meaningful behavior tests, independent formal Standards and
Spec reviews, unresolved-finding handling, required checks, snapshot evidence and
completion gates. Formal reviewers establish expected behavior from approved
sources before reading implementation conclusions.

Record new contract ambiguity or expanded impact and return affected work to the
ordinary full process. Resolve requirement decisions under the existing authority
rules and retain findings, evidence and the ticket's used trial slot. Fallback
does not permit an automatic replacement or fourth trial ticket. The trial cannot
amend its own gates or weaken failed checks.

Use existing records for each real outcome, including review rounds, confirmed
findings first discovered in formal review, repair rounds and available execution,
time and cost evidence. Compare relevant ordinary-flow records and state ticket
complexity and environment differences. Unknown measurements remain unknown;
fewer reviews do not prove unchanged quality.

After the three real outcomes, stop the exception pending the maintainer's
recorded continue, adjust or withdraw decision. There is no automatic permanent
rollout. Rule delivery alone is partial; keep #139 open until all three results
and that decision are recorded. Do not launch unrelated tickets to fill the sample.

## Select models before delegation

Resolve these two maintainer-selected configurations before launching roles. Reuse
the approved mapping below or explicit ticket selections; ask only for missing
choices or changes. Read-only preparation may continue while waiting;
implementation may not.

Provider choices are private execution configuration. Reuse explicit maintainer
selections from the current session or a private handoff outside the checkout;
ask if missing. Host configuration alone does not authorize a provider. Record
the resolved configurations below only in private execution notes; redact provider
details from repository files and published issue/PR records, including excerpts.

```text
Implementation: provider=...; model=...; runner/platform=...; effort=...
Formal review: provider=...; model=...; runner/platform=...; effort=...
```

The maintainer-approved reusable model and route selection is:

| Configuration | Model | Effort | Execution route |
| --- | --- | --- | --- |
| Implementation | `gpt-6.1-sol` | high | Local Codex CLI for implementation and pre-review |
| Formal review | `gpt-6.1-sol` | max | Host subagents with explicit selectors and the privately selected provider |

The coordinator uses Implementation's provider/model/effort in the actual
maintainer-started main session; record that session's runner separately. A
different main-session selection needs an explicit maintainer override or a
handoff to the selected session. This skill cannot switch its own runtime model;
do not create a review-model supervisor that polls a delegated coordinator.

Record reasoning effort when exposed, including an explicit choice of model
default for a new selection. The role mapping is:

- Coordination, implementation and both pre-review axes use **Implementation**
  in separate contexts; pre-review and implementation never share a context.
- Requirements review, both formal-review axes, escalation diagnosis and an authorized escalated
  repair use **Formal review**.
- The maintainer may separately override pre-review. This mapping is explicit
  authorization, not implicit inheritance from host configuration.

Pass the selected configuration to every dispatch, including axis agents.
Writing a model name in a prompt does not select it. Record dispatch choices and
runtime identity separately; if actual identity is unavailable, mark it unknown.
The coordinator is the current session; a config file is not proof of its identity.
The same model may serve different roles in independent contexts. Explicitly
choosing the current session's model is valid; silently inheriting it is not.

Check both implementation and formal-review route support before implementation;
a selectable main-session model does not prove subagent availability or provider
selection. Treat platform permission review as a separate host capability, not
the formal code reviewer. If a route is unavailable, stop before that role and
provide a concrete external handoff or ask for an available route.
No gateway, silent substitute or self-review.
Other model/route changes need a new selection; the escalation mapping above does not.

## Coordinate with existing tools

Prefer completion notifications when the host supports them. For external CLI
work, use existing process waits in 30–60 second windows, bounded by the host's
limits. Avoid repeated one-second polls and unchanged log reads. Keep full logs
on disk; read new status or relevant excerpts for a failure, requested update or
completed handoff. Preserve meaningful progress updates without replaying logs.
Reuse the selected implementation/review contexts for ordinary repair and
recheck rounds.
Use existing tools and `review_handoff.py`; do not add a general runner, scheduler
or automatic retry/fallback layer. Provider disconnects and permission-service
errors belong to the environment branch below, not the defect count.

When a check stalls, inspect its blocking child processes and owned resources
before retrying. Successful output does not prove process completion. Preserve
timeout and exit evidence; any lifecycle repair still needs to be within scope.

## Prepare the execution boundary

1. Confirm implementation is authorized and dependencies/human checkpoints are
   satisfied. Planning or review alone does not authorize implementation.
2. Choose one checkout and base SHA. Prefer the current checkout when clean;
   otherwise prepare isolation before editing. Preserve and classify unrelated
   work. Keep implementation, checks and review there through staged delivery;
   do not copy partially verified work between checkouts after a permission failure.
3. Write a short English execution note outside the checkout. Map each criterion
   to its authoritative source, public entry point, expected result and check.
   For a restriction that is easy to misread, use the specification template's
   [constrained-object and example format](../../../docs/agents/spec-template.md#restrictions-that-are-easy-to-misread).
   Record test interfaces/coverage limits, reuse points, likely files, non-goals,
   accepted risks, selected skill paths/model mapping and every applicable issue
   and repository check, including full suites and currently unavailable checks.
4. Resolve ordinary local choices directly. For an unresolved requirement, cite
   the conflicting or missing sources and ask for the smallest decision. Persist
   approved changes in the proper authority before dependent work; obtain tracker
   publication permission if absent. An execution note is not a second specification.
5. For behavior-changing tickets, use the selected Formal review model for a
   requirements review. Establish expected behavior from the approved ticket,
   linked decisions and repository contracts before reading the execution note
   or implementation conclusions. Check acceptance criteria, non-goals and the
   note for conflicts, omissions and invented requirements. Passing tests and
   reviewer agreement are not requirement authority. Record the verdict and open
   questions in the note before dispatching implementation.
   The reviewer identifies ambiguity; only the maintainer resolves product
   requirements. The reviewer does not add requirements or choose the
   implementation design. This is a requirements review, not a `code-review` run
   against an implementation diff.

Proceed when the note covers the ticket and no blocking decision remains.
Do not ask for another approval just because preparation has finished.

## Implement and capture

Give the implementer the checkout, base, issue, note and its selected skill paths.
Before development checks, and as each new file category is introduced, follow
the handoff guide's [development preview](../../../docs/agents/review-handoff.md#preview-checks-during-development).
For executable behavior changes, use one source-backed failing behavior test
followed by the smallest implementation per cycle. A launch, import or environment failure
is not a red behavior test. An already-passing case is existing coverage; record
it honestly and target a missing behavior rather than fabricating a failure.
Use existing test tools and agreed public interfaces, without speculative test
architecture. Run documentation examples using the files actually shown.

The coordinator using Implementation owns routine validation
and evidence capture, running checks directly or assigning them to the implementer.
This includes the ticket's focused/full tests, typecheck, install/build, guide
examples and browser checks where applicable; these are not reserved for Formal review.
Use the host's normal permission flow for blocked commands. Assignment cannot
grant permissions or turn an unavailable check into a pass. Schedule dependency
installation outside review and browser runs so it cannot mutate their environment.

When implementation is ready, follow the handoff guide's
[staged capture and check execution](../../../docs/agents/review-handoff.md#capture-a-staged-handoff)
before review.
Only the currently assigned implementer edits ticket files. The coordinator
confirms delivery is finished, the packet exists and `verify` passes before any
review. Return missing files, unstaged fixes or stale evidence as delivery
problems, not code findings.

Before formal review, prepare the candidate under those same snapshot and
check-evidence rules.

## Diagnose uncertain check failures

When check causality is unclear, follow the handoff guide's
[failure diagnosis](../../../docs/agents/review-handoff.md#diagnose-uncertain-check-failures)
and [verification scope and stopping](../../../docs/agents/review-handoff.md#verification-scope-and-stopping) rules.

## Review and converge

By default, the coordinator runs `code-review` in two stages for behavior changes:
pre-review, then formal review when no confirmed blockers remain. The
[bounded trial](#bounded-three-ticket-review-trial) omits only pre-review. The
escalation path below may end pre-review early for escalation diagnosis. For each
applicable initial stage, launch separate Standards and Spec agents directly with
that stage's configuration;
no extra review-coordinator agent or recursive review loop. Run the axes in
parallel when slots permit, otherwise sequentially in independent contexts.
Keep implementation stopped throughout review. On repair rounds, resume the
reviewers to check findings and affected behavior; broaden coverage when edits warrant it.

Give reviewers the approved sources, exact packet, applicable guidance and this brief:

> Review only your assigned axis; do not spawn further reviewers. Verify the
> snapshot. Establish expected behavior from current authoritative
> sources before reading the diff or prior conclusions. Check constrained objects
> and allowed/rejected examples; tests and review agreement are not authority.
> Inspect the exact diff and connected code; reproduce key public behavior.
> Leave source, tests and requirements unchanged; temporary probes stay outside
> the checkout. Report stage/axis, source-backed expected and observed behavior,
> location and evidence, using the repository format. Verify the snapshot again
> at the end. Report verification limits separately from the code verdict.

Record each formal axis with the handoff document's `review` command. At dispatch
or restart, mark that axis pending; after return, record the actual verdict and
finding dispositions. An unreturned report stays pending; an unresolved dispute
stays disputed. Pre-review reports cannot supply formal-review entries.

Formal review starts in contexts independent of coordination, implementation,
pre-review and escalation diagnosis, covering the whole ticket, not only surviving
pre-review findings. A pre-review pass is not acceptance. The coordinator
reconciles reports with stable finding
IDs and preserves each axis; handle reports without making the maintainer relay them:

- Validate each blocker's source, scope and counterexample before repair. Return
  unsupported interpretations to the reviewer; record the assessment in the notes.
- Send confirmed defects to the implementer for the smallest fix and regression
  evidence. New packets and affected checks precede re-review.
- Resolve factual disagreement with code/evidence, not model votes or seniority.
  Requirement ambiguity/conflict goes to the maintainer before dependent edits.
- Leave optional suggestions unimplemented without separate authorization.
  Review stops when confirmed blockers are resolved; no finding quota or claim
  of exhausting every possible defect.

Review stage transitions do not require another run of unchanged passing checks.
Use the handoff guide's investigation budget for repair rechecks and record
changes/results against the same source-backed rule across affected paths.
When that budget is exhausted, report the remaining gap before continuing.

## When repairs stall or recur

Apply the verification stopping rule before launching escalation diagnosis or
repair; an escalation threshold is not authorization for more investigation.
Trigger escalation when the same confirmed blocker remains after two consecutive
repair attempts without new evidence or improvement, or fixes repeatedly undo
each other. Also escalate when two repair rounds for the same authorized rule
are followed by another valid counterexample to that rule, even if each round
made partial progress. A new path or finding ID does not reset that count;
unrelated defects do not count toward it. First classify the cause against the
current requirement sources:

- **Requirement ambiguity or conflict:** pause that branch and ask the maintainer
  with sources and distinguishing examples. A stronger model may diagnose the
  ambiguity but cannot decide the missing product requirement or rewrite tests
  to choose an interpretation.
- **Unsupported finding:** withdraw/correct it with evidence; do not change code
  just to make reviewers agree.
- **Unavailable evidence/environment:** report the limitation and use the normal
  permission flow. Do not reinterpret it as a product defect or successful check.
- **Confirmed implementation failure:** use the selected Formal review model for
  one focused diagnosis of the violated rule, connected affected paths and
  source-backed allowed/rejected examples. Give that diagnosis to the original
  implementer for repair and regression evidence. If needed, the selected review
  model may take over repair in a new implementation context under the existing
  escalation mapping; diagnosis does not expand requirements.

Record the diagnosis and any takeover. All fixes remain within approved scope.
Once escalated repairs are verified, proceed to formal review without restarting
the low-cost pre-review loop. Diagnosis alone is not a formal acceptance verdict.
After takeover, assign formal review to other independent contexts, even when
they use the same model; an editing context cannot approve its own work.
If the same failure persists after this intervention without progress, stop and
ask the maintainer. New scope or unresolved requirements always require a decision.

## Deliver

Default completion requires `verify --require-passed --require-reviewed`, acceptance coverage
(including justified unaffected earlier evidence),
no remaining blockers, both formal-review axes completed, and required human
decisions recorded. If the maintainer explicitly accepts a verification gap,
record it under repository authority, use `verify --require-reviewed`, and report that
exception; do not label unavailable or unrun checks as passed. Without that
exception, incomplete evidence means incomplete delivery despite a review pass.

Deliver the staged files, base, current packet, finding dispositions, verification
status/limits and required Change Manifest. Identify excluded work and preserved
scratch checkouts. Keep role/round records in the existing notes; report actual
usage only when exposed, otherwise unknown. Do not infer cost savings from model
labels or create a separate metering system. Stop at staged delivery.
