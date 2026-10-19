# Lesson Schema v2 Migration Guide

This guide describes the v2 behavior delivered through T05. V1 lessons remain
supported during the migration period.

## Version selection

Use `version: 2` for a v2 Lesson. A missing `version` also selects v2. Existing
Lessons with `version: 1` continue through the v1 compiler and produce the
`lesson.schema-v1-deprecated` compilation notice. Unsupported versions fail
with `lesson.unsupported-version`.

V1 and v2 features cannot be mixed. V1 presentation and trace-level fields are
not accepted in v2; v2 node annotations are not accepted in v1.

## Minimal v2 graph

The current v2 slice supports source, XOR, output, and `core.concat@1` operations. A graph may have
multiple single-port output nodes and export multiple values. Nodes may carry
teaching annotations which are retained in the execution trace:

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

## Projected composition

The public compiler and existing Lesson Worker also support a non-byte-aligned
value crossing a Step boundary. This runnable fragment projects bits 1..3 from
`left`, concatenates them with `right`, and binds the resulting five-bit output
into the next graph:

```yaml
inputs:
  left: {type: {family: bits, size: 5}, encoding: hex, default: "0x15"}
  right: {type: {family: bits, size: 2}, encoding: hex, default: "0x2"}
graphs:
  compose:
    nodes:
      - {id: left, operation: core.source@1, parameters: {type: {family: bits, size: 5}}}
      - {id: right, operation: core.source@1, parameters: {type: {family: bits, size: 2}}}
      - {id: joined, operation: core.concat@1, inputs: {left: {node: left, port: value, bits: [1, 3]}, right: {node: right, port: value}}}
    outputs: [{node: joined, port: value}]
  consume:
    nodes:
      - {id: value, operation: core.source@1, parameters: {type: {family: bits, size: 5}}}
    outputs: [{node: value, port: value}]
steps:
  - id: compose
    execute: {graph: compose, bindings: {left.value: {input: left}, right.value: {input: right}}}
  - id: consume
    execute: {graph: consume, bindings: {value.value: {step: compose, output: joined.value}}}
```

The composed output is the literal five-bit value `01010` (`0x0a`).

Each v2 operation has exactly one output port. The existing worker/session
executes the graph and the default trace renders one immutable event per
operation node, including sources. Existing execution limits and dry-run
validation remain in force.

## Migration boundary

Inputs may project exact MSB-first ranges with `bits: [start, length]`; ranges
must be non-empty and in bounds. `core.concat@1` concatenates exact bit values,
including non-byte-aligned values. Its output width is the sum of both inputs.

Top-level table constants use `kind: table`, `entryBits`, and `value`. They are
only operation parameters: execution receives their entries, while v2 trace
parameters retain `{constant: name}` and tables cannot be Step bindings or
runtime constants. The compiled main-thread graph exposes structural lineage;
worker messages and snapshots do not carry it because the worker recompiles the
authored graph.

Selectable units, overlays, and comparison presentations belong to later tickets.
Algorithm-specific renderer dispatch is excluded. Authors should keep v1
declarations until the relevant v2 capability is available.

To validate a Lesson, run the existing validation command or call
`validateLessonDocuments`. Fix authored YAML diagnostics, then rerun the same
workflow. No automatic conversion is provided.
