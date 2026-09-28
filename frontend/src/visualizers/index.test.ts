import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { aesKeyExpansionGraph, alphabetPolicy, alphabetText, bits, executeWorkerRequest, hex, teachingSpnGraph } from '../crypto_graph'
import { teachingSpnDemoDocuments } from '../../demos/teachingSpnLesson'
import { aesKeyExpansionDemoDocuments } from '../../demos/aesKeyExpansionLesson'
import { compileLesson, createBrowserLessonSession } from '../lesson_runtime'
import { traceBitTargets } from './traceFlow'
import { AvalancheRenderer } from './Avalanche'
import { aesKeyExpansionPresentation } from './AesKeyExpansion'
import { classicalCipherPositions } from './ClassicalCipher'
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
      executionIdentity: 'shared-visuals',
      locale: 'en-US',
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

  it('compiles the AES key expansion demo fixture through the Catalog (#83)', () => {
    const result = compileLesson(aesKeyExpansionDemoDocuments, visualizerCatalog)

    expect(result).toMatchObject({
      ok: true,
      value: { steps: [{ id: 'expand-key', visualizer: { id: 'aes-key-expansion@1' } }] },
    })
    if (!result.ok) return

    expect(visualizerCatalog.get('aes-key-expansion@1')).toMatchObject({
      limits: { bits: 128 },
      trace: { family: 'execution', level: 'detail' },
    })
    const execution = result.value.graphs.expand.execute({ 'key.value': result.value.inputs.key.default })
    expect(execution.ok).toBe(true)
    if (!execution.ok) return
    const values = new Map(execution.value.trace.flatMap((event) => 'value' in event && event.value ? [[event.path, hex(event.value as never)]] as const : []))
    expect(values.get('word-0')).toBe('0x00112233')
    expect(values.get('word-7')).toBe('0xe3a44c32')
    expect(values.get('round-key-0')).toBe('0x0011223344556677fd22d728b977b15f')
    expect(values.get('round-key-1')).toBe('0x0aea187eb39da9215039e513e3a44c32')
  })

  it('draws full or partial FIPS-197 copy lineage for every AES-192/256 round key that shares words with the master key (#83)', () => {
    const snapshotFor = (keySize: 192 | 256) => {
      const response = executeWorkerRequest({
        requestId: `r3-${keySize}`,
        kind: 'execute',
        payload: { graph: aesKeyExpansionGraph(keySize), inputs: { 'key.value': bits(keySize, new Uint8Array(keySize / 8).map((_, index) => index)) } },
      })
      expect(response.kind).toBe('snapshot')
      if (response.kind !== 'snapshot') throw new Error('unreachable: execution must succeed')
      return response.snapshot
    }
    const copiedBitsOfRound = (relationships: readonly { readonly to: string }[], round: number): number =>
      relationships.filter((relationship) => relationship.to.startsWith(`round-key-${round}-bit-`)).length

    // AES-192 (Nk=6): round key 0's four words (indices 0-3) are all direct key slices, so all
    // 128 bits copy. Round key 1's words are indices 4-7; only 4 and 5 are direct slices, so
    // only their 64 bits copy - the rest (from RotWord/SubWord/Rcon/XOR) must not appear.
    const relationships192 = aesKeyExpansionPresentation(snapshotFor(192), 'en-US', 'r3-192').keyExpansionLane?.rowsById['word-0']?.relationships ?? []
    expect(copiedBitsOfRound(relationships192, 0)).toBe(128)
    expect(copiedBitsOfRound(relationships192, 1)).toBe(64)

    // AES-256 (Nk=8): both round key 0 and round key 1 are full copies, since Nk=8 spans
    // exactly two round keys' worth of words; round key 2 has none (fully derived).
    const relationships256 = aesKeyExpansionPresentation(snapshotFor(256), 'en-US', 'r3-256').keyExpansionLane?.rowsById['word-0']?.relationships ?? []
    expect(copiedBitsOfRound(relationships256, 0)).toBe(128)
    expect(copiedBitsOfRound(relationships256, 1)).toBe(128)
    expect(copiedBitsOfRound(relationships256, 2)).toBe(0)
  })

  it('omits the key-expansion lane and returns a structured incomplete-trace diagnostic on a truncated trace, rather than fabricating a master key from partial words (#83)', () => {
    const response = executeWorkerRequest({
      requestId: 'r4-truncated',
      kind: 'execute',
      payload: { graph: aesKeyExpansionGraph(128), inputs: { 'key.value': bits(128, new Uint8Array(16)) }, limits: { traceEvents: 3 } },
    })
    expect(response.kind).toBe('snapshot')
    if (response.kind !== 'snapshot') return
    expect(response.snapshot.traceStatus.truncated).toBe(true)
    const presentation = aesKeyExpansionPresentation(response.snapshot, 'en-US', 'r4-truncated')
    expect(presentation.keyExpansionLane).toBeUndefined()
    // Machine-checkable (stable code/path/details), matching how `compile`/`execute` already
    // report invalid key type, key length, missing input, and malformed value - not only the
    // human-readable copy already shown via the trace's own "incomplete" row.
    expect(presentation.diagnostics).toEqual([{
      code: 'aes.key-expansion-trace-incomplete',
      message: expect.any(String),
      path: 'trace',
      details: { retained: response.snapshot.traceStatus.retained, dropped: response.snapshot.traceStatus.dropped },
    }])
  })

  it('runs the AES key expansion demo fixture through the Browser Lesson runtime and renders both the trace and its key-expansion lane from one execution (#83)', async () => {
    // Rendering two 128-bit lane rows as individual bit buttons is more DOM work than the
    // file's other worker-backed tests; give it more room than the 5s default. Observed up to
    // ~24s under full-suite contention (many test files/workers competing for CPU), so the
    // margin here is generous rather than tuned to an isolated run's faster time.
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
      const session = createBrowserLessonSession(aesKeyExpansionDemoDocuments, 'en-US', visualizerCatalog)
      expect(session.ok).toBe(true)
      if (!session.ok) return
      const result = await session.value.enter()
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const execution = result.value.snapshots['expand-key']
      expect(hex(execution.outputs['round-key-0.value'] as never)).toBe('0x0011223344556677fd22d728b977b15f')

      const user = userEvent.setup()
      render(React.createElement(RenderHost, {
        dimensions: { width: 1100, height: 700 },
        execution,
        executionIdentity: 'aes-key-expansion',
        invocation: { id: 'aes-key-expansion@1' },
        locale: 'en-US',
        reducedMotion: true,
      }))
      expect(screen.queryByRole('region', { name: 'Key expansion' })).toBeNull()
      await user.click(screen.getByRole('button', { name: /Round key 0/ }))
      const lane = screen.getByRole('region', { name: 'Key expansion' })
      expect(lane).toBeVisible()
      // The master key's first byte (0x00) and round key 0's first byte (0x00) are a direct
      // FIPS-197 copy, so bit 7 of both is 0.
      expect(screen.getByRole('button', { name: /Master key, Bit 7/ })).toBeVisible()

      // Blocking R1 (#83 review): the open lane covers every row's control cell (needed to
      // cover State flow/Operation detail while open), including other round keys' own chips, so
      // moving the highlight to another round key must work through the lane's own copy of that
      // chip - there is exactly one of each chip in the DOM at a time (the trace table's copy
      // hides once its lane counterpart takes over), not the now-covered original.
      expect(screen.getByRole('button', { name: /^Round key 0:/ })).toHaveAttribute('aria-pressed', 'true')
      await user.click(screen.getByRole('button', { name: /^Round key 1:/ }))
      expect(screen.getByRole('button', { name: /^Round key 1:/ })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: /^Round key 0:/ })).toHaveAttribute('aria-pressed', 'false')
      expect(lane).toBeVisible()
      session.value.dispose()
    } finally {
      globalThis.Worker = previousWorker
    }
  }, 45_000)

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

  it('maps classical cipher positions and disables movement in reduced-motion mode', () => {
    const mapping = { id: 'latin', symbols: [...'ABC'] }
    const input = alphabetText(mapping, 'Ab')
    const output = alphabetText(mapping, 'Cb')
    expect(classicalCipherPositions(input, output, mapping)).toEqual([
      { input: 'A', output: 'C', sourcePosition: 0, targetPosition: 2, mapped: true },
      { input: 'b', output: 'b', mapped: false },
    ])
    const rendered = render(React.createElement(RenderHost, {
      invocation: { id: 'classical-cipher@1' },
      dimensions: { width: 600, height: 240 },
      executionIdentity: 'classical-cipher',
      locale: 'en-US',
      reducedMotion: true,
      classicalCipher: { input, output, mapping, policy: alphabetPolicy('preserve'), policyLabel: 'Preserve unmapped characters' },
    }))
    expect(rendered.getByLabelText('Classical cipher position mapping')).toBeVisible()
    expect(rendered.getByText('Unmapped')).toBeVisible()
  })
})
