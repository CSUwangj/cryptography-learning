# Lesson Schema v2 Migration Guide

This guide describes the v2 behavior delivered by T04. V1 lessons remain
supported during the migration period.

## Version selection

Use `version: 2` for a v2 Lesson. A missing `version` also selects v2. Existing
Lessons with `version: 1` continue through the v1 compiler and produce the
`lesson.schema-v1-deprecated` compilation notice. Unsupported versions fail
with `lesson.unsupported-version`.

V1 and v2 features cannot be mixed. V1 presentation and trace-level fields are
not accepted in v2; v2 node annotations are not accepted in v1.

## Minimal v2 graph

The first v2 slice supports a single source/XOR/output execution graph. Nodes
may carry teaching annotations which are retained in the execution trace:

```yaml
version: 2
id: v2-minimal
default_locale: en-US
inputs:
  plaintext: {type: {family: bits, size: 16}, encoding: hex, default: "0x1234"}
constants:
  mask: {type: {family: bits, size: 16}, encoding: hex, value: "0x00ff"}
graphs:
  mix:
    nodes:
      - {id: state, operation: core.source@1, parameters: {type: {family: bits, size: 16}}, role: state, round: 0, unit: 8}
      - {id: mask, operation: core.source@1, parameters: {type: {family: bits, size: 16}}, role: round-key, round: 0, unit: 8}
      - {id: mixed, operation: core.xor@1, inputs: {left: {node: state, port: value}, right: {node: mask, port: value}}, role: state, round: 0, unit: 8}
      - {id: result, operation: core.output@1, inputs: {value: {node: mixed, port: value}}, role: state, round: 0, unit: 8}
    outputs: [{node: result, port: value}]
steps:
  - id: run
    execute:
      graph: mix
      bindings: {state.value: {input: plaintext}, mask.value: {constant: mask}}
```

Pair that `lesson.yaml` with `locales/en-US.yaml` before compiling:

```yaml
title: V2 minimal graph
summary: Execute a source/XOR/output graph.
texts: {}
```

V2 graphs have one output operation. The existing worker/session executes the
graph and the default trace renders one immutable event per operation node,
including sources. Existing execution limits and dry-run validation remain in
force.

## Migration boundary

Projection, concatenation, table parameters, structural lineage, selectable
units, overlays, comparison presentations, and algorithm-specific v2 renderers
belong to later tickets. Authors should keep v1 declarations until the relevant
v2 capability is available.

To validate a Lesson, run the existing validation command or call
`validateLessonDocuments`. Fix authored YAML diagnostics, then rerun the same
workflow. No automatic conversion is provided.
