import { describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { aesCipherGraph, aesInverseCipherGraph, aesKeyExpansionGraph, alphabetPolicy, alphabetText, bits, executeWorkerRequest, hex, integer, teachingSpnGraph, type AlphabetTextValue, type TraceEvent, type TraceCheckpoint } from '../crypto_graph'
import { teachingSpnDemoDocuments } from '../../demos/teachingSpnLesson'
import { aesKeyExpansionDemoDocuments } from '../../demos/aesKeyExpansionLesson'
import { aesCipherDemoDocuments } from '../../demos/aes128CipherLesson'
import { substitutionCipherDemoDocuments, vigenereCipherDemoDocuments } from '../../demos/classicalCipherLessons'
import { compileLesson, createBrowserLessonSession } from '../lesson_runtime'
import { traceBitTargets } from './traceFlow'
import { AvalancheRenderer } from './Avalanche'
import { blockCipherPresentation, type BlockCipherPresentationMeta } from './BlockCipher'
import { executionTracePresentation } from './ExecutionTrace'
import { keyExpansionPresentation } from './KeyExpansion'
import { classicalCipherPositions } from './ClassicalCipher'
import { RenderHost, visualizerCatalog } from './index'

/** Sync Worker stand-in for Browser Lesson session tests; routes to executeWorkerRequest. */
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

/** Runs one direction's AES demo Lesson through the Browser Lesson runtime: one execution, no other Step. */
const runCipherDemo = async (variant: 128 | 192 | 256, direction: 'encrypt' | 'decrypt') => {
  const previousWorker = globalThis.Worker
  globalThis.Worker = WorkerStub as unknown as typeof Worker
  try {
    const session = createBrowserLessonSession(aesCipherDemoDocuments(variant), 'en-US', visualizerCatalog)
    if (!session.ok) throw new Error(session.diagnostics[0]?.message)
    // Advance to enter-input, then to the target direction step
    await session.value.next()
    const targetIndex = direction === 'encrypt' ? 1 : 2
    while (session.value.state().stepIndex < targetIndex) {
      await session.value.next()
    }
    const state = session.value.state()
    const presentation = session.value.lesson.steps.find((step) => step.id === direction)?.presentation
    session.value.dispose()
    return { snapshot: state.snapshots[direction], presentation }
  } finally {
    globalThis.Worker = previousWorker
  }
}

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

  it('retains only descriptors with distinct contracts and compiles the teaching key-schedule demo with generic presentation metadata (#93)', () => {
    expect(visualizerCatalog.get('aes-key-expansion@1')).toBeUndefined()
    expect(visualizerCatalog.get('aes-cipher@1')).toBeUndefined()
    const result = compileLesson(aesKeyExpansionDemoDocuments, { get: () => undefined })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.steps.map((step) => [step.id, step.visualizer, step.presentation])).toEqual([['expand-key', undefined, { kind: 'key-expansion', algorithm: 'AES', variant: 128 }]])
    const execution = result.value.graphs.expand.execute({ 'key.value': result.value.inputs.key.default })
    expect(execution.ok).toBe(true)
    if (!execution.ok) return
    const values = new Map(execution.value.trace.flatMap((event) => 'value' in event && event.value ? [[event.path, hex(event.value as never)]] as const : []))
    expect(values.get('word-0')).toBe('0x00112233')
    expect(values.get('word-7')).toBe('0xe3a44c32')
    expect(values.get('round-key-0')).toBe('0x0011223344556677fd22d728b977b15f')
    expect(values.get('round-key-1')).toBe('0x0aea187eb39da9215039e513e3a44c32')
  })

  it('renders the teaching key-schedule trace with generic key-expansion presentation metadata (#93)', async () => {
    const previousWorker = globalThis.Worker
    globalThis.Worker = WorkerStub as unknown as typeof Worker
    try {
      const session = createBrowserLessonSession(aesKeyExpansionDemoDocuments, 'zh-CN', visualizerCatalog)
      expect(session.ok).toBe(true)
      if (!session.ok) return
      const result = await session.value.enter()
      session.value.dispose()
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const execution = result.value.snapshots['expand-key']
      expect(execution.trace.some((event) => 'word' in event && event.word !== undefined)).toBe(true)

      const presentation = keyExpansionPresentation(execution, 'en-US', 'teaching-schedule', { algorithm: 'AES', variant: 128 })
      expect(presentation.sections[0].rows.map((row) => row.id)).toEqual([
        'input',
        'rot-word-0', 'sub-word-0', 'rcon-0', 'xor-0',
        'round-key-0',
        'rot-word-1', 'sub-word-1', 'rcon-1', 'xor-1',
        'rot-word-1-w6', 'sub-word-1-w6', 'rcon-1-w6', 'xor-1-w6',
        'round-key-1',
      ])

      render(React.createElement(RenderHost, {
        dimensions: { width: 1100, height: 700 },
        execution,
        executionIdentity: 'teaching-schedule',
        locale: 'zh-CN',
        presentation: { kind: 'key-expansion', algorithm: 'AES', variant: 128 },
        reducedMotion: true,
      }))
      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.getByRole('heading', { name: 'AES 风格教学密钥编排（64 位密钥，非 FIPS-197 变体）' })).toBeVisible()
      expect(screen.queryByRole('heading', { name: 'AES-128 密钥扩展' })).toBeNull()
      expect(screen.getByRole('row', { name: '轮密钥 0 0 0x0011223344556677fd22d728b977b15f' })).toBeVisible()
      expect(screen.getByRole('rowheader', { name: '输入' })).toBeVisible()
      expect(screen.getByRole('rowheader', { name: '字循环移位 0' })).toBeVisible()
      expect(screen.getByRole('rowheader', { name: '字替换 0' })).toBeVisible()
      expect(screen.getByRole('rowheader', { name: '轮常量 0' })).toBeVisible()
      expect(screen.getByRole('rowheader', { name: '异或 0' })).toBeVisible()
      // Nk=2: words 4 and 6 both feed round key 1, so the second iteration is named by its word.
      expect(screen.getByRole('rowheader', { name: '字循环移位 1' })).toBeVisible()
      expect(screen.getByRole('rowheader', { name: '字循环移位 1 (字 6)' })).toBeVisible()
      // Full 64-bit Nk=2 state, not a 128-bit frame inferred from the variant label.
      expect(presentation.sections[0].rows.find((row) => row.id === 'input')?.selectableBits).toHaveLength(64)
      expect(screen.queryByRole('region', { name: '密钥扩展' })).toBeNull()
    } finally {
      globalThis.Worker = previousWorker
    }
  }, 120_000)

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

describe('AES-128 encryption and decryption (#84)', () => {
  it('compiles a single AES-128 Lesson with expand-key, encrypt and decrypt steps, executing the key schedule once and sharing it across cipher directions, and matches the FIPS-197 C.1 vector', () => {
    const result = compileLesson(aesCipherDemoDocuments(128), { get: () => undefined })
    if (!result.ok) throw new Error(result.diagnostics[0]?.message)
    expect(result.value.steps.map((step) => [step.id, step.visualizer])).toEqual([['enter-input', undefined], ['expand-key', undefined], ['encrypt', undefined], ['decrypt', undefined]])
    expect(Object.keys(result.value.graphs)).toEqual(['expand', 'encrypt', 'decrypt'])

    // Verify that expand graph computes round keys (has aes.round-key operations)
    const expandGraph = result.value.graphs.expand.graph
    const expandRoundKeyNodes = expandGraph.nodes.filter(n => n.id.startsWith('round-key-'))
    expect(expandRoundKeyNodes.length).toBe(11)
    expect(expandRoundKeyNodes.every(n => n.operation === 'aes.round-key@1')).toBe(true)

    // Verify that encrypt/decrypt graphs receive round keys as inputs (have core.source operations)
    const encryptGraph = result.value.graphs.encrypt.graph
    const encryptRoundKeyNodes = encryptGraph.nodes.filter(n => n.id.startsWith('round-key-'))
    expect(encryptRoundKeyNodes.length).toBe(11)
    expect(encryptRoundKeyNodes.every(n => n.operation === 'core.source@1')).toBe(true)

    const decryptGraph = result.value.graphs.decrypt.graph
    const decryptRoundKeyNodes = decryptGraph.nodes.filter(n => n.id.startsWith('round-key-'))
    expect(decryptRoundKeyNodes.length).toBe(11)
    expect(decryptRoundKeyNodes.every(n => n.operation === 'core.source@1')).toBe(true)

    const schedule = result.value.graphs.expand.execute({ 'key.value': result.value.inputs.key.default })
    expect(schedule.ok).toBe(true)
    if (!schedule.ok) return

    const encryption = result.value.graphs.encrypt.execute({
      'plaintext.value': result.value.inputs.plaintext.default,
      ...Object.fromEntries(Array.from({ length: 11 }, (_, r) => [`round-key-${r}.value`, schedule.value.outputs[`round-key-${r}.value`]])),
    })
    expect(encryption.ok).toBe(true)
    if (!encryption.ok) return
    expect(hex(encryption.value.outputs['cipher-10-add-round-key.value'] as never)).toBe('0x69c4e0d86a7b0430d8cdb78070b4c55a')

    expect(hex(result.value.inputs.ciphertext.default as never)).toBe('0x69c4e0d86a7b0430d8cdb78070b4c55a')
    const decryption = result.value.graphs.decrypt.execute({
      'ciphertext.value': result.value.inputs.ciphertext.default,
      ...Object.fromEntries(Array.from({ length: 11 }, (_, r) => [`round-key-${r}.value`, schedule.value.outputs[`round-key-${r}.value`]])),
    })
    expect(decryption.ok).toBe(true)
    if (!decryption.ok) return
    expect(hex(decryption.value.outputs['cipher-0-add-round-key.value'] as never)).toBe('0x00112233445566778899aabbccddeeff')
  })

  it('returns a structured incomplete-trace diagnostic on a truncated cipher trace, not only the human-readable gap row (#84)', () => {
    const zeroRoundKeys = Object.fromEntries(Array.from({ length: 11 }, (_, round) => [`round-key-${round}.value`, bits(128, new Uint8Array(16))]))
    const response = executeWorkerRequest({
      requestId: 'r4-cipher-truncated',
      kind: 'execute',
      payload: {
        graph: aesCipherGraph(),
        inputs: { 'plaintext.value': bits(128, new Uint8Array(16)), ...zeroRoundKeys },
        limits: { traceEvents: 3 },
      },
    })
    expect(response.kind).toBe('snapshot')
    if (response.kind !== 'snapshot') return
    expect(response.snapshot.traceStatus.truncated).toBe(true)
    const presentation = blockCipherPresentation(response.snapshot, 'en-US', 'r4-cipher-truncated', { algorithm: 'AES', variant: 128, direction: 'encrypt' })
    // Machine-checkable (stable code/path/details), not only the human-readable "raw" gap row
    // rendered alongside it.
    expect(presentation.diagnostics).toEqual([{
      code: 'aes.cipher-trace-incomplete',
      message: expect.any(String),
      path: 'trace',
      details: { retained: response.snapshot.traceStatus.retained, dropped: response.snapshot.traceStatus.dropped },
    }])
  })

  it('shows each round key right before the AddRoundKey that uses it', () => {
    const zeroRoundKeys = Object.fromEntries(Array.from({ length: 11 }, (_, round) => [`round-key-${round}.value`, bits(128, new Uint8Array(16))]))
    const labels = (graph: ReturnType<typeof aesCipherGraph>, input: string) => {
      const response = executeWorkerRequest({ requestId: 'order', kind: 'execute', payload: { graph, inputs: { [input]: bits(128, new Uint8Array(16)), ...zeroRoundKeys } } })
      if (response.kind !== 'snapshot') throw new Error('unreachable: execution must succeed')
      return executionTracePresentation(response.snapshot, 'en-US', 'order').sections[0].rows.map((row) => row.label)
    }
    expect(labels(aesCipherGraph(), 'plaintext.value').slice(0, 8)).toEqual([
      'Plaintext input', 'Round key 0', 'AddRoundKey 0', 'SubBytes 1', 'ShiftRows 1', 'MixColumns 1', 'Round key 1', 'AddRoundKey 1',
    ])
    expect(labels(aesInverseCipherGraph(), 'ciphertext.value').slice(0, 6)).toEqual([
      'Ciphertext input', 'Round key 10', 'AddRoundKey 10', 'InvShiftRows 9', 'InvSubBytes 9', 'Round key 9',
    ])
  })

  it('returns a generic incomplete-trace diagnostic and gap row for a truncated descriptor-free trace', () => {
    const zeroRoundKeys = Object.fromEntries(Array.from({ length: 11 }, (_, round) => [`round-key-${round}.value`, bits(128, new Uint8Array(16))]))
    const response = executeWorkerRequest({
      requestId: 'generic-cipher-truncated',
      kind: 'execute',
      payload: {
        graph: aesCipherGraph(),
        inputs: { 'plaintext.value': bits(128, new Uint8Array(16)), ...zeroRoundKeys },
        limits: { traceEvents: 3 },
      },
    })
    expect(response.kind).toBe('snapshot')
    if (response.kind !== 'snapshot') return
    expect(executionTracePresentation(response.snapshot, 'en-US', 'generic').diagnostics).toEqual([{
      code: 'trace.incomplete',
      message: expect.any(String),
      path: 'trace',
      details: { retained: 3, dropped: response.snapshot.traceStatus.dropped },
    }])
    render(React.createElement(RenderHost, {
      dimensions: { width: 320, height: 200 },
      execution: response.snapshot,
      executionIdentity: 'generic-cipher-truncated',
      locale: 'zh-CN',
      reducedMotion: true,
    }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('row', { name: /^明文输入 — 0x0{32}$/ })).toBeVisible()
    expect(screen.getByRole('row', { name: /^轮密钥 0 0 0x0{32}$/ })).toBeVisible()
    expect(screen.getByRole('row', { name: /^轮密钥加 0 0 0x0{32}$/ })).toBeVisible()
    expect(screen.getAllByText('轨迹缺口').length).toBeGreaterThan(0)
    expect(screen.queryByRole('row', { name: /输出/ })).toBeNull()
  })

  it('runs the AES-128 cipher demo fixture through the Browser Lesson runtime and renders both directions through the shared trace table', async () => {
    const previousWorker = globalThis.Worker
    globalThis.Worker = WorkerStub as unknown as typeof Worker
    try {
      const session = createBrowserLessonSession(aesCipherDemoDocuments(128), 'en-US', visualizerCatalog)
      expect(session.ok).toBe(true)
      if (!session.ok) return
      await session.value.next() // enter-input -> expand-key
      await session.value.next() // expand-key -> encrypt
      const decrypted = await session.value.next() // encrypt -> decrypt
      expect(decrypted.ok).toBe(true)
      if (!decrypted.ok) return

      const encryptSnapshot = decrypted.value.snapshots.encrypt
      const decryptSnapshot = decrypted.value.snapshots.decrypt
      expect(hex(encryptSnapshot.outputs['cipher-10-add-round-key.value'] as never)).toBe('0x69c4e0d86a7b0430d8cdb78070b4c55a')
      expect(hex(decryptSnapshot.outputs['cipher-0-add-round-key.value'] as never)).toBe('0x00112233445566778899aabbccddeeff')

      // Mirror LearningPage: pass the compiled step.presentation through RenderHost.
      const encryptPresentation = session.value.lesson.steps.find((step) => step.id === 'encrypt')?.presentation
      const decryptPresentation = session.value.lesson.steps.find((step) => step.id === 'decrypt')?.presentation
      expect(encryptPresentation).toEqual({ kind: 'block-cipher', algorithm: 'AES', variant: 128, direction: 'encrypt' })
      expect(decryptPresentation).toEqual({ kind: 'block-cipher', algorithm: 'AES', variant: 128, direction: 'decrypt' })

      const encrypted = blockCipherPresentation(encryptSnapshot, 'en-US', 'aes-cipher-encrypt', encryptPresentation as BlockCipherPresentationMeta)
      const encryptedRow = (id: string) => encrypted.sections[0].rows.find((row) => row.id === id)
      expect(encrypted.title).toBe('AES-128 encryption')
      expect(encryptedRow('cipher-1-sub-bytes')).toMatchObject({ label: 'SubBytes 1', cells: [{ value: 1 }, { value: expect.stringMatching(/^0x/) }] })
      expect(encryptedRow('output')).toMatchObject({ label: 'Output', cells: [{ value: '—' }, { value: '0x69c4e0d86a7b0430d8cdb78070b4c55a' }] })
      expect(encryptedRow('cipher-10-mix-columns')).toBeUndefined()

      const decryptedView = blockCipherPresentation(decryptSnapshot, 'zh-CN', 'aes-cipher-decrypt', decryptPresentation as BlockCipherPresentationMeta)
      const decryptedRow = (id: string) => decryptedView.sections[0].rows.find((row) => row.id === id)
      expect(decryptedView.title).toBe('AES-128 解密')
      expect(decryptedRow('ciphertext')).toMatchObject({ label: '密文输入', cells: [{ value: '—' }, { value: '0x69c4e0d86a7b0430d8cdb78070b4c55a' }] })
      expect(decryptedRow('cipher-1-inv-sub-bytes')?.label).toBe('逆字节替换 1')

      // Without presentation metadata the same execution renders the generic default view:
      // cipher state rows, no schedule word rows (because schedule is now executed separately).
      const generic = render(React.createElement(RenderHost, {
        dimensions: { width: 900, height: 500 },
        execution: encryptSnapshot,
        executionIdentity: 'aes-cipher-generic',
        locale: 'en-US',
        reducedMotion: true,
      }))
      expect(generic.getByRole('heading', { name: 'Execution trace' })).toBeVisible()
      expect(generic.getByRole('row', { name: /^SubBytes 1 1 0x/ })).toBeVisible()
      expect(generic.queryByRole('rowheader', { name: /^(Word XOR|RotWord|SubWord|Rcon)/ })).toBeNull()

      // The expand-key step contains key schedule words; without presentation metadata
      // it renders generic trace with the missing-mode diagnostic. Word rows are filtered
      // out in generic view (only non-word events are shown).
      const keyScheduleSnapshot = decrypted.value.snapshots['expand-key']
      const scheduleGeneric = render(React.createElement(RenderHost, {
        dimensions: { width: 900, height: 500 },
        execution: keyScheduleSnapshot,
        executionIdentity: 'key-schedule-generic',
        locale: 'en-US',
        reducedMotion: true,
      }))
      expect(scheduleGeneric.getByText(/declares no key-expansion presentation/)).toBeVisible()
      // Word events are filtered in generic view, so no Word XOR rowheaders
      expect(scheduleGeneric.queryByRole('rowheader', { name: /^Word XOR/ })).toBeNull()
      session.value.dispose()
    } finally {
      globalThis.Worker = previousWorker
    }
  })
})

describe('AES-192/256 Lesson paths (#85)', () => {
  const kat = {
    192: { ciphertext: 'dda97ca4864cdfe06eaf70a0ec0d7191', rounds: 12 },
    256: { ciphertext: '8ea2b7ca516745bfeafc49904b496089', rounds: 14 },
  } as const

  for (const variant of [192, 256] as const) {
    it(`compiles and runs the AES-${variant} demo through the Browser Lesson runtime with variant labels`, async () => {
      const previousWorker = globalThis.Worker
      globalThis.Worker = WorkerStub as unknown as typeof Worker
      try {
        const session = createBrowserLessonSession(aesCipherDemoDocuments(variant), 'en-US', visualizerCatalog)
        expect(session.ok).toBe(true)
        if (!session.ok) return
        await session.value.next() // enter-input -> expand-key
        await session.value.next() // expand-key -> encrypt
        const decrypted = await session.value.next() // encrypt -> decrypt
        expect(decrypted.ok).toBe(true)
        if (!decrypted.ok) return

        const encryptSnapshot = decrypted.value.snapshots.encrypt
        const decryptSnapshot = decrypted.value.snapshots.decrypt
        expect(hex(encryptSnapshot.outputs[`cipher-${kat[variant].rounds}-add-round-key.value`] as never)).toBe(`0x${kat[variant].ciphertext}`)
        expect(hex(decryptSnapshot.outputs['cipher-0-add-round-key.value'] as never)).toBe('0x00112233445566778899aabbccddeeff')

        const encrypted = blockCipherPresentation(encryptSnapshot, 'en-US', `aes-${variant}-encrypt`, { algorithm: 'AES', variant, direction: 'encrypt' })
        expect(encrypted.title).toBe(`AES-${variant} encryption`)
        expect(encrypted.sections[0].rows.find((row) => row.id === 'cipher-1-sub-bytes')?.label).toBe('SubBytes 1')
        expect(encrypted.sections[0].rows.at(-1)).toMatchObject({ label: 'Output', cells: [{ value: '—' }, { value: `0x${kat[variant].ciphertext}` }] })

        const decryptedView = blockCipherPresentation(decryptSnapshot, 'zh-CN', `aes-${variant}-decrypt`, { algorithm: 'AES', variant, direction: 'decrypt' })
        expect(decryptedView.title).toBe(`AES-${variant} 解密`)
        expect(decryptedView.sections[0].rows[0]).toMatchObject({ label: '密文输入', cells: [{ value: '—' }, { value: `0x${kat[variant].ciphertext}` }] })
        session.value.dispose()
      } finally {
        globalThis.Worker = previousWorker
      }
    })
  }

  it('keeps aes.cipher-trace-incomplete on truncated BlockCipher presentation and never labels 192/256 as AES-128', () => {
    const zeroRoundKeys = Object.fromEntries(Array.from({ length: 13 }, (_, round) => [`round-key-${round}.value`, bits(128, new Uint8Array(16))]))
    const response = executeWorkerRequest({
      requestId: 'aes-192-truncated',
      kind: 'execute',
      payload: {
        graph: aesCipherGraph(192),
        inputs: { 'plaintext.value': bits(128, new Uint8Array(16)), ...zeroRoundKeys },
        limits: { traceEvents: 3 },
      },
    })
    expect(response.kind).toBe('snapshot')
    if (response.kind !== 'snapshot') return
    const presentation = blockCipherPresentation(
      response.snapshot,
      'en-US',
      'aes-192-truncated',
      { algorithm: 'AES', variant: 192, direction: 'encrypt' },
    )
    expect(presentation.title).toBe('AES-192 encryption')
    expect(presentation.title).not.toContain('AES-128')
    expect(presentation.diagnostics).toEqual([{
      code: 'aes.cipher-trace-incomplete',
      message: expect.any(String),
      path: 'trace',
      details: { retained: response.snapshot.traceStatus.retained, dropped: response.snapshot.traceStatus.dropped },
    }])
    render(React.createElement(RenderHost, {
      dimensions: { width: 320, height: 200 },
      execution: response.snapshot,
      executionIdentity: 'aes-192-truncated',
      presentation: { kind: 'block-cipher', algorithm: 'AES', variant: 192, direction: 'encrypt' },
      locale: 'en-US',
      reducedMotion: true,
    }))
    expect(screen.getByRole('heading', { name: 'AES-192 encryption' })).toBeVisible()
    expect(screen.getByRole('row', { name: /^Plaintext input — 0x0{32} / })).toBeVisible()
    expect(screen.getAllByText('Trace gap').length).toBeGreaterThan(0)
  })
})

describe('Classical substitution and Vigenere Lessons (#87)', () => {
  it('compiles bilingual synthetic Lessons and runs both through classical-cipher@1', async () => {
    const previousWorker = globalThis.Worker
    globalThis.Worker = WorkerStub as unknown as typeof Worker
    try {
      for (const documents of [substitutionCipherDemoDocuments, vigenereCipherDemoDocuments]) {
        const compiled = compileLesson(documents, visualizerCatalog)
        expect(compiled.ok).toBe(true)
        if (!compiled.ok) continue
        expect(Object.keys(compiled.value.locales)).toEqual(['en-US', 'zh-CN'])
        expect(compiled.value.inputs.direction.type).toEqual({ family: 'alphabet-direction' })
        expect(compiled.value.steps[1].visualizer).toMatchObject({ id: 'classical-cipher@1' })
        const english = createBrowserLessonSession(documents, 'en-US', visualizerCatalog)
        expect(english.ok).toBe(true)
        if (!english.ok) continue
        const englishRun = await english.value.next()
        expect(englishRun.ok && englishRun.value.locale).toBe('en-US')
        expect(englishRun.ok && englishRun.value.snapshots.encrypt).toBeDefined()
        english.value.dispose()
        const session = createBrowserLessonSession(documents, 'zh-CN', visualizerCatalog)
        expect(session.ok).toBe(true)
        if (!session.ok) continue
        const result = await session.value.next()
        expect(result.ok).toBe(true)
        const expectedPlaintext = documents === substitutionCipherDemoDocuments ? 'ABC XYZ!' : 'ATTACK AT DAWN!'
        const expectedCiphertext = documents === substitutionCipherDemoDocuments ? 'QWE BNM!' : 'KXRKGI KX BKAL!'
        expect(result.ok && result.value.snapshots.encrypt?.outputs['cipher.text']).toMatchObject({ symbols: [...expectedCiphertext] })
        expect(result.ok && result.value.executionIdentities.encrypt).toBeDefined()
        if (!result.ok) continue
        const encrypt = result.value.snapshots.encrypt
        if (!encrypt) continue
        const input = result.value.inputs.plaintext
        const output = encrypt.outputs['cipher.text']
        if (typeof input === 'string' || !('symbols' in input) || !('symbols' in output)) continue
        render(React.createElement(RenderHost, {
          invocation: { id: 'classical-cipher@1' },
          dimensions: { width: 600, height: 240 },
          execution: encrypt,
          executionIdentity: 'classical-encrypt',
          locale: 'en-US',
          reducedMotion: true,
          classicalCipher: {
            input: input as AlphabetTextValue,
            output: output as AlphabetTextValue,
            mapping: compiled.value.graphs.cipher.graph.alphabetMappings![0],
            policy: result.value.inputs.policy as ReturnType<typeof alphabetPolicy>,
            policyLabel: 'Preserve unmapped characters',
          },
        }))
        expect(screen.getByLabelText('Classical cipher position mapping')).toBeVisible()
        expect(screen.getByText('Preserve unmapped characters')).toBeVisible()
        expect(screen.getAllByText('[space] → [space]').length).toBeGreaterThan(0)
        const firstReel = screen.getAllByLabelText(`A moves 0 ${documents === substitutionCipherDemoDocuments ? 16 : 10}`)[0].firstElementChild
        expect(firstReel).toHaveStyle({ flexDirection: 'column', transform: `translateY(-${documents === substitutionCipherDemoDocuments ? 32 : 20}rem)` })
        const decrypted = await session.value.next()
        expect(decrypted.ok && decrypted.value.snapshots.decrypt?.outputs['cipher.text']).toMatchObject({ symbols: [...expectedPlaintext] })
        expect(decrypted.ok && decrypted.value.inputs.direction).toMatchObject({ value: 'encrypt' })
        session.value.setInput('plaintext', 'CHANGED')
        expect(session.value.state().snapshots).toEqual({})
        session.value.setInput('direction', 'decrypt')
        expect(session.value.state().snapshots).toEqual({})
        session.value.dispose()
        cleanup()
      }
    } finally {
      globalThis.Worker = previousWorker
    }
  })
})

describe('Descriptor-free generic traces (ADR 0006)', () => {
  it('renders an ordinary SPN trace as semantic rows with operation details and no lineage controls', () => {
    const response = executeWorkerRequest({ requestId: 'generic-spn', kind: 'execute', payload: { graph: teachingSpnGraph } })
    expect(response.kind).toBe('snapshot')
    if (response.kind !== 'snapshot') return
    render(React.createElement(RenderHost, {
      dimensions: { width: 900, height: 500 },
      execution: response.snapshot,
      executionIdentity: 'generic-spn',
      locale: 'en-US',
      reducedMotion: true,
    }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('columnheader', { name: 'Operation detail' })).toBeVisible()
    expect(screen.getByRole('row', { name: /^Key mixing 1 1 0x/ })).toBeVisible()
    expect(screen.getByRole('row', { name: /^Substitution 1 1 0x\w+ S-box: / })).toBeVisible()
    expect(screen.getByRole('row', { name: /^Permutation 1 1 0x\w+ 0 → 0/ })).toBeVisible()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders an ordinary classical trace with retained output text and no registered descriptor', () => {
    const response = executeWorkerRequest({
      requestId: 'generic-caesar',
      kind: 'execute',
      payload: {
        graph: {
          alphabetMappings: [{ id: 'latin', symbols: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'] }],
          nodes: [
            { id: 'text', operation: 'core.source@1', parameters: { type: { family: 'alphabet-text', mapping: 'latin' } } },
            { id: 'shift', operation: 'core.source@1', parameters: { type: { family: 'integer', signed: true, safe: true } } },
            { id: 'policy', operation: 'core.source@1', parameters: { type: { family: 'alphabet-policy' } } },
            { id: 'cipher', operation: 'classical.caesar@1', inputs: { text: { node: 'text', port: 'value' }, shift: { node: 'shift', port: 'value' }, policy: { node: 'policy', port: 'value' } } },
          ],
          outputs: [{ node: 'cipher', port: 'text' }],
        },
        inputs: {
          'text.value': alphabetText({ id: 'latin', symbols: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'] }, 'ABC'),
          'shift.value': integer(3),
          'policy.value': alphabetPolicy('preserve'),
        },
      },
    })
    expect(response.kind).toBe('snapshot')
    if (response.kind !== 'snapshot') return
    render(React.createElement(RenderHost, {
      dimensions: { width: 320, height: 200 },
      execution: response.snapshot,
      executionIdentity: 'generic-caesar',
      locale: 'zh-CN',
      reducedMotion: true,
    }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('heading', { name: '执行轨迹' })).toBeVisible()
    expect(screen.getByRole('row', { name: '输出 (cipher.text) — DEF' })).toBeVisible()
    expect(screen.getByRole('row', { name: '轨迹值 (shift.value) — —' })).toBeVisible()
  })

  it('renders an ordinary XOR trace with the actual left/right fixture', () => {
    const response = executeWorkerRequest({
      requestId: 'generic-xor',
      kind: 'execute',
      payload: {
        graph: {
          nodes: [
            { id: 'input', operation: 'core.source@1', parameters: { type: { family: 'bits', size: 8 } } },
            { id: 'key', operation: 'core.source@1', parameters: { type: { family: 'bits', size: 8 } } },
            { id: 'xor', operation: 'core.xor@1', inputs: { left: { node: 'input', port: 'value' }, right: { node: 'key', port: 'value' } } },
          ],
          outputs: [{ node: 'xor', port: 'value' }],
        },
        inputs: {
          'input.value': { type: { family: 'bits', size: 8 }, bytes: new Uint8Array([0b10101010]) },
          'key.value': { type: { family: 'bits', size: 8 }, bytes: new Uint8Array([0b11110000]) },
        },
      },
    })
    expect(response.kind).toBe('snapshot')
    if (response.kind !== 'snapshot') return
    render(React.createElement(RenderHost, { dimensions: { width: 320, height: 200 }, execution: response.snapshot, executionIdentity: 'generic-xor', locale: 'zh-CN', reducedMotion: true }))
    expect(screen.getByRole('row', { name: '输出 (xor.value) — 0x5a' })).toBeVisible()
  })
})

describe('Full-state AES key-schedule detail (#91)', () => {
  const vectors = {
    128: { key: '000102030405060708090a0b0c0d0e0f', lastRoundKey: '13111d7fe3944a17f307a78b4d2b30c5', rounds: 10 },
    192: { key: '000102030405060708090a0b0c0d0e0f1011121314151617', lastRoundKey: 'a4970a331a78dc09c418c271e3a41d5d', rounds: 12 },
    256: { key: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', lastRoundKey: '24fc79ccbf0979e9371ac23c6d68de36', rounds: 14 },
  } as const

  const expandThroughSession = async (variant: 128 | 192 | 256) => {
    const previousWorker = globalThis.Worker
    globalThis.Worker = WorkerStub as unknown as typeof Worker
    try {
      const session = createBrowserLessonSession(aesCipherDemoDocuments(variant), 'en-US', visualizerCatalog)
      if (!session.ok) throw new Error(session.diagnostics[0]?.message)
      const result = await session.value.next() // enter-input -> expand-key
      session.value.dispose()
      if (!result.ok) throw new Error(result.diagnostics[0]?.message)
      return result.value.snapshots['expand-key']
    } finally {
      globalThis.Worker = previousWorker
    }
  }

  for (const variant of [128, 192, 256] as const) {
    it(`presents the real AES-${variant} schedule as complete bit<${variant}> operation rows with real lineage`, async () => {
      const execution = await expandThroughSession(variant)
      const presentation = keyExpansionPresentation(execution, 'en-US', `aes-${variant}`, { algorithm: 'AES', variant })
      const isRoundKey = (row: { readonly id: string }) => /^round-key-\d+$/.test(row.id)
      const rows = presentation.sections[0].rows.filter((row) => !isRoundKey(row))
      const roundKeyRows = presentation.sections[0].rows.filter(isRoundKey)
      const nk = variant / 32

      expect(presentation.initialSelection).toBeUndefined()
      expect(roundKeyRows.map((row) => row.label)).toEqual(Array.from({ length: vectors[variant].rounds + 1 }, (_, round) => `Round key ${round}`))
      const all = presentation.sections[0].rows
      expect(all[all.indexOf(roundKeyRows[0]) - 1].id).toBe('input')
      expect(all.at(-1)).toBe(roundKeyRows.at(-1))
      // Standalone key expansion: no overlay and no round-key chips.
      expect(presentation.keyExpansionLane).toBeUndefined()
      expect(all.some((row) => row.selectableKey)).toBe(false)
      expect(rows.every((row) => row.selectableBits?.length === variant && String(row.cells[1].value).length === variant / 4 + 2)).toBe(true)
      expect(rows.every((row) => /^(Input|RotWord \d+|SubWord \d+|Rcon \d+|XOR \d+)$/.test(row.label))).toBe(true)
      expect(rows[0]).toMatchObject({ label: 'Input', cells: [{ value: '—' }, { value: `0x${vectors[variant].key}` }] })
      expect(String(rows.at(-1)!.cells[1].value).slice(2, 34)).toBe(vectors[variant].lastRoundKey)
      expect(rows.filter((row) => row.label.startsWith('Rcon'))).toHaveLength(Math.ceil((4 * (vectors[variant].rounds + 1) - nk) / nk))

      for (const row of rows) {
        expect(row.bitGrouping).toEqual(/^(RotWord|SubWord)/.test(row.label)
          ? { size: 32, active: expect.any(Number) }
          : /^Rcon/.test(row.label) ? { size: 8, active: (nk - 1) * 4 } : undefined)
      }
      expect(rows[1]).toMatchObject({ label: expect.stringMatching(/^RotWord/), bitGrouping: { active: nk - 1 } })

      const bitValue = new Map(rows.flatMap((row) => (row.selectableBits ?? []).map((bit) => [bit.id, Number(bit.value)] as const)))
      for (const row of rows) {
        const sources = new Map<string, string[]>()
        for (const { from, to } of row.relationships ?? []) {
          expect(bitValue.has(from)).toBe(true)
          sources.set(to, [...sources.get(to) ?? [], from])
        }
        if (row.id !== 'input') expect(sources.size).toBe(variant)
        if (row.label.startsWith('Rcon')) {
          for (const [to, from] of sources) {
            expect(from).toHaveLength(1)
            const bit = Number(to.split('#')[1])
            if (bit < (nk - 1) * 32 || bit >= (nk - 1) * 32 + 8) expect(bitValue.get(from[0])).toBe(bitValue.get(to))
          }
        }
        if (row.label.startsWith('RotWord') || row.label.startsWith('XOR')) {
          for (const [to, from] of sources) expect(from.reduce((value, id) => value ^ bitValue.get(id)!, 0)).toBe(bitValue.get(to))
        }
      }
    })
  }

  it('draws dense fan-in and keeps unaffected bits as pass-through', async () => {
    const rows = keyExpansionPresentation(await expandThroughSession(128), 'en-US', 'aes-128', { algorithm: 'AES', variant: 128 }).sections[0].rows
    const fanIn = (rowId: string, bit: number) => rows.flatMap((row) => row.relationships ?? [])
      .filter((relationship) => relationship.to === `${rowId}#${bit}`).map((relationship) => relationship.from).sort()
    expect(fanIn('xor-1', 96)).toEqual(['input#96', 'rcon-1#0', 'rcon-1#32', 'rcon-1#64', 'rcon-1#96'])
    expect(fanIn('xor-1', 104)).toEqual(['input#104', 'rcon-1#104', 'rcon-1#40', 'rcon-1#72', 'rcon-1#8'])
    expect(fanIn('sub-word-1', 96)).toHaveLength(8)
    expect(fanIn('rot-word-1', 0)).toEqual(['input#0'])
    expect(fanIn('rot-word-1', 96)).toEqual(['input#104'])
    expect(fanIn('rcon-1', 104)).toEqual(['sub-word-1#104'])
    expect(rows.slice(0, 7).map((row) => row.id)).toEqual(['input', 'round-key-0', 'rot-word-1', 'sub-word-1', 'rcon-1', 'xor-1', 'round-key-1'])
  })

  it('renders every relationship by default, emphasizes on keyboard selection, groups bits, and localizes', async () => {
    const execution = await expandThroughSession(128)
    const user = userEvent.setup()
    const view = render(React.createElement(RenderHost, {
      dimensions: { width: 900, height: 500 },
      execution,
      executionIdentity: 'aes-128-detail',
      presentation: { kind: 'key-expansion', algorithm: 'AES', variant: 128 },
      locale: 'en-US',
      reducedMotion: true,
    }))
    const relationships = keyExpansionPresentation(execution, 'en-US', 'aes-128-detail', { algorithm: 'AES', variant: 128 })
      .sections[0].rows.reduce((count, row) => count + (row.relationships?.length ?? 0), 0)
    const lines = () => [...document.querySelectorAll('svg[data-lineage] line')]
    expect(lines()).toHaveLength(relationships)
    expect(screen.getByRole('status')).toHaveTextContent('No bit selected.')
    expect(document.querySelector('button[aria-pressed="true"]')).toBeNull()
    expect(screen.queryByRole('rowheader', { name: /Word XOR/ })).toBeNull()

    const rotRow = screen.getByRole('rowheader', { name: 'RotWord 1' }).closest('tr')!
    expect(rotRow.querySelectorAll('[data-bit-group]')).toHaveLength(4)
    expect(rotRow.querySelector('[data-active="true"]')).toHaveAttribute('data-bit-group', '3')
    expect(screen.getByRole('rowheader', { name: 'Input' }).closest('tr')!.querySelector('[data-bit-group]')).toBeNull()

    const bit = screen.getByRole('button', { name: 'XOR 1, Bit 96: 1' })
    bit.focus()
    await user.keyboard('{Enter}')
    expect(bit).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Input, Bit 96: 0' })).toHaveAttribute('data-state', 'related')
    expect(lines()).toHaveLength(relationships)
    view.unmount()

    const zh = keyExpansionPresentation(execution, 'zh-CN', 'aes-128-detail-zh', { algorithm: 'AES', variant: 128 })
    expect(zh.title).toBe('AES-128 密钥扩展')
    expect(zh.sections[0].rows.slice(0, 7).map((row) => row.label)).toEqual(['输入', '轮密钥 0', '字循环移位 1', '字替换 1', '轮常量 1', '异或 1', '轮密钥 1'])
  }, 120_000)

  it('keeps truncated schedules explicit without fabricating rows or lineage', () => {
    const response = executeWorkerRequest({
      requestId: 'aes-128-truncated-detail',
      kind: 'execute',
      payload: { graph: aesKeyExpansionGraph(128), inputs: { 'key.value': bits(128, new Uint8Array(16)) }, limits: { traceEvents: 18 } },
    })
    if (response.kind !== 'snapshot') throw new Error('unreachable: execution must succeed')
    const presentation = keyExpansionPresentation(response.snapshot, 'zh-CN', 'truncated', { algorithm: 'AES', variant: 128 })
    const rows = presentation.sections[0].rows
    expect(rows.map((row) => row.id)).toEqual(['input', 'rot-word-1', 'sub-word-1', 'rcon-1', 'xor-1', 'rot-word-2', 'sub-word-2', 'rcon-2'])
    const ids = new Set(rows.flatMap((row) => (row.selectableBits ?? []).map((bit) => bit.id)))
    expect(rows.flatMap((row) => row.relationships ?? []).every(({ from, to }) => ids.has(from) && ids.has(to))).toBe(true)
    expect(presentation.diagnostics).toEqual([expect.objectContaining({ code: 'aes.key-expansion-trace-incomplete', path: 'trace' })])
    expect(presentation.keyExpansionLane).toBeUndefined()
    expect(presentation.sections[1]).toMatchObject({ kind: 'raw', rows: [{ label: '轨迹缺口', state: 'incomplete' }] })
  })
})

describe('Full-state AES cipher detail and key-schedule overlay (#92)', () => {
  const runDemo = async (variant: 128 | 192 | 256) => {
    const previousWorker = globalThis.Worker
    globalThis.Worker = WorkerStub as unknown as typeof Worker
    try {
      const session = createBrowserLessonSession(aesCipherDemoDocuments(variant), 'en-US', visualizerCatalog)
      if (!session.ok) throw new Error(session.diagnostics[0]?.message)
      await session.value.next() // enter-input -> expand-key
      await session.value.next() // expand-key -> encrypt
      const result = await session.value.next() // encrypt -> decrypt
      session.value.dispose()
      if (!result.ok) throw new Error(result.diagnostics[0]?.message)
      return result.value.snapshots
    } finally {
      globalThis.Worker = previousWorker
    }
  }
  const fanIn = (rows: readonly import('../ui/learning').LearningRow[], to: string) =>
    rows.flatMap((row) => row.relationships ?? []).filter((relationship) => relationship.to === to).map((relationship) => relationship.from).sort()

  it('presents encryption and decryption as full-state bit rows with structural lineage and real values', async () => {
    const snapshots = await runDemo(128)
    const encryption = blockCipherPresentation(snapshots.encrypt, 'en-US', 'e', { algorithm: 'AES', variant: 128, direction: 'encrypt' }, snapshots['expand-key'])
    const rows = encryption.sections[0].rows
    expect(rows.slice(0, 8).map((row) => row.label)).toEqual([
      'Plaintext input', 'Round key 0', 'AddRoundKey 0', 'SubBytes 1', 'ShiftRows 1', 'MixColumns 1', 'Round key 1', 'AddRoundKey 1',
    ])
    expect(rows.slice(-4).map((row) => row.label)).toEqual(['ShiftRows 10', 'Round key 10', 'AddRoundKey 10', 'Output'])
    expect(rows.filter((row) => row.selectableKey)).toHaveLength(11)
    expect(rows.filter((row) => row.label !== 'Output').every((row) => row.selectableBits?.length === 128)).toBe(true)
    expect(encryption.initialSelection).toBeUndefined()

    expect(fanIn(rows, 'cipher-0-add-round-key#5')).toEqual(['plaintext#5', 'round-key-0#5'])
    expect(fanIn(rows, 'cipher-1-sub-bytes#13')).toEqual(Array.from({ length: 8 }, (_, bit) => `cipher-0-add-round-key#${8 + bit}`).sort())
    expect(fanIn(rows, 'cipher-1-shift-rows#8')).toEqual(['cipher-1-sub-bytes#40'])
    expect(fanIn(rows, 'cipher-1-mix-columns#40')).toHaveLength(32)
    expect(fanIn(rows, 'cipher-1-mix-columns#40').every((from) => Number(from.split('#')[1]) >= 32 && Number(from.split('#')[1]) < 64)).toBe(true)

    const bitValue = new Map(rows.flatMap((row) => (row.selectableBits ?? []).map((bit) => [bit.id, Number(bit.value)] as const)))
    const sources = new Map<string, string[]>()
    for (const { from, to } of rows.flatMap((row) => row.relationships ?? [])) sources.set(to, [...sources.get(to) ?? [], from])
    for (const row of rows.filter((candidate) => /ShiftRows|AddRoundKey/.test(candidate.label))) {
      for (const bit of row.selectableBits ?? []) {
        expect(sources.get(bit.id)!.reduce((value, id) => value ^ bitValue.get(id)!, 0)).toBe(Number(bit.value))
      }
    }

    const lane = encryption.keyExpansionLane!
    expect(lane.rows.filter((row) => row.anchor).map((row) => row.anchor)).toEqual(['plaintext', ...Array.from({ length: 11 }, (_, round) => `round-key-${round}`)])
    expect(lane.rows.find((row) => row.anchor === 'plaintext')).toMatchObject({ label: 'Input', selectableBits: expect.arrayContaining([expect.objectContaining({ id: 'input#0' })]) })
    expect(lane.rows.some((row) => row.label === 'RotWord 1')).toBe(true)
    expect(blockCipherPresentation(snapshots.encrypt, 'zh-CN', 'e', { algorithm: 'AES', variant: 128, direction: 'encrypt' }, snapshots['expand-key']).instructions).toContain('展开某轮密钥')

    const decryption = blockCipherPresentation(snapshots.decrypt, 'en-US', 'd', { algorithm: 'AES', variant: 128, direction: 'decrypt' }, snapshots['expand-key'])
    const inverse = decryption.sections[0].rows
    expect(inverse.slice(0, 8).map((row) => row.label)).toEqual([
      'Ciphertext input', 'Round key 10', 'AddRoundKey 10', 'InvShiftRows 9', 'InvSubBytes 9', 'Round key 9', 'AddRoundKey 9', 'InvMixColumns 9',
    ])
    expect(decryption.keyExpansionLane).toBeUndefined()
    expect(inverse.some((row) => row.selectableKey)).toBe(false)
    expect(fanIn(inverse, 'cipher-9-inv-shift-rows#8')).toEqual(['cipher-10-add-round-key#104'])
    expect(fanIn(inverse, 'cipher-9-inv-mix-columns#0')).toHaveLength(32)
    expect(String(inverse.at(-1)!.cells[1].value)).toBe('0x00112233445566778899aabbccddeeff')
  })

  it('finds the overlay schedule through the cipher Step round-key bindings, not a fixed Step id', async () => {
    const snapshots = await runDemo(128)
    const compiled = compileLesson(aesCipherDemoDocuments(128))
    if (!compiled.ok) throw new Error(compiled.diagnostics[0]?.message)
    const encrypt = compiled.value.steps.find((step) => step.id === 'encrypt')!
    // Rename the schedule Step: the overlay must follow the bindings.
    const renamed = Object.fromEntries(Object.entries(encrypt.execute!.bindings).map(([port, reference]) =>
      [port, 'step' in reference ? { ...reference, step: 'schedule' } : reference]))
    const host = (bindings?: typeof renamed) => render(React.createElement(RenderHost, {
      dimensions: { width: 1100, height: 700 },
      execution: snapshots.encrypt,
      allSnapshots: { encrypt: snapshots.encrypt, schedule: snapshots['expand-key'] },
      executionBindings: bindings,
      executionIdentity: `bindings-${bindings ? 'present' : 'absent'}`,
      presentation: encrypt.presentation,
      locale: 'en-US',
      reducedMotion: true,
    }))
    const chips = (container: HTMLElement) => container.querySelectorAll('button[aria-label^="Round key 0:"]')

    const linked = host(renamed)
    expect(chips(linked.container)).toHaveLength(1)
    linked.unmount()
    // Without bindings there is no schedule source, so no overlay chips.
    const unlinked = host(undefined)
    expect(chips(unlinked.container)).toHaveLength(0)
    unlinked.unmount()
  }, 120_000)
})
