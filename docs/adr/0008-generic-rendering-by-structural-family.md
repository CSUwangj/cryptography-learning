# Generic rendering by structural family

## Status

Accepted; implemented for the public v1.2 SPN path. Scope is governed by
[#95](https://github.com/CSUWangj/cryptography-learning/issues/95), its corrections
to immutable draft `96631d8ac347fa5ec83a621d32359a1821becb88`, and the
[October 31, 2026 first-real-page approval](https://github.com/CSUWangj/cryptography-learning/issues/109#issuecomment-6547518614).
The [migration guide](../MIGRATION-v2.md) describes authoring; the
[delivery map](../v1.2-delivery-evidence.md) separates source/test coverage,
historical runs and outstanding verification. This status records the architectural
and product decisions, not a claim that every historical or current check passed.

## Context

Lessons need to compose cryptographic operations without adding a renderer for
each algorithm. ADR 0006 already establishes shared semantic presentation. V2
extends that boundary with resolved bit widths, primitive-declared structural
dependencies and explicit teaching annotations. ADR 0007 remains the legacy v1
presentation contract; this decision does not retire or rewrite it.

## Decision

Lesson schema v2 composes registered Cryptographic Primitives and presents their
execution by structural family. The implemented family is `spn-cipher`; an
algorithm or variant supplies labels, not renderer dispatch. Node roles, rounds,
schedule iterations and authored grouping describe the trace without encoding
an algorithm in node names. Cipher teaching rows follow a supported dependency
chain and key-consumption order, not declaration order or ascending round number.
An unsupported teaching order receives a diagnostic; raw execution remains separate.

Primitives declare output-type inference where needed and structural bit
dependencies. Compilation checks structure before sorting, resolves actual widths
in dependency order, and maps projections into lineage. Exact logical MSB-first
projection and concat work across non-byte-aligned values and Step bindings,
without changing `BitsValue` or v1 packing. Tables resolve operation parameters;
trace parameters retain named table references. Each v2 operation has one output
port; a graph may have multiple output nodes and exported values.

V2 emits one immutable event per supported operation node, including sources.
Presentation consumes retained execution values and main-thread compiled lineage,
without rerunning a graph. Lineage is not serialized in worker messages or
snapshots; the existing worker recompiles the authored graph. Truncation retains
available rows and omits relationships whose endpoints are absent.

Selecting a unit starts from all its bits. Traversal follows actual dependencies;
highlighting a containing unit does not add its other bits or an ancestor's other
descendants. This is the corrected [Q4 decision](https://github.com/CSUWangj/cryptography-learning/issues/94#issuecomment-6145003226),
superseding traversal over aggregated unit edges in the original draft. Display
edges aggregate by group pair. Cipher and schedule each have one independent
view-wide common-divisor control, defaulting to 1. Authored `unit` boundaries
remain independent of active selection size. Units of at least four bits show
full-width hexadecimal; smaller units show binary. The later
[grouped-inspection correction](https://github.com/CSUWangj/cryptography-learning/issues/109#issuecomment-6532940081)
removes fractions, exact related-position lists and detail panels from this UI,
while retaining exact underlying traversal and accessible source identity.

Key expansion remains a composition of primitives, inspectable independently
with complete state rows, selection and lineage through `spn-cipher` with
`mode: key-expansion`. A cipher explicitly requests `overlay: true`; ordinary
cross-Step round-key bindings identify one schedule and equal-width anchor
pairs. No node-name convention identifies anchors. The toggleable complete
schedule covers cipher bit controls and aligns keys to AddRoundKey operation rows.
Decryption reverses consumption blocks, preserves internal generation order and
source identities, avoids shared-batch duplication, and retains an expandable
original-order value table. Selection crosses corresponding anchor bits without
cross-view edge drawing. Padding exists only while open.

Opening/closing through the toolbar or a bound row preserves the shared exact
origin and both unit sizes. An actual granularity change clears origin while
retaining visibility.
Direction changes, replacement execution and Lesson re-entry clear origin, close
the lane and reset sizes. Locale/resize and active-size re-click preserve state.
The [independent-control correction](https://github.com/CSUWangj/cryptography-learning/issues/109#issuecomment-6527372103),
[alignment/toggle/named-unit correction](https://github.com/CSUWangj/cryptography-learning/issues/109#issuecomment-6542066925)
and [restored bold headings/generic bound-row controls](https://github.com/CSUWangj/cryptography-learning/issues/109#issuecomment-6542738836)
govern the current presentation. The last correction supersedes heading-weight
and row-control-removal clauses in the preceding record. Both the toolbar and
generic bound-row controls toggle the complete schedule; outside content fades.
Their actions follow global visibility, without per-key opener state or filtering.

V1 remains supported throughout v1.2 with a tooling deprecation notice. Explicit
v2 and omitted version use v2. The initial #96 migration-guide URL remains valid.
V1 retirement requires separate later-version work; no timetable or automatic
content conversion is defined. Public synthetic content stays here; private
content auditing and migration belong to the maintainer's private repository.

## Consequences and alternatives

Primitive authors own inference and dependency declarations; the compiler owns
resolved lineage and presentation validation. This replaces repeated algorithm
layout rules with shared structural rules, at the cost of maintaining v1/v2
compiler paths and manually converting content. Existing registered operation
ports and v1 execution semantics remain intact; dynamic v2 inference is not a
promise to backport every new operation to frozen v1 inference.

Algorithm-specific renderers and runtime inference from node names would repeat
semantic logic and prevent arbitrary supported compositions. A universal renderer
with algorithm switches would keep that coupling. Execution traces therefore
carry operation identity/annotations and values; compiled presentation data owns
layout and lineage. Reuse the existing compiler, Lesson session/worker,
RenderHost and shared Learning components. No new engine or dynamic operation
loader follows from this decision.

V2 comparison, avalanche and dedicated classical presentations remain unsupported;
existing v1 consumers continue under ADR 0006/0007, including the classical
symbol-mapping exception. Registered classical operations can execute in raw v2
graphs. Additional structural families, themes, private migration and infrastructure
are outside this decision. [#67](https://github.com/CSUWangj/cryptography-learning/issues/67)
owns key-change comparison: its view-local selection differs from this
single-execution overlay's cross-anchor tracing. This work does not implement or
close it. Manual recovery remains correcting authored documents and reloading or
rerunning under existing execution limits.

## Implementation and evidence

The original Tickets 1-9 are reconciled in the delivery map. #96/#97 deliver the
versioned executable path; #98/#99/#105 the composable calculations;
#106-#109 standalone/cipher/overlay integration and human acceptance; #110-#113
remaining public demos and coexistence; #114 finalizes documentation and the
acceptance map. P0 records product/prototype decisions, not production architecture
or proof. P1's independent title/navigation path is mapped there too. Historical
failures and current verification gaps remain visible; ticket closure alone is
not a test result or a replacement for the #109 human decision.
