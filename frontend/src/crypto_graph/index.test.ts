import { describe, expect, it } from 'vitest'
import {
  aesCipherGraph,
  aesInverseCipherGraph,
  aesKeyExpansionGraph,
  alphabetPolicy,
  alphabetText,
  bits,
  bytes,
  compile,
  executeWorkerRequest,
  hex,
  integer,
  maxWorkerLimits,
  operationManifests,
  serializeTrace,
  teachingSpnGraph,
  words,
  type AuthoredGraph,
  type TraceEvent,
} from './index'

const source = (id: string, value: ReturnType<typeof bits>) => ({
  id,
  operation: 'core.source@1',
  parameters: { type: value.type, value },
})

const xorGraph = (): AuthoredGraph => ({
  nodes: [
    source('left', bits(16, Uint8Array.of(0x0f, 0x0f))),
    source('right', bits(16, Uint8Array.of(0x00, 0xff))),
    {
      id: 'xor',
      operation: 'core.xor@1',
      inputs: { left: { node: 'left', port: 'value' }, right: { node: 'right', port: 'value' } },
    },
  ],
  outputs: [{ node: 'xor', port: 'value' }],
})

describe('CryptoGraph compile/execute seam (#26)', () => {
  it('publishes source output typing through its declared type parameter', () => {
    expect(operationManifests.find((manifest) => manifest.identity === 'core.source@1')?.outputTypeParameter).toBe('type')
  })

  it('executes fixed-width XOR and preserves leading zeroes in snapshot and trace', () => {
    const compiled = compile(xorGraph())
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) return
    const result = compiled.value.execute()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(hex(result.value.outputs['xor.value'] as ReturnType<typeof bits>)).toBe('0x0ff0')
    expect(result.value.trace).toEqual([
      { path: 'left.value', stage: 'output', summary: 'left.value' },
      { path: 'right.value', stage: 'output', summary: 'right.value' },
      { path: 'xor.value', stage: 'output', summary: 'xor.value' },
    ])
  })

  it('reuses compiled graph with typed execution inputs and owns snapshots', () => {
    const graph: AuthoredGraph = {
      nodes: [
        { id: 'left', operation: 'core.source@1', parameters: { type: { family: 'bits', size: 16 } } },
        source('right', bits(16, Uint8Array.of(0x00, 0xff))),
        { id: 'xor', operation: 'core.xor@1', inputs: { left: { node: 'left', port: 'value' }, right: { node: 'right', port: 'value' } } },
      ],
      outputs: [{ node: 'xor', port: 'value' }],
    }
    const compiled = compile(graph)
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) return
    const input = bits(16, Uint8Array.of(0x00, 0x00))
    const first = compiled.value.execute({ 'left.value': input })
    input.bytes[0] = 0xff
    const second = compiled.value.execute({ 'left.value': bits(16, Uint8Array.of(0x0f, 0x0f)) })
    expect(first.ok && hex(first.value.outputs['xor.value'] as ReturnType<typeof bits>)).toBe('0x00ff')
    expect(second.ok && hex(second.value.outputs['xor.value'] as ReturnType<typeof bits>)).toBe('0x0ff0')

    const direct = compile({
      nodes: [{ id: 'input', operation: 'core.source@1', parameters: { type: { family: 'bits', size: 16 } } }],
      outputs: [{ node: 'input', port: 'value' }],
    })
    expect(direct.ok).toBe(true)
    if (!direct.ok) return
    const sourceInput = bits(16, Uint8Array.of(0, 1))
    const snapshot = direct.value.execute({ 'input.value': sourceInput })
    sourceInput.bytes[1] = 2
    expect(snapshot.ok && hex(snapshot.value.outputs['input.value'] as ReturnType<typeof bits>)).toBe('0x0001')
  })

  it('supports bytes, words, and alphabet symbols without treating text as a wire value', () => {
    const symbol = { type: { family: 'alphabet-symbol' as const, mapping: 'latin' }, symbol: 'B' }
    for (const value of [bits(64, new Uint8Array(8)), bytes(16, new Uint8Array(16)), words(16, new Uint8Array(16)), symbol]) {
      const graph: AuthoredGraph = {
        alphabetMappings: [{ id: 'latin', symbols: ['A', 'B'] }],
        nodes: [{ id: 'value', operation: 'core.source@1', parameters: { type: value.type, value } }],
        outputs: [{ node: 'value', port: 'value' }],
      }
      const compiled = compile(graph)
      expect(compiled.ok).toBe(true)
      if (!compiled.ok) return
      const execution = compiled.value.execute()
      expect(execution.ok).toBe(true)
      if (!execution.ok) return
      expect(execution.value.outputs['value.value'].type).toEqual(value.type)
    }
    expect(compile({ alphabetMappings: [{ id: 'bad', symbols: ['A', 'A'] }], nodes: [], outputs: [] }).ok).toBe(false)
    expect(compile({ alphabetMappings: [{ id: 'bad', symbols: ['AB'] }], nodes: [], outputs: [] }).ok).toBe(false)
  })

  it('reports graph diagnostics and preserves origin', () => {
    const origin = { file: 'lesson.yaml', line: 3, column: 1 }
    const cases: AuthoredGraph[] = [
      { nodes: [{ id: 'x', operation: 'missing', origin }], outputs: [] },
      { nodes: [source('x', bits(8, Uint8Array.of(1))), source('x', bits(8, Uint8Array.of(2)))], outputs: [] },
      { nodes: [{ id: 'xor', operation: 'core.xor@1', origin }], outputs: [] },
      {
        nodes: [
          source('a', bits(8, Uint8Array.of(1))),
          source('b', bits(16, Uint8Array.of(0, 1))),
          { id: 'xor', operation: 'core.xor@1', inputs: { left: { node: 'a', port: 'value' }, right: { node: 'b', port: 'value' } }, origin },
        ],
        outputs: [],
      },
      { nodes: [{ id: 'source', operation: 'core.source@1', parameters: { value: bits(8, Uint8Array.of(1)) }, origin }], outputs: [] },
      {
        nodes: [
          { id: 'a', operation: 'core.output@1', inputs: { value: { node: 'b', port: 'value' } } },
          { id: 'b', operation: 'core.output@1', inputs: { value: { node: 'a', port: 'value' } } },
        ],
        outputs: [],
      },
    ]
    const codes = cases.map((graph) => {
      const result = compile(graph)
      return result.ok ? '' : result.diagnostics[0].code
    })
    expect(codes).toEqual(['unknown-operation', 'duplicate-node-id', 'missing-input', 'incompatible-port-type', 'invalid-parameter', 'graph-cycle'])
    const unknown = compile(cases[0])
    expect(!unknown.ok && unknown.diagnostics[0].span).toEqual(origin)
  })

  it('converts operation exceptions and invalid runtime inputs to diagnostics', () => {
    const throwing = compile({ nodes: [{ id: 'throw', operation: 'test.throw@1', origin: { file: 'test', line: 1, column: 1 } }], outputs: [] })
    expect(throwing.ok).toBe(true)
    if (!throwing.ok) return
    const failed = throwing.value.execute()
    expect(!failed.ok && failed.diagnostics[0]).toMatchObject({ code: 'operation-failed', span: { file: 'test' } })

    const compiled = compile({
      nodes: [{ id: 'source', operation: 'core.source@1', parameters: { type: { family: 'bits', size: 8 } } }],
      outputs: [{ node: 'source', port: 'value' }],
    })
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) return
    const invalid = compiled.value.execute({ 'source.value': bits(16, Uint8Array.of(0, 1)) })
    expect(!invalid.ok && invalid.diagnostics[0].code).toBe('invalid-execution-input')
  })
})

describe('Classical cipher operations (#65)', () => {
  const alphabet = { id: 'latin', symbols: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'] }
  const cipherGraph = (operation: 'classical.caesar@1' | 'classical.affine@1'): AuthoredGraph => ({
    alphabetMappings: [alphabet],
    nodes: [
      { id: 'text', operation: 'core.source@1', parameters: { type: { family: 'alphabet-text', mapping: 'latin' } } },
      { id: 'policy', operation: 'core.source@1', parameters: { type: { family: 'alphabet-policy' } } },
      ...(operation === 'classical.caesar@1'
        ? [{ id: 'shift', operation: 'core.source@1', parameters: { type: { family: 'integer', signed: true as const, safe: true as const } } }]
        : [
            { id: 'a', operation: 'core.source@1', parameters: { type: { family: 'integer', signed: true as const, safe: true as const } } },
            { id: 'b', operation: 'core.source@1', parameters: { type: { family: 'integer', signed: true as const, safe: true as const } } },
          ]),
      {
        id: 'cipher',
        operation,
        inputs: operation === 'classical.caesar@1'
          ? { text: { node: 'text', port: 'value' }, shift: { node: 'shift', port: 'value' }, policy: { node: 'policy', port: 'value' } }
          : { text: { node: 'text', port: 'value' }, a: { node: 'a', port: 'value' }, b: { node: 'b', port: 'value' }, policy: { node: 'policy', port: 'value' } },
      },
    ],
    outputs: [{ node: 'cipher', port: 'text' }],
  })

  it('runs Caesar and affine through compile/execute with reusable source inputs', () => {
    const caesar = compile(cipherGraph('classical.caesar@1'))
    const affine = compile(cipherGraph('classical.affine@1'))
    expect(caesar.ok && affine.ok).toBe(true)
    if (!caesar.ok || !affine.ok) return

    const text = alphabetText(alphabet, 'ABC')
    const caesarResult = caesar.value.execute({
      'text.value': text,
      'shift.value': integer(3),
      'policy.value': alphabetPolicy('preserve'),
    })
    const affineResult = affine.value.execute({
      'text.value': text,
      'a.value': integer(5),
      'b.value': integer(8),
      'policy.value': alphabetPolicy('preserve'),
    })
    expect(caesarResult.ok && caesarResult.value.outputs['cipher.text']).toMatchObject({ symbols: ['D', 'E', 'F'] })
    expect(affineResult.ok && affineResult.value.outputs['cipher.text']).toMatchObject({ symbols: ['I', 'N', 'S'] })
    const normalized = caesar.value.execute({
      'text.value': text,
      'shift.value': integer(Number.MAX_SAFE_INTEGER),
      'policy.value': alphabetPolicy('preserve'),
    })
    expect(normalized.ok && normalized.value.outputs['cipher.text']).toMatchObject({ symbols: ['F', 'G', 'H'] })
  })

  it('reuses a compiled graph when policy preserves or strictly rejects unmapped code points', () => {
    const compiled = compile(cipherGraph('classical.caesar@1'))
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) return
    const inputs = { 'text.value': alphabetText(alphabet, 'Ab C!'), 'shift.value': integer(3) }
    const preserved = compiled.value.execute({ ...inputs, 'policy.value': alphabetPolicy('preserve') })
    const strict = compiled.value.execute({ ...inputs, 'policy.value': alphabetPolicy('strict') })
    expect(preserved.ok && preserved.value.outputs['cipher.text']).toMatchObject({ symbols: ['D', 'b', ' ', 'F', '!'] })
    expect(strict).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'cipher.unmapped-symbol', details: { symbol: 'b', index: 1, strict: true } }],
    })
  })

  it('reports invalid key diagnostics and requires useful alphabet mappings', () => {
    const compiled = compile(cipherGraph('classical.affine@1'))
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) return
    const common = { 'text.value': alphabetText(alphabet, 'ABC'), 'b.value': integer(8), 'policy.value': alphabetPolicy('preserve') }
    expect(compiled.value.execute({ ...common, 'a.value': integer(2) })).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'cipher.invalid-affine-key', details: { a: 2, modulus: 26 } }],
    })
    expect(compiled.value.execute({ ...common, 'a.value': integer(1.5) })).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'cipher.invalid-key', details: { reason: 'fraction' } }],
    })
    expect(compile({ alphabetMappings: [{ id: 'one', symbols: ['A'] }], nodes: [], outputs: [] })).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'invalid-alphabet-mapping' }],
    })
    expect(compile({
      alphabetMappings: [alphabet],
      nodes: [{
        id: 'text',
        operation: 'core.source@1',
        parameters: {
          type: { family: 'alphabet-text', mapping: 'latin' },
          value: { type: { family: 'alphabet-text', mapping: 'latin' }, symbols: ['AB'] },
        },
      }],
      outputs: [],
    })).toMatchObject({ ok: false, diagnostics: [{ code: 'invalid-parameter' }] })
  })
})

describe('Teaching SPN fixture (#27)', () => {
  it('executes fixed rounds with stable, selected traces', () => {
    const compiled = compile({ ...teachingSpnGraph, traceLevel: 'detail' })
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) return

    const first = compiled.value.execute()
    const second = compiled.value.execute()
    expect(first).toEqual(second)
    expect(first.ok).toBe(true)
    if (!first.ok) return

    expect(hex(Object.values(first.value.outputs)[0] as ReturnType<typeof bits>)).toBe('0xcb45')
    expect(first.value.trace.map((event) => [event.path, 'value' in event && event.value && hex(event.value as ReturnType<typeof bits>)])).toEqual([
      ['plaintext', '0x1234'],
      ['round.1/key', '0x0f0f'],
      ['round.1/key-mix', '0x1d3b'],
      ['round.1/substitute', '0x491c'],
      ['round.1/permute', '0x419c'],
      ['round.1/output', '0x419c'],
      ['round.2/key', '0xf0f0'],
      ['round.2/key-mix', '0xb16c'],
      ['round.2/substitute', '0xc4b5'],
      ['round.2/permute', '0xcb45'],
      ['round.2/output', '0xcb45'],
      ['output', '0xcb45'],
    ])
    const trace = first.value.trace as readonly import('./index').TraceEvent[]
    const clonedTrace = structuredClone(trace)
    expect(hex(clonedTrace[0].value as ReturnType<typeof bits>)).toBe('0x1234')
    expect(JSON.parse(JSON.stringify(serializeTrace(trace)))[0].value).toEqual({
      type: { family: 'bits', size: 16 },
      hex: '0x1234',
    })
    expect(trace.find((event) => event.stage === 'permute')?.operation).toEqual({ permutation: [0, 2, 1, 3] })

    for (const [level, paths] of [
      ['summary', [['output', '0xcb45']]],
      ['round', [['round.1/output', '0x419c'], ['round.2/output', '0xcb45'], ['output', '0xcb45']]],
    ] as const) {
      const selected = compile({ ...teachingSpnGraph, traceLevel: level })
      expect(selected.ok).toBe(true)
      if (!selected.ok) continue
      const execution = selected.value.execute()
      expect(execution.ok).toBe(true)
      if (execution.ok) expect(execution.value.trace.map((event) => [event.path, 'value' in event && event.value && hex(event.value as ReturnType<typeof bits>)])).toEqual(paths)
    }
  })

  it('rejects invalid SPN structures at compilation', () => {
    const invalid = (graph: AuthoredGraph): string =>
      (() => {
        const result = compile(graph)
        return result.ok ? '' : result.diagnostics[0].code
      })()
    expect(invalid({
      ...teachingSpnGraph,
      nodes: [{ id: 'rounds', repeat: { subgraph: 'round', count: 0 } }],
    })).toBe('spn.invalid-round-count')
    expect(invalid({
      ...teachingSpnGraph,
      nodes: [{ id: 'rounds', repeat: { subgraph: 'round' } as never }],
    })).toBe('graph.unbounded-repetition')
    expect(invalid({
      ...teachingSpnGraph,
      nodes: [{ id: 'rounds', repeat: { subgraph: 'round', count: 'two' } as never }],
    })).toBe('graph.dynamic-loop')
    expect(invalid({
      ...teachingSpnGraph,
      nodes: teachingSpnGraph.nodes,
      subgraphs: {
        round: {
          ...teachingSpnGraph.subgraphs!.round,
          nodes: teachingSpnGraph.subgraphs!.round.nodes.map((node) =>
            node.operation === 'spn.substitute@1' ? { ...node, parameters: { sBox: Array(16).fill(0) } } : node,
          ),
        },
      },
    })).toBe('spn.invalid-s-box')
    expect(invalid({
      ...teachingSpnGraph,
      nodes: teachingSpnGraph.nodes,
      subgraphs: {
        round: {
          ...teachingSpnGraph.subgraphs!.round,
          nodes: teachingSpnGraph.subgraphs!.round.nodes.map((node) =>
            node.operation === 'spn.permute@1' ? { ...node, parameters: { permutation: [0, 0, 1, 2] } } : node,
          ),
        },
      },
    })).toBe('spn.invalid-permutation')
    expect(invalid({
      ...teachingSpnGraph,
      nodes: [{ id: 'rounds', repeat: { subgraph: 'round', count: 2 }, inputs: {} }],
    })).toBe('graph.structural-mismatch')
    expect(invalid({ ...teachingSpnGraph, traceLevel: 'all' as never })).toBe('trace.unsupported-level')
  })

  it('binds each repeated subgraph input and exposes each declared output', () => {
    const repeated: AuthoredGraph = {
      nodes: [
        source('left', bits(16, Uint8Array.of(0x0f, 0x0f))),
        source('right', bits(16, Uint8Array.of(0x00, 0xff))),
        { id: 'twice', repeat: { subgraph: 'xor', count: 2 }, inputs: { left: { node: 'left', port: 'value' }, right: { node: 'right', port: 'value' } } },
        { id: 'again', repeat: { subgraph: 'xor', count: 2 }, inputs: { left: { node: 'left', port: 'value' }, right: { node: 'right', port: 'value' } } },
        { id: 'final', operation: 'core.output@1', inputs: { value: { node: 'twice', port: 'mixed' } } },
      ],
      outputs: [{ node: 'final', port: 'value' }, { node: 'twice', port: 'preserved' }],
      subgraphs: {
        xor: {
          inputs: [{ name: 'left', type: { family: 'bits', size: 16 } }, { name: 'right', type: { family: 'bits', size: 16 } }],
          outputs: [{ name: 'mixed', type: { family: 'bits', size: 16 } }, { name: 'preserved', type: { family: 'bits', size: 16 } }],
          nodes: [
            { id: 'mixed', operation: 'core.xor@1', inputs: { left: { node: '@input', port: 'left' }, right: { node: '@input', port: 'right' } } },
            { id: 'preserved', operation: 'core.output@1', inputs: { value: { node: '@input', port: 'left' } } },
          ],
        },
      },
    }
    const compiled = compile(repeated)
    expect(compiled.ok).toBe(true)
    if (compiled.ok) {
      const execution = compiled.value.execute()
      expect(execution.ok).toBe(true)
      if (execution.ok) expect(Object.values(execution.value.outputs).map((value) => hex(value as ReturnType<typeof bits>))).toEqual(['0x0ff0', '0x0f0f'])
    }

    const invalidInput = compile({
      ...repeated,
      subgraphs: {
        xor: {
          ...repeated.subgraphs!.xor,
          nodes: [{ id: 'mixed', operation: 'core.xor@1', inputs: { left: { node: '@input', port: 'missing' }, right: { node: '@input', port: 'right' } } }],
        },
      },
    })
    expect(!invalidInput.ok && invalidInput.diagnostics[0].code).toBe('graph.structural-mismatch')
  })
})

describe('CryptoGraph Worker contract (#28)', () => {
  it('reuses a compiled graph for repeated execution inputs', () => {
    const compiledGraphs = new Map()
    const first = executeWorkerRequest({
      requestId: 'first-cipher-input',
      kind: 'execute',
      payload: { graph: xorGraph(), compiledGraphId: 'lesson:0:xor' },
    }, compiledGraphs)
    const second = executeWorkerRequest({
      requestId: 'second-cipher-input',
      kind: 'execute',
      payload: { graph: { nodes: [], outputs: [] }, compiledGraphId: 'lesson:0:xor' },
    }, compiledGraphs)
    expect(compiledGraphs.size).toBe(1)
    for (const response of [first, second]) {
      expect(response.kind).toBe('snapshot')
      if (response.kind === 'snapshot') expect(hex(response.snapshot.outputs['xor.value'] as ReturnType<typeof bits>)).toBe('0x0ff0')
    }
  })

  it('compares semantic checkpoints with avalanche difference data', () => {
    const graph = (value: ReturnType<typeof bits>): AuthoredGraph => ({
      nodes: [
        source('input', value),
        { id: 'output', operation: 'core.output@1', inputs: { value: { node: 'input', port: 'value' } } },
      ],
      outputs: [{ node: 'output', port: 'value' }],
      traceLevel: 'summary',
    })
    const response = executeWorkerRequest({
      requestId: 'avalanche-fixture',
      kind: 'compare',
      payload: {
        left: { graph: graph(bits(16, Uint8Array.of(0x0f, 0x0f))) },
        right: { graph: graph(bits(16, Uint8Array.of(0x00, 0xff))) },
      },
    })

    expect(response.kind).toBe('comparison')
    if (response.kind !== 'comparison') return
    expect(response.comparison.checkpoints).toHaveLength(1)
    expect(response.comparison.checkpoints[0]).toMatchObject({
      path: 'output',
      changedBits: 8,
      ratio: 0.5,
    })
    if (!response.comparison.checkpoints[0].complete) return
    expect(hex(response.comparison.checkpoints[0].mask)).toBe('0x0ff0')
    expect(response.comparison).toMatchObject({
      truncated: false,
      executions: {
        baseline: { traceStatus: { truncated: false } },
        changed: { traceStatus: { truncated: false } },
      },
    })
  })

  it('marks deterministic trace prefixes as truncated', () => {
    const response = executeWorkerRequest({
      requestId: 'truncated-trace',
      kind: 'execute',
      payload: { graph: { ...teachingSpnGraph, traceLevel: 'detail' }, limits: { traceEvents: 1 } },
    })

    expect(response.kind).toBe('snapshot')
    if (response.kind !== 'snapshot') return
    expect(response.snapshot.trace).toHaveLength(1)
    expect(response.snapshot.traceStatus).toEqual({ truncated: true, retained: 1, dropped: 11 })
  })

  it('retains raw snapshots when a comparison trace is incomplete', () => {
    expect(Object.isFrozen(maxWorkerLimits)).toBe(true)
    const raised = executeWorkerRequest({
      requestId: 'raised-limit',
      kind: 'execute',
      payload: { graph: teachingSpnGraph, limits: { traceEvents: 513 } },
    })
    expect(raised).toMatchObject({ kind: 'diagnostic', diagnostics: [{ code: 'execution.limit-exceeds-global' }] })

    const incomplete = executeWorkerRequest({
      requestId: 'incomplete-comparison',
      kind: 'compare',
      payload: {
        left: { graph: { ...teachingSpnGraph, traceLevel: 'detail' }, limits: { traceEvents: 1 } },
        right: { graph: { ...teachingSpnGraph, traceLevel: 'detail' } },
      },
    })
    expect(incomplete).toMatchObject({
      kind: 'comparison',
      comparison: {
        truncated: true,
        checkpoints: expect.arrayContaining([expect.objectContaining({ path: 'plaintext', changedBits: 0 })]),
        executions: {
          baseline: { traceStatus: { truncated: true } },
          changed: { traceStatus: { truncated: false } },
        },
      },
    })
  })

  it('rejects incompatible comparisons', () => {

    const incompatible = executeWorkerRequest({
      requestId: 'incompatible-comparison',
      kind: 'compare',
      payload: {
        left: { graph: { ...teachingSpnGraph, traceLevel: 'detail' } },
        right: {
          graph: {
            nodes: [source('input', bits(16, Uint8Array.of(0, 1)))],
            outputs: [{ node: 'input', port: 'value' }],
            traceLevel: 'detail',
          },
        },
      },
    })
    expect(incompatible).toMatchObject({ kind: 'diagnostic', diagnostics: [{ code: 'comparison.incompatible-structure' }] })
  })

  it('bounds inputs and expanded repetitions before execution', () => {
    const oversizedInput = executeWorkerRequest({
      requestId: 'oversized-input',
      kind: 'execute',
      payload: { graph: teachingSpnGraph, limits: { inputBytes: 5 } },
    })
    expect(oversizedInput).toMatchObject({ kind: 'diagnostic', diagnostics: [{ code: 'execution.input-limit' }] })

    const unexpandedRepeat = executeWorkerRequest({
      requestId: 'oversized-repeat',
      kind: 'execute',
      payload: {
        graph: {
          ...teachingSpnGraph,
          nodes: [
            teachingSpnGraph.nodes[0],
            { ...teachingSpnGraph.nodes[1], repeat: { subgraph: 'round', count: Number.MAX_SAFE_INTEGER } },
          ],
        },
      },
    })
    expect(unexpandedRepeat).toMatchObject({ kind: 'diagnostic', diagnostics: [{ code: 'execution.node-limit' }] })
  })

  it('shares request caps and compares equivalent relative subgraph paths', () => {
    const renamed: AuthoredGraph = {
      ...teachingSpnGraph,
      nodes: [
        teachingSpnGraph.nodes[0],
        { ...teachingSpnGraph.nodes[1], id: 'cipher' },
      ],
      outputs: [{ node: 'cipher', port: 'permute' }],
      traceLevel: 'detail',
    }
    const equivalent = executeWorkerRequest({
      requestId: 'relative-paths',
      kind: 'compare',
      payload: {
        left: { graph: { ...teachingSpnGraph, traceLevel: 'detail' } },
        right: { graph: renamed },
      },
    })
    expect(equivalent.kind).toBe('comparison')

    const sharedNodes = executeWorkerRequest({
      requestId: 'shared-nodes',
      kind: 'compare',
      payload: {
        left: { graph: { ...teachingSpnGraph, traceLevel: 'detail' } },
        right: { graph: { ...teachingSpnGraph, traceLevel: 'detail' } },
        limits: { expandedNodes: 9 },
      },
    })
    expect(sharedNodes).toMatchObject({ kind: 'diagnostic', diagnostics: [{ code: 'execution.node-limit' }] })

    const incompatibleSummary = executeWorkerRequest({
      requestId: 'incompatible-summary',
      kind: 'compare',
      payload: {
        left: { graph: { ...teachingSpnGraph, traceLevel: 'summary' } },
        right: {
          graph: {
            nodes: [source('input', bits(16, Uint8Array.of(0, 1)))],
            outputs: [{ node: 'input', port: 'value' }],
            traceLevel: 'summary',
          },
        },
      },
    })
    expect(incompatibleSummary).toMatchObject({ kind: 'diagnostic', diagnostics: [{ code: 'comparison.incompatible-structure' }] })
  })

  it('compares equivalent reordered graphs and repeat IDs containing slashes', () => {
    const reordered: AuthoredGraph = {
      ...teachingSpnGraph,
      nodes: [...teachingSpnGraph.nodes].reverse(),
      traceLevel: 'detail',
    }
    const slashNamed: AuthoredGraph = {
      ...teachingSpnGraph,
      nodes: [
        teachingSpnGraph.nodes[0],
        { ...teachingSpnGraph.nodes[1], id: 'cipher/round' },
      ],
      outputs: [{ node: 'cipher/round', port: 'permute' }],
      traceLevel: 'detail',
    }
    for (const right of [reordered, slashNamed]) {
      const comparison = executeWorkerRequest({
        requestId: `equivalent-${right.nodes[0].id}`,
        kind: 'compare',
        payload: {
          left: { graph: { ...teachingSpnGraph, traceLevel: 'detail' } },
          right: { graph: right },
        },
      })
      expect(comparison.kind).toBe('comparison')
    }
  })

  it('aligns repeat nodes independently of declaration order', () => {
    const repeated: AuthoredGraph = {
      nodes: [
        source('state-a', bits(16, Uint8Array.of(0x12, 0x34))),
        source('state-b', bits(16, Uint8Array.of(0x56, 0x78))),
        { id: 'left', repeat: { subgraph: 'round', count: 2 }, inputs: { permute: { node: 'state-a', port: 'value' } } },
        { id: 'right', repeat: { subgraph: 'round', count: 2 }, inputs: { permute: { node: 'state-b', port: 'value' } } },
      ],
      outputs: [{ node: 'left', port: 'permute' }, { node: 'right', port: 'permute' }],
      subgraphs: teachingSpnGraph.subgraphs,
      traceLevel: 'detail',
    }
    const reordered = { ...repeated, nodes: [repeated.nodes[1], repeated.nodes[3], repeated.nodes[0], repeated.nodes[2]] }
    const renamedUpstreams: AuthoredGraph = {
      ...repeated,
      nodes: [
        { ...repeated.nodes[0], id: 'z-source' },
        { ...repeated.nodes[1], id: 'a-source' },
        { ...repeated.nodes[2], inputs: { permute: { node: 'z-source', port: 'value' } } },
        { ...repeated.nodes[3], inputs: { permute: { node: 'a-source', port: 'value' } } },
      ],
    }
    for (const right of [reordered, renamedUpstreams]) {
      const comparison = executeWorkerRequest({
        requestId: `repeat-alignment-${right.nodes[0].id}`,
        kind: 'compare',
        payload: { left: { graph: repeated }, right: { graph: right } },
      })
      expect(comparison.kind).toBe('comparison')
      if (comparison.kind === 'comparison') expect(comparison.comparison.checkpoints.every((checkpoint) =>
        !checkpoint.complete || checkpoint.changedBits === 0,
      )).toBe(true)
    }

    const ambiguous: AuthoredGraph = {
      ...repeated,
      nodes: [
        repeated.nodes[0],
        { ...repeated.nodes[2], inputs: { permute: { node: 'state-a', port: 'value' } } },
        { ...repeated.nodes[3], inputs: { permute: { node: 'state-a', port: 'value' } } },
      ],
      outputs: [{ node: 'state-a', port: 'value' }],
    }
    const ambiguousComparison = executeWorkerRequest({
      requestId: 'ambiguous-repeats',
      kind: 'compare',
      payload: { left: { graph: ambiguous }, right: { graph: ambiguous } },
    })
    expect(ambiguousComparison).toMatchObject({ kind: 'diagnostic', diagnostics: [{ code: 'comparison.incompatible-structure' }] })
  })
})

describe('AES key expansion (#83)', () => {
  const hexToBytes = (value: string): Uint8Array => Uint8Array.from(value.match(/../g)!.map((byte) => Number.parseInt(byte, 16)))

  const expand = (keySize: 128 | 192 | 256, keyHex: string) => {
    const compiled = compile(aesKeyExpansionGraph(keySize))
    if (!compiled.ok) throw new Error('unreachable: AES key-expansion graph must compile')
    return compiled.value.execute({ 'key.value': bits(keySize, hexToBytes(keyHex)) })
  }

  const roundKeyHexes = (execution: ReturnType<typeof expand>, rounds: number): readonly string[] => {
    if (!execution.ok) throw new Error('unreachable: expansion must execute')
    return Array.from({ length: rounds + 1 }, (_, round) => hex(execution.value.outputs[`round-key-${round}.value`] as ReturnType<typeof bits>))
  }

  it('composes and executes AES-128, AES-192, and AES-256 from registered primitives', () => {
    for (const keySize of [128, 192, 256] as const) {
      const compiled = compile(aesKeyExpansionGraph(keySize))
      expect(compiled.ok).toBe(true)
    }
    expect(['aes.key-word@1', 'aes.rot-word@1', 'aes.sub-word@1', 'aes.rcon-word@1', 'aes.word-xor@1', 'aes.round-key@1'].every((id) =>
      operationManifests.some((manifest) => manifest.identity === id))).toBe(true)
  })

  it('matches FIPS-197 Appendix A known-answer vectors for AES-128, AES-192, and AES-256', () => {
    expect(roundKeyHexes(expand(128, '2b7e151628aed2a6abf7158809cf4f3c'), 10)).toEqual([
      '0x2b7e151628aed2a6abf7158809cf4f3c',
      '0xa0fafe1788542cb123a339392a6c7605',
      '0xf2c295f27a96b9435935807a7359f67f',
      '0x3d80477d4716fe3e1e237e446d7a883b',
      '0xef44a541a8525b7fb671253bdb0bad00',
      '0xd4d1c6f87c839d87caf2b8bc11f915bc',
      '0x6d88a37a110b3efddbf98641ca0093fd',
      '0x4e54f70e5f5fc9f384a64fb24ea6dc4f',
      '0xead27321b58dbad2312bf5607f8d292f',
      '0xac7766f319fadc2128d12941575c006e',
      '0xd014f9a8c9ee2589e13f0cc8b6630ca6',
    ])
    expect(roundKeyHexes(expand(192, '8e73b0f7da0e6452c810f32b809079e562f8ead2522c6b7b'), 12)).toEqual([
      '0x8e73b0f7da0e6452c810f32b809079e5',
      '0x62f8ead2522c6b7bfe0c91f72402f5a5',
      '0xec12068e6c827f6b0e7a95b95c56fec2',
      '0x4db7b4bd69b5411885a74796e92538fd',
      '0xe75fad44bb095386485af05721efb14f',
      '0xa448f6d94d6dce24aa326360113b30e6',
      '0xa25e7ed583b1cf9a27f939436a94f767',
      '0xc0a69407d19da4e1ec1786eb6fa64971',
      '0x485f703222cb8755e26d135233f0b7b3',
      '0x40beeb282f18a2596747d26b458c553e',
      '0xa7e1466c9411f1df821f750aad07d753',
      '0xca4005388fcc5006282d166abc3ce7b5',
      '0xe98ba06f448c773c8ecc720401002202',
    ])
    expect(roundKeyHexes(expand(256, '603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4'), 14)).toEqual([
      '0x603deb1015ca71be2b73aef0857d7781',
      '0x1f352c073b6108d72d9810a30914dff4',
      '0x9ba354118e6925afa51a8b5f2067fcde',
      '0xa8b09c1a93d194cdbe49846eb75d5b9a',
      '0xd59aecb85bf3c917fee94248de8ebe96',
      '0xb5a9328a2678a647983122292f6c79b3',
      '0x812c81addadf48ba24360af2fab8b464',
      '0x98c5bfc9bebd198e268c3ba709e04214',
      '0x68007bacb2df331696e939e46c518d80',
      '0xc814e20476a9fb8a5025c02d59c58239',
      '0xde1369676ccc5a71fa2563959674ee15',
      '0x5886ca5d2e2f31d77e0af1fa27cf73c3',
      '0x749c47ab18501ddae2757e4f7401905a',
      '0xcafaaae3e4d59b349adf6acebd10190d',
      '0xfe4890d1e6188d0b046df344706c631e',
    ])
  })

  it('exposes round-key and word checkpoints with stable FIPS-197 round and row identifiers', () => {
    const execution = expand(128, '2b7e151628aed2a6abf7158809cf4f3c')
    expect(execution.ok).toBe(true)
    if (!execution.ok) return
    const trace = execution.value.trace as readonly TraceEvent[]
    expect(trace.filter((event) => event.path === 'word-0')).toEqual([
      { path: 'word-0', level: 'detail', round: 0, stage: 'input', value: bits(32, hexToBytes('2b7e1516')) },
    ])
    // Word 4 begins round 1's schedule step: RotWord, SubWord, Rcon, then two XORs (round-constant mix, then w[0]).
    expect(trace.filter((event) => event.path === 'word-4' || event.path.startsWith('word-4-')).map((event) => [event.path, event.round, event.stage, 'value' in event && event.value && hex(event.value as ReturnType<typeof bits>)])).toEqual([
      ['word-4-rot', 1, 'rot-word', '0xcf4f3c09'],
      ['word-4-sub', 1, 'sub-word', '0x8a84eb01'],
      ['word-4-rcon', 1, 'rcon', '0x01000000'],
      ['word-4-temp', 1, 'word-xor', '0x8b84eb01'],
      ['word-4', 1, 'word-xor', '0xa0fafe17'],
    ])
    expect(trace.filter((event) => event.path.startsWith('round-key-')).slice(0, 2)).toEqual([
      { path: 'round-key-0', level: 'detail', round: 0, stage: 'round-key', value: bits(128, hexToBytes('2b7e151628aed2a6abf7158809cf4f3c')) },
      { path: 'round-key-1', level: 'detail', round: 1, stage: 'round-key', value: bits(128, hexToBytes('a0fafe1788542cb123a339392a6c7605')) },
    ])
  })

  it('executes full-size AES-128/192/256 key schedules through a worker request within the worker time budget', () => {
    // Direct compile().execute() calls (used by the KAT tests above) skip the structural
    // signature/repeat-identity bookkeeping `executeWorkerRequest` does on every real
    // execution. Each word feeds several later words (unlike a linear round chain), so an
    // earlier version of that bookkeeping re-embedded a node's full upstream signature text
    // per reference and grew exponentially with word count, taking tens of seconds (or
    // throwing on an oversized string) for the true 44-60 word AES-128/192/256 schedules.
    for (const keySize of [128, 192, 256] as const) {
      const start = performance.now()
      const response = executeWorkerRequest({
        requestId: 'aes-worker-budget',
        kind: 'execute',
        payload: { graph: aesKeyExpansionGraph(keySize), inputs: { 'key.value': bits(keySize, new Uint8Array(keySize / 8)) } },
      })
      expect(response.kind).toBe('snapshot')
      expect(performance.now() - start).toBeLessThan(maxWorkerLimits.timeoutMs)
    }
  })

  it('rejects invalid key type, length, missing input, and malformed values with structured diagnostics', () => {
    const compiled = compile(aesKeyExpansionGraph(128))
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) return

    const wrongLength = compiled.value.execute({ 'key.value': bits(192, new Uint8Array(24)) })
    expect(!wrongLength.ok && wrongLength.diagnostics[0].code).toBe('invalid-execution-input')

    const missing = compiled.value.execute()
    expect(!missing.ok && missing.diagnostics[0].code).toBe('missing-execution-input')

    const malformed = compiled.value.execute({ 'key.value': bits(128, new Uint8Array(15)) })
    expect(!malformed.ok && malformed.diagnostics[0].code).toBe('invalid-value')
  })

  it('reports diagnostics for invalid key-word index and Rcon round parameters', () => {
    const badIndex = compile({
      nodes: [
        { id: 'key', operation: 'core.source@1', parameters: { type: { family: 'bits', size: 128 } } },
        { id: 'word', operation: 'aes.key-word@1', inputs: { key: { node: 'key', port: 'value' } }, parameters: { index: -1 } },
      ],
      outputs: [{ node: 'word', port: 'value' }],
    })
    expect(!badIndex.ok && badIndex.diagnostics[0].code).toBe('aes.invalid-key-word-index')

    const badRcon = compile({
      nodes: [{ id: 'rcon', operation: 'aes.rcon-word@1', parameters: { round: 0 } }],
      outputs: [{ node: 'rcon', port: 'value' }],
    })
    expect(!badRcon.ok && badRcon.diagnostics[0].code).toBe('aes.invalid-rcon-round')

    const outOfRangeIndex = compile({
      nodes: [
        { id: 'key', operation: 'core.source@1', parameters: { type: { family: 'bits', size: 128 } } },
        { id: 'word', operation: 'aes.key-word@1', inputs: { key: { node: 'key', port: 'value' } }, parameters: { index: 4 } },
      ],
      outputs: [{ node: 'word', port: 'value' }],
    })
    expect(outOfRangeIndex.ok).toBe(true)
    if (!outOfRangeIndex.ok) return
    const result = outOfRangeIndex.value.execute({ 'key.value': bits(128, new Uint8Array(16)) })
    expect(!result.ok && result.diagnostics[0].code).toBe('aes.key-word-out-of-range')
  })
})

describe('AES-128 encryption and decryption (#84)', () => {
  const hexToBytes = (value: string): Uint8Array => Uint8Array.from(value.match(/../g)!.map((byte) => Number.parseInt(byte, 16)))

  // FIPS-197 Appendix A.1 key schedule for the C.1 known-answer vector's key, computed once and
  // reused as this suite's `round-key-<r>.value` execution inputs (the encryption/decryption
  // graphs consume round keys as ordinary source inputs; #83's own suite already proves the
  // key-expansion graph that would normally supply them).
  const kat = {
    key: '000102030405060708090a0b0c0d0e0f',
    plaintext: '00112233445566778899aabbccddeeff',
    ciphertext: '69c4e0d86a7b0430d8cdb78070b4c55a',
  }

  const roundKeyInputs = (): Record<string, ReturnType<typeof bits>> => {
    const expanded = compile(aesKeyExpansionGraph(128))
    if (!expanded.ok) throw new Error('unreachable: AES key-expansion graph must compile')
    const execution = expanded.value.execute({ 'key.value': bits(128, hexToBytes(kat.key)) })
    if (!execution.ok) throw new Error('unreachable: key expansion must execute')
    return Object.fromEntries(Array.from({ length: 11 }, (_, round) =>
      [`round-key-${round}.value`, execution.value.outputs[`round-key-${round}.value`] as ReturnType<typeof bits>]))
  }

  it('encrypts and decrypts the FIPS-197 C.1 known-answer vector from registered primitives and #83 round-key outputs', () => {
    const roundKeys = roundKeyInputs()

    const cipher = compile(aesCipherGraph())
    expect(cipher.ok).toBe(true)
    if (!cipher.ok) return
    const encrypted = cipher.value.execute({ ...roundKeys, 'plaintext.value': bits(128, hexToBytes(kat.plaintext)) })
    expect(encrypted.ok).toBe(true)
    if (!encrypted.ok) return
    expect(hex(encrypted.value.outputs['cipher-10-add-round-key.value'] as ReturnType<typeof bits>)).toBe(`0x${kat.ciphertext}`)

    const inverse = compile(aesInverseCipherGraph())
    expect(inverse.ok).toBe(true)
    if (!inverse.ok) return
    const decrypted = inverse.value.execute({ ...roundKeys, 'ciphertext.value': bits(128, hexToBytes(kat.ciphertext)) })
    expect(decrypted.ok).toBe(true)
    if (!decrypted.ok) return
    expect(hex(decrypted.value.outputs['cipher-0-add-round-key.value'] as ReturnType<typeof bits>)).toBe(`0x${kat.plaintext}`)
  })

  it('exposes encryption checkpoints in FIPS-197 order with stable, round-tagged IDs', () => {
    const cipher = compile(aesCipherGraph())
    if (!cipher.ok) throw new Error('unreachable: cipher graph must compile')
    const execution = cipher.value.execute({ ...roundKeyInputs(), 'plaintext.value': bits(128, hexToBytes(kat.plaintext)) })
    if (!execution.ok) throw new Error('unreachable: cipher must execute')
    const trace = execution.value.trace as readonly TraceEvent[]
    const checkpoints = trace.filter((event) => event.path === 'plaintext' || event.path.startsWith('cipher-') || event.path === 'output')
    expect(checkpoints.map((event) => [event.path, event.round, event.stage])).toEqual([
      ['plaintext', undefined, 'input'],
      ['cipher-0-add-round-key', 0, 'add-round-key'],
      ['cipher-1-sub-bytes', 1, 'sub-bytes'],
      ['cipher-1-shift-rows', 1, 'shift-rows'],
      ['cipher-1-mix-columns', 1, 'mix-columns'],
      ['cipher-1-add-round-key', 1, 'add-round-key'],
      ['cipher-2-sub-bytes', 2, 'sub-bytes'],
      ['cipher-2-shift-rows', 2, 'shift-rows'],
      ['cipher-2-mix-columns', 2, 'mix-columns'],
      ['cipher-2-add-round-key', 2, 'add-round-key'],
      ['cipher-3-sub-bytes', 3, 'sub-bytes'],
      ['cipher-3-shift-rows', 3, 'shift-rows'],
      ['cipher-3-mix-columns', 3, 'mix-columns'],
      ['cipher-3-add-round-key', 3, 'add-round-key'],
      ['cipher-4-sub-bytes', 4, 'sub-bytes'],
      ['cipher-4-shift-rows', 4, 'shift-rows'],
      ['cipher-4-mix-columns', 4, 'mix-columns'],
      ['cipher-4-add-round-key', 4, 'add-round-key'],
      ['cipher-5-sub-bytes', 5, 'sub-bytes'],
      ['cipher-5-shift-rows', 5, 'shift-rows'],
      ['cipher-5-mix-columns', 5, 'mix-columns'],
      ['cipher-5-add-round-key', 5, 'add-round-key'],
      ['cipher-6-sub-bytes', 6, 'sub-bytes'],
      ['cipher-6-shift-rows', 6, 'shift-rows'],
      ['cipher-6-mix-columns', 6, 'mix-columns'],
      ['cipher-6-add-round-key', 6, 'add-round-key'],
      ['cipher-7-sub-bytes', 7, 'sub-bytes'],
      ['cipher-7-shift-rows', 7, 'shift-rows'],
      ['cipher-7-mix-columns', 7, 'mix-columns'],
      ['cipher-7-add-round-key', 7, 'add-round-key'],
      ['cipher-8-sub-bytes', 8, 'sub-bytes'],
      ['cipher-8-shift-rows', 8, 'shift-rows'],
      ['cipher-8-mix-columns', 8, 'mix-columns'],
      ['cipher-8-add-round-key', 8, 'add-round-key'],
      ['cipher-9-sub-bytes', 9, 'sub-bytes'],
      ['cipher-9-shift-rows', 9, 'shift-rows'],
      ['cipher-9-mix-columns', 9, 'mix-columns'],
      ['cipher-9-add-round-key', 9, 'add-round-key'],
      ['cipher-10-sub-bytes', 10, 'sub-bytes'],
      ['cipher-10-shift-rows', 10, 'shift-rows'],
      ['cipher-10-add-round-key', 10, 'add-round-key'],
      ['output', undefined, 'output'],
    ])
  })

  it('exposes inverse-cipher checkpoints in FIPS-197 order with stable, round-tagged IDs', () => {
    const inverse = compile(aesInverseCipherGraph())
    if (!inverse.ok) throw new Error('unreachable: inverse cipher graph must compile')
    const execution = inverse.value.execute({ ...roundKeyInputs(), 'ciphertext.value': bits(128, hexToBytes(kat.ciphertext)) })
    if (!execution.ok) throw new Error('unreachable: inverse cipher must execute')
    const trace = execution.value.trace as readonly TraceEvent[]
    const checkpoints = trace.filter((event) => event.path === 'ciphertext' || event.path.startsWith('cipher-') || event.path === 'output')
    expect(checkpoints.map((event) => [event.path, event.round, event.stage])).toEqual([
      ['ciphertext', undefined, 'input'],
      ['cipher-10-add-round-key', 10, 'add-round-key'],
      ['cipher-9-inv-shift-rows', 9, 'inv-shift-rows'],
      ['cipher-9-inv-sub-bytes', 9, 'inv-sub-bytes'],
      ['cipher-9-add-round-key', 9, 'add-round-key'],
      ['cipher-9-inv-mix-columns', 9, 'inv-mix-columns'],
      ['cipher-8-inv-shift-rows', 8, 'inv-shift-rows'],
      ['cipher-8-inv-sub-bytes', 8, 'inv-sub-bytes'],
      ['cipher-8-add-round-key', 8, 'add-round-key'],
      ['cipher-8-inv-mix-columns', 8, 'inv-mix-columns'],
      ['cipher-7-inv-shift-rows', 7, 'inv-shift-rows'],
      ['cipher-7-inv-sub-bytes', 7, 'inv-sub-bytes'],
      ['cipher-7-add-round-key', 7, 'add-round-key'],
      ['cipher-7-inv-mix-columns', 7, 'inv-mix-columns'],
      ['cipher-6-inv-shift-rows', 6, 'inv-shift-rows'],
      ['cipher-6-inv-sub-bytes', 6, 'inv-sub-bytes'],
      ['cipher-6-add-round-key', 6, 'add-round-key'],
      ['cipher-6-inv-mix-columns', 6, 'inv-mix-columns'],
      ['cipher-5-inv-shift-rows', 5, 'inv-shift-rows'],
      ['cipher-5-inv-sub-bytes', 5, 'inv-sub-bytes'],
      ['cipher-5-add-round-key', 5, 'add-round-key'],
      ['cipher-5-inv-mix-columns', 5, 'inv-mix-columns'],
      ['cipher-4-inv-shift-rows', 4, 'inv-shift-rows'],
      ['cipher-4-inv-sub-bytes', 4, 'inv-sub-bytes'],
      ['cipher-4-add-round-key', 4, 'add-round-key'],
      ['cipher-4-inv-mix-columns', 4, 'inv-mix-columns'],
      ['cipher-3-inv-shift-rows', 3, 'inv-shift-rows'],
      ['cipher-3-inv-sub-bytes', 3, 'inv-sub-bytes'],
      ['cipher-3-add-round-key', 3, 'add-round-key'],
      ['cipher-3-inv-mix-columns', 3, 'inv-mix-columns'],
      ['cipher-2-inv-shift-rows', 2, 'inv-shift-rows'],
      ['cipher-2-inv-sub-bytes', 2, 'inv-sub-bytes'],
      ['cipher-2-add-round-key', 2, 'add-round-key'],
      ['cipher-2-inv-mix-columns', 2, 'inv-mix-columns'],
      ['cipher-1-inv-shift-rows', 1, 'inv-shift-rows'],
      ['cipher-1-inv-sub-bytes', 1, 'inv-sub-bytes'],
      ['cipher-1-add-round-key', 1, 'add-round-key'],
      ['cipher-1-inv-mix-columns', 1, 'inv-mix-columns'],
      ['cipher-0-inv-shift-rows', 0, 'inv-shift-rows'],
      ['cipher-0-inv-sub-bytes', 0, 'inv-sub-bytes'],
      ['cipher-0-add-round-key', 0, 'add-round-key'],
      ['output', undefined, 'output'],
    ])
  })

  it('rejects missing input, wrong type or length, and malformed round-key/block values with structured diagnostics', () => {
    const cipher = compile(aesCipherGraph())
    expect(cipher.ok).toBe(true)
    if (!cipher.ok) return

    const missingPlaintext = cipher.value.execute({ ...roundKeyInputs() })
    expect(!missingPlaintext.ok && missingPlaintext.diagnostics[0].code).toBe('missing-execution-input')

    const wrongLength = cipher.value.execute({ ...roundKeyInputs(), 'plaintext.value': bits(64, new Uint8Array(8)) })
    expect(!wrongLength.ok && wrongLength.diagnostics[0].code).toBe('invalid-execution-input')

    const malformedRoundKey = cipher.value.execute({
      ...roundKeyInputs(),
      'round-key-0.value': bits(128, new Uint8Array(15)),
      'plaintext.value': bits(128, hexToBytes(kat.plaintext)),
    })
    expect(!malformedRoundKey.ok && malformedRoundKey.diagnostics[0].code).toBe('invalid-value')
  })

  it('marks an execution truncated by the trace-event limit while still returning correct outputs', () => {
    const response = executeWorkerRequest({
      requestId: 'aes-cipher-truncated-trace',
      kind: 'execute',
      payload: {
        graph: aesCipherGraph(),
        inputs: { ...roundKeyInputs(), 'plaintext.value': bits(128, hexToBytes(kat.plaintext)) },
        limits: { traceEvents: 2 },
      },
    })
    expect(response.kind).toBe('snapshot')
    if (response.kind !== 'snapshot') return
    expect(response.snapshot.traceStatus.truncated).toBe(true)
    expect(hex(response.snapshot.outputs['cipher-10-add-round-key.value'] as ReturnType<typeof bits>)).toBe(`0x${kat.ciphertext}`)
  })
})
