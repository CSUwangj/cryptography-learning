import { describe, expect, it } from 'vitest'
import {
  bits,
  bytes,
  compile,
  hex,
  operationManifests,
  serializeTrace,
  teachingSpnGraph,
  words,
  type AuthoredGraph,
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
      ['round.1/key-mix', '0x1d3b'],
      ['round.1/substitute', '0x491c'],
      ['round.1/permute', '0x419c'],
      ['round.1/output', '0x419c'],
      ['round.2/key-mix', '0xb16c'],
      ['round.2/substitute', '0xc4b5'],
      ['round.2/permute', '0xcb45'],
      ['round.2/output', '0xcb45'],
      ['output', '0xcb45'],
    ])
    const trace = first.value.trace as readonly import('./index').TraceEvent[]
    const clonedTrace = structuredClone(trace)
    expect(hex(clonedTrace[0].value as ReturnType<typeof bits>)).toBe('0x1d3b')
    expect(JSON.parse(JSON.stringify(serializeTrace(trace)))[0].value).toEqual({
      type: { family: 'bits', size: 16 },
      hex: '0x1d3b',
    })

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
