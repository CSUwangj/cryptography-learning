import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { bits, executeWorkerRequest, hex, teachingSpnGraph } from '../crypto_graph'
import { teachingSpnDemoDocuments } from '../app/testspn'
import { compileLesson, createBrowserLessonSession } from '../lesson_runtime'
import { traceBitTargets } from './TraceBitGraph'
import { AvalancheRenderer } from './Avalanche'
import { RenderHost, visualizerCatalog } from './index'

describe('Shared trace visuals', () => {
  it('maps selected bits through shared SPN operation semantics', () => {
    expect(traceBitTargets('key-mix', undefined, 5)).toEqual([5])
    expect(traceBitTargets('substitute', undefined, 5)).toEqual([4, 5, 6, 7])
    expect(traceBitTargets('permute', [0, 2, 1, 3], 9)).toEqual([5])
    expect(traceBitTargets('permute', undefined, 9)).toEqual([])
  })

  it('renders the fixed SPN comparison through shared visuals', () => {
    const graphFor = (value: readonly [number, number]) => ({
      ...teachingSpnGraph,
      nodes: teachingSpnGraph.nodes.map((node) => node.id === 'state'
        ? { ...node, parameters: { ...node.parameters, value: bits(16, Uint8Array.from(value)) } }
        : node),
    })
    const response = executeWorkerRequest({
      requestId: 'shared-visuals',
      kind: 'compare',
      payload: { left: { graph: graphFor([0x12, 0x34]) }, right: { graph: graphFor([0x12, 0x35]) } },
    })
    expect(response.kind).toBe('comparison')
    if (response.kind !== 'comparison') return
    expect(() => render(React.createElement(AvalancheRenderer, {
      comparison: response.comparison,
      dimensions: { width: 1100, height: 700 },
      executionIdentity: 'shared-visuals',
      locale: 'en-US',
      reducedMotion: true,
    }))).not.toThrow()
    const hosted = render(React.createElement(RenderHost, {
      comparison: response.comparison,
      dimensions: { width: 1100, height: 700 },
      executionIdentity: 'shared-visuals-host',
      invocation: { id: 'avalanche@1' },
      locale: 'en-US',
      reducedMotion: true,
    }))
    expect(hosted.queryByRole('alert')).toBeNull()
  })
})

describe('Visualizer Catalog (#32)', () => {
  it('publishes the versioned avalanche contract without importing a renderer', () => {
    const descriptor = visualizerCatalog.get('avalanche@1')

    expect(descriptor).toMatchObject({
      id: 'avalanche',
      major: 1,
      trace: { family: 'comparison', level: 'detail' },
      limits: { bits: 16 },
      dimensions: { minWidth: 900, minHeight: 500 },
      accessibility: { summary: 'avalanche.summary' },
    })
    expect(descriptor?.slots).toEqual({
      comparison: { family: 'avalanche-comparison' },
    })
    expect(visualizerCatalog.get('avalanche@2')).toBeUndefined()
  })

  it('compiles the Teaching SPN YAML fixture through the Catalog', () => {
    const result = compileLesson(teachingSpnDemoDocuments, visualizerCatalog)

    expect(result).toMatchObject({
      ok: true,
      value: {
        steps: [{
          id: 'visualize',
          visualizer: { id: 'teaching-spn@1' },
        }],
      },
    })
    if (!result.ok) return

    expect(visualizerCatalog.get('teaching-spn@1')).toMatchObject({
      limits: { bits: 128 },
      trace: { family: 'execution', level: 'detail' },
    })
    const execution = result.value.graphs['teaching-spn'].execute({
      'state.value': result.value.inputs.plaintext.default,
    })
    expect(execution.ok).toBe(true)
    if (!execution.ok) return
    expect(execution.value.trace.map((event) => 'value' in event && event.value ? [event.path, hex(event.value as never)] : [event.path])).toEqual([
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
  })

  it('runs the Teaching SPN fixture through the Browser Lesson runtime', async () => {
    const previousWorker = globalThis.Worker
    class WorkerStub {
      private listeners: Array<(event: MessageEvent<unknown>) => void> = []

      addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
        if (type === 'message') this.listeners.push(listener)
      }

      postMessage(request: Parameters<typeof executeWorkerRequest>[0]): void {
        queueMicrotask(() => this.listeners.forEach((listener) => listener({ data: executeWorkerRequest(request) } as MessageEvent<unknown>)))
      }

      terminate(): void {}
    }
    globalThis.Worker = WorkerStub as unknown as typeof Worker
    try {
      const session = createBrowserLessonSession(teachingSpnDemoDocuments, 'en-US', visualizerCatalog)
      expect(session.ok).toBe(true)
      if (!session.ok) return
      const result = await session.value.enter()
      expect(result.ok && hex(result.value.snapshots.visualize.outputs['round.2/permute.value'] as never)).toBe('0xcb45')
      session.value.dispose()
    } finally {
      globalThis.Worker = previousWorker
    }
  })

  it('validates one plaintext-change comparison through the Catalog', () => {
    const documents = {
      lesson: `version: 1
id: avalanche
default_locale: en-US
inputs:
  plaintext: {type: {family: bits, size: 16}, encoding: hex, default: "0x0f0f"}
  changed_plaintext: {type: {family: bits, size: 16}, encoding: hex, default: "0x00ff"}
constants:
  key: {type: {family: bits, size: 16}, encoding: hex, value: "0x0f0f"}
graphs:
  teaching-spn:
    nodes:
      - {id: plaintext, operation: core.source@1, parameters: {type: {family: bits, size: 16}}}
      - {id: key, operation: core.source@1, parameters: {type: {family: bits, size: 16}}}
      - {id: output, operation: core.xor@1, inputs: {left: {node: plaintext, port: value}, right: {node: key, port: value}}}
    outputs: [{node: output, port: value}]
    traceLevel: detail
steps:
  - id: compare
    visualizer:
      id: avalanche@1
      compare:
        kind: avalanche
        graph: teaching-spn
        bindings:
          plaintext:
            baseline: {input: plaintext}
            changed: {input: changed_plaintext}
          key: {constant: key}
        traceLevel: detail
`,
      locales: { 'en-US': 'title: Avalanche\nsummary: Compare two executions.\ntexts: {}' },
    }
    const result = compileLesson(documents, visualizerCatalog)

    expect(result).toMatchObject({
      ok: true,
      value: {
        steps: [{
          visualizer: {
            id: 'avalanche@1',
            compare: {
              kind: 'avalanche',
              graph: 'teaching-spn',
              traceLevel: 'detail',
            },
          },
        }],
      },
    })

    for (const lesson of [
      documents.lesson.replace('changed: {input: changed_plaintext}', 'changed: {input: missing}'),
      documents.lesson.replace('key: {constant: key}', 'key: {constant: missing}'),
      documents.lesson.replace(/      compare:[\s\S]*?        traceLevel: detail\n/, ''),
    ]) expect(compileLesson({ ...documents, lesson }, visualizerCatalog).ok).toBe(false)
  })
})
