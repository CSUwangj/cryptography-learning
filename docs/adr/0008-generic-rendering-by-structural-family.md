# Generic rendering by structural family

## Status

Specification; implementation pending. The confirmed scope and phase dependencies
are recorded in [#95](https://github.com/CSUWangj/cryptography-learning/issues/95).
Overlay surface, alignment and decryption layout await the prototype checkpoint
in [#94](https://github.com/CSUWangj/cryptography-learning/issues/94).

## Decision

Lesson schema v2 composes registered cryptographic primitives and presents their
execution by structural family. The initial family is `spn-cipher`; an algorithm
or variant supplies labels, not renderer dispatch. Node roles, rounds, schedule
iterations and selection units describe the trace without encoding an algorithm
in node names. This extends ADR 0006's shared semantic rendering boundary rather
than introducing a renderer or descriptor for each algorithm.

Primitives declare output-type inference where needed and structural bit
dependencies. Compilation resolves actual widths, input projections and lineage.
Presentation consumes those relationships together with immutable execution
values. V2 emits one trace event per supported operation node. Compiled lineage
belongs to presentation and is not transported in worker messages or snapshots;
the existing worker's graph recompilation must be accounted for explicitly.

Selecting a unit starts from its bits. Propagation follows actual bit dependencies;
highlighting a containing unit does not add its other bits to the traversal.
Display-edge aggregation cannot change this meaning. This is the corrected
[Q4 decision](https://github.com/CSUWangj/cryptography-learning/issues/94#issuecomment-6145003226),
superseding traversal over aggregated unit edges in the original stash.

Key expansion remains a composition of primitives, inspectable independently with
complete state rows, unit selection and lineage. A cipher may explicitly request
an overlay derived from its ordinary cross-Step round-key bindings. Equal-width
anchor pairs establish bit correspondence; no node-name convention identifies
anchors. Encryption and decryption may use this capability while preserving source
schedule identities. Its surface, visible alignment target and decryption block
layout remain prototype decisions, not consequences of binding resolution.

V1 remains supported throughout v1.2, with a deprecation notice. Missing version
uses v2 once implemented, following the source draft's recorded default-version
decision and the public fixture audit. V1 retirement requires separate later-version
work. ADR 0007 continues to describe the legacy presentation; this record defines
the v2 direction without declaring the legacy implementation replaced.

## Trade-offs and boundaries

This replaces repeated algorithm-aware layout and runtime lineage inference with
shared presentation rules and primitive-authored dependency functions. It adds
compiler and primitive-author responsibilities and temporarily maintains two
schema paths. Those costs serve the approved composition requirement; they do not
authorize a universal renderer framework or dynamic operation loading.

Reuse existing Lesson execution and Learning components. Do not infer support for
other structural families, automatic content conversion, or v2 comparison from
this decision. [#67](https://github.com/CSUWangj/cryptography-learning/issues/67)
owns key-change comparison; its view-local selection rule is distinct from this
single-execution overlay's cross-anchor bit tracing.

The stashed proposal `96631d8ac347fa5ec83a621d32359a1821becb88` is historical input.
The corrections, complete scope mapping, prototype gate and first-real-page gate
in #95 govern the next specifications and implementation handoff.
