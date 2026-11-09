import i18n from '../app/i18n'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { parse, stringify } from 'yaml'
import { executeWorkerRequest, hex, type BitsValue, type TraceEvent, type WorkerExecutionSnapshot, type WorkerRequest } from '../crypto_graph'
import { compileLesson, createBrowserLessonSession, type LessonDocuments } from './index'
import { visualizerCatalog } from '../visualizers'
import { dataAvalancheLesson } from './fixture/aes-avalanche-v2'

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), 'fixture')
const documents = (variant: 128 | 192 | 256): LessonDocuments => ({
  lesson: readFileSync(join(fixtureDirectory, `aes${variant}-v2.yaml`), 'utf8'),
  locales: Object.fromEntries(['en-US', 'zh-CN'].map((locale) => [locale,
    readFileSync(join(fixtureDirectory, `aes${variant}-v2-locales`, `${locale}.yaml`), 'utf8'),
  ])),
})

// Transport stand-in only: compilation, bindings and worker execution remain real.
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

const run = async (variant: 192 | 256) => {
  vi.stubGlobal('Worker', WorkerStub)
  const session = createBrowserLessonSession(documents(variant), 'en-US', i18n.getFixedT('en-US', 'translations'))
  if (!session.ok) throw new Error(JSON.stringify(session.diagnostics))
  try {
    const schedule = await session.value.enter()
    if (!schedule.ok) throw new Error(JSON.stringify(schedule.diagnostics))
    const scheduleBeforeCipher = JSON.stringify(schedule.value.snapshots.schedule)
    const cipher = await session.value.next()
    if (!cipher.ok) throw new Error(JSON.stringify(cipher.diagnostics))
    return { schedule: schedule.value.snapshots.schedule, cipher: cipher.value.snapshots.cipher, scheduleBeforeCipher }
  } finally {
    session.value.dispose()
    vi.unstubAllGlobals()
  }
}

const outputHex = (snapshot: WorkerExecutionSnapshot, path: string) => hex(snapshot.outputs[path] as BitsValue)
const eventAt = (snapshot: WorkerExecutionSnapshot, path: string) => snapshot.trace.find((event) => event.path === path) as TraceEvent

describe('Authored AES v2 calculations (#105)', () => {
  it.each([
    { variant: 128, lastRound: 10, ciphertext: '0x69c4e0d86a7b0430d8cdb78070b4c55a' },
    { variant: 256, lastRound: 14, ciphertext: '0x8ea2b7ca516745bfeafc49904b496089' },
  ] as const)('preserves AES-$variant values, lineage and binding structure when every node and algorithm label changes (#110)', ({ variant, lastRound, ciphertext }) => {
    const source = documents(variant)
    const original = compileLesson(source)
    if (!original.ok) throw new Error(JSON.stringify(original.diagnostics))
    const lesson = parse(source.lesson)
    const names: Record<string, Record<string, string>> = {}
    for (const [graphId, graph] of Object.entries(lesson.graphs) as [string, { nodes: { id: string, inputs?: Record<string, { node: string }> }[], outputs: { node: string }[] }][]) {
      names[graphId] = Object.fromEntries(graph.nodes.map((node, index) => [node.id, `stage-${index}`]))
      for (const node of graph.nodes) {
        node.id = names[graphId][node.id]
        for (const input of Object.values(node.inputs ?? {})) input.node = names[graphId][input.node]
      }
      for (const output of graph.outputs) output.node = names[graphId][output.node]
    }
    const renamePath = (graphId: string, path: string) => `${names[graphId][path.slice(0, path.lastIndexOf('.'))]}.${path.slice(path.lastIndexOf('.') + 1)}`
    for (const step of lesson.steps) {
      step.presentation.algorithm = 'Another network'
      step.presentation.variant = 37
      step.execute.bindings = Object.fromEntries(Object.entries(step.execute.bindings).map(([target, reference]) => {
        const binding = reference as { step?: string, output?: string }
        const prior = original.value.steps.find((step) => step.id === binding.step)
        return [renamePath(step.execute.graph, target), prior?.execute && binding.output
          ? { ...binding, output: renamePath(prior.execute.graph, binding.output) } : reference]
      }))
    }
    const renamed = compileLesson({ ...source, lesson: stringify(lesson) })
    if (!renamed.ok) throw new Error(JSON.stringify(renamed.diagnostics))
    for (const [graphId, graph] of Object.entries(original.value.graphs)) {
      expect(renamed.value.graphs[graphId].lineage).toEqual(graph.lineage?.map((edge) => ({
        ...edge, source: renamePath(graphId, edge.source), target: renamePath(graphId, edge.target),
      })))
    }
    const snapshots: Record<string, WorkerExecutionSnapshot> = {}
    for (const step of renamed.value.steps) {
      if (!step.execute) continue
      const prior = original.value.steps.find((candidate) => candidate.id === step.id)!
      if (step.presentation?.kind !== 'spn-cipher' || prior.presentation?.kind !== 'spn-cipher') throw new Error('Expected the shared cipher presentation')
      expect(step.presentation.rowOrder).toEqual(prior.presentation.rowOrder?.map((path) => renamePath(step.execute!.graph, path)))
      expect(step.overlay?.anchors).toEqual(prior.overlay?.anchors.map((anchor) => ({
        ...anchor, cipherRow: renamePath(step.execute!.graph, anchor.cipherRow), scheduleRow: renamePath('schedule', anchor.scheduleRow),
      })))
      const inputs = Object.fromEntries(Object.entries(step.execute.bindings).map(([target, binding]) => [target,
        'input' in binding ? renamed.value.inputs[binding.input].default : 'constant' in binding ? renamed.value.constants[binding.constant] : snapshots[binding.step].outputs[binding.output],
      ]))
      const response = executeWorkerRequest({ requestId: step.id, kind: 'execute', payload: { graph: renamed.value.graphs[step.execute.graph].graph, inputs } })
      if (response.kind !== 'snapshot') throw new Error(JSON.stringify(response))
      snapshots[step.id] = response.snapshot
    }
    expect(outputHex(snapshots.cipher, renamePath('cipher', `add-round-key-${lastRound}.value`))).toBe(ciphertext)
    if (variant === 128) expect(outputHex(snapshots.decrypt, renamePath('decrypt', 'add-round-key-0.value'))).toBe('0x00112233445566778899aabbccddeeff')
  }, 15000)

  it('exposes the AES-256 schedule independently and all fifteen binding-derived encryption anchors (#110)', () => {
    const compiled = compileLesson(documents(256))
    expect(compiled).toMatchObject({ ok: true, value: { steps: [
      { id: 'schedule', presentation: { kind: 'spn-cipher', mode: 'key-expansion', algorithm: 'AES', variant: 256 } },
      { id: 'cipher', presentation: { kind: 'spn-cipher', direction: 'encrypt', algorithm: 'AES', variant: 256 }, overlay: {
        step: 'schedule',
        anchors: Array.from({ length: 15 }, (_, round) => ({ cipherRow: `round-key-${round}.value`, scheduleRow: `round-key-${round}.value`, round })),
      } },
    ] } })
  })

  it('executes AES-192 cross-batch round keys and the FIPS-197 Appendix C.2 cipher', async () => {
    const { schedule, cipher } = await run(192)
    expect(outputHex(schedule, 'round-key-0.value')).toBe('0x000102030405060708090a0b0c0d0e0f')
    expect(outputHex(schedule, 'round-key-1.value')).toBe('0x10111213141516175846f2f95c43f4fe')
    expect(outputHex(schedule, 'round-key-12.value')).toBe('0xa4970a331a78dc09c418c271e3a41d5d')
    expect(outputHex(cipher, 'add-round-key-12.value')).toBe('0xdda97ca4864cdfe06eaf70a0ec0d7191')
  })

  it('executes AES-256 middle SubWord batches and the FIPS-197 Appendix C.3 cipher', async () => {
    const { schedule, cipher } = await run(256)
    expect(outputHex(schedule, 'round-key-0.value')).toBe('0x000102030405060708090a0b0c0d0e0f')
    expect(outputHex(schedule, 'round-key-1.value')).toBe('0x101112131415161718191a1b1c1d1e1f')
    expect(outputHex(schedule, 'round-key-14.value')).toBe('0x24fc79ccbf0979e9371ac23c6d68de36')
    expect(outputHex(cipher, 'add-round-key-14.value')).toBe('0x8ea2b7ca516745bfeafc49904b496089')
  })

  it('resolves AES-192 rk1 to exact original-key and batch-0 bit identities', async () => {
    const compiled = compileLesson(documents(192))
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
    const graph = compiled.value.graphs.schedule
    expect(graph.graph.nodes.find((node) => node.id === 'round-key-1')?.inputs).toEqual({
      left: { node: 'key', port: 'value', bits: [128, 64] },
      right: { node: 'batch-0', port: 'value', bits: [0, 64] },
    })
    expect(graph.lineage?.filter((edge) => edge.target === 'round-key-1.value')).toEqual([
      ...Array.from({ length: 64 }, (_, bit) => ({ source: 'key.value', sourceBit: 128 + bit, target: 'round-key-1.value', targetBit: bit })),
      ...Array.from({ length: 64 }, (_, bit) => ({ source: 'batch-0.value', sourceBit: bit, target: 'round-key-1.value', targetBit: 64 + bit })),
    ])
    // Projection correspondence does not collapse the XOR's structural fan-in.
    for (let bit = 0; bit < 192; bit += 1) {
      expect(graph.lineage?.filter((edge) => edge.target === 'batch-0.value' && edge.targetBit === bit)).toEqual([
        ...Array.from({ length: Math.floor(bit / 32) + 1 }, (_, word) => ({ source: 'key.value', sourceBit: word * 32 + bit % 32, target: 'batch-0.value', targetBit: bit })),
        { source: 'rcon-0.value', sourceBit: 160 + bit % 32, target: 'batch-0.value', targetBit: bit },
      ])
    }
    const { schedule } = await run(192)
    expect(hex(eventAt(schedule, 'batch-0.value').value as BitsValue)).toBe('0x5846f2f95c43f4fe544afef55847f0fa4856e2e95c43f4fe')
    expect(eventAt(schedule, 'batch-0.value')).toMatchObject({ iteration: 0, role: 'state', unit: 32 })
  })

  it.each([192, 256] as const)('preserves the AES-%i final state and exports only newly generated bits', async (variant) => {
    const compiled = compileLesson(documents(variant))
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
    const { schedule } = await run(variant)
    const lastBatch = variant === 192 ? 7 : 6
    const finalRound = variant === 192 ? 12 : 14
    const final = eventAt(schedule, `batch-${lastBatch}.value`)
    const previous = eventAt(schedule, `batch-${lastBatch - 1}.value`).value as BitsValue
    expect(final).toMatchObject({ primitive: 'aes.xor-words@1', role: 'state', iteration: lastBatch, parameters: { start: 0, count: 4 }, value: { type: { family: 'bits', size: variant } } })
    expect((final.value as BitsValue).bytes.slice(16)).toEqual(previous.bytes.slice(16))
    expect((final.value as BitsValue).bytes.slice(0, 16)).toEqual((schedule.outputs[`round-key-${finalRound}.value`] as BitsValue).bytes)
    expect(schedule.trace.filter((event) => 'role' in event && event.role === 'state')
      .every((event) => 'value' in event && event.value?.type.family === 'bits' && event.value.type.size === variant)).toBe(true)
    expect(compiled.value.graphs.schedule.lineage?.filter((edge) => edge.target === `round-key-${finalRound}.value`)).toEqual(
      Array.from({ length: 128 }, (_, bit) => ({ source: `batch-${lastBatch}.value`, sourceBit: bit, target: `round-key-${finalRound}.value`, targetBit: bit })),
    )
    for (let bit = 128; bit < variant; bit += 1) {
      expect(compiled.value.graphs.schedule.lineage?.filter((edge) => edge.target === final.path && edge.targetBit === bit)).toEqual([
        { source: `batch-${lastBatch - 1}.value`, sourceBit: bit, target: final.path, targetBit: bit },
      ])
    }
    if (variant === 256) {
      expect(schedule.trace.filter((event) => 'iteration' in event && event.iteration === lastBatch).map((event) => event.path)).toEqual([
        'rot-6.value', 'sub-6.value', 'rcon-6.value', 'batch-6.value',
      ])
      const middle = schedule.trace.filter((event) => event.path.startsWith('middle-sub-'))
      expect(middle.map((event) => event.path)).toEqual(Array.from({ length: 6 }, (_, batch) => `middle-sub-${batch}.value`))
      for (const [batch, event] of middle.entries()) {
        expect(event).toMatchObject({ primitive: 'core.substitute-bytes@1', iteration: batch, role: 'state', parameters: { start: 12, count: 4 }, value: { type: { family: 'bits', size: 256 } } })
        const firstHalf = eventAt(schedule, `first-half-${batch}.value`).value as BitsValue
        const substituted = (event as TraceEvent).value as BitsValue
        expect(substituted.bytes.slice(0, 12)).toEqual(firstHalf.bytes.slice(0, 12))
        expect(substituted.bytes.slice(16)).toEqual(firstHalf.bytes.slice(16))
      }
    }
  })

  it.each([192, 256] as const)('binds AES-%i round keys without changing schedule snapshots or sharing mutable values', async (variant) => {
    const compiled = compileLesson(documents(variant))
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
    const { schedule, cipher, scheduleBeforeCipher } = await run(variant)
    expect(JSON.stringify(schedule)).toBe(scheduleBeforeCipher)
    const bindings = compiled.value.steps.find((step) => step.id === 'cipher')!.execute!.bindings
    const roundKeys = Object.entries(schedule.outputs)
    expect(roundKeys).toHaveLength(variant === 192 ? 13 : 15)
    for (const [path, value] of roundKeys) {
      expect(bindings[path]).toEqual({ step: 'schedule', output: path })
      expect(value.type).toEqual({ family: 'bits', size: 128 })
      expect(eventAt(schedule, path)).toMatchObject({ role: 'round-key', value: { type: { family: 'bits', size: 128 } } })
      const bound = eventAt(cipher, path).value as BitsValue
      expect(bound.type).toEqual({ family: 'bits', size: 128 })
      expect(hex(bound)).toBe(hex(value as BitsValue))
      const before = hex(bound)
      const exported = value as BitsValue
      exported.bytes.fill(0)
      expect(hex(bound)).toBe(before)
      expect(hex(eventAt(schedule, path).value as BitsValue)).toBe(before)
    }
    expect(cipher.trace.every((event) => 'value' in event && event.value?.type.family === 'bits' && event.value.type.size === 128)).toBe(true)
  })
})

describe('Real AES v2 data avalanche (#142)', () => {
  // NIST baseline vectors; changed-block values and masks independently checked with OpenSSL ECB, no padding.
  const vectors = [
    { variant: 128, direction: 'encrypt', baseline: '0x69c4e0d86a7b0430d8cdb78070b4c55a', changed: '0xc4b6cc20a1961062ee8104adb441b569', mask: '0xad722cf8cbed1452364cb32dc4f57033', changedBits: 65, ratio: 0.5078125 },
    { variant: 192, direction: 'encrypt', baseline: '0xdda97ca4864cdfe06eaf70a0ec0d7191', changed: '0xa0c23353f200c8da736eaf24ffc7500b', mask: '0x7d6b4ff7744c173a1dc1df8413ca219a', changedBits: 67, ratio: 0.5234375 },
    { variant: 256, direction: 'encrypt', baseline: '0x8ea2b7ca516745bfeafc49904b496089', changed: '0x1541c6a47d2ffe781a4a79241da399ee', mask: '0x9be3716e2c48bbc7f0b630b456eaf967', changedBits: 70, ratio: 0.546875 },
    { variant: 128, direction: 'decrypt', baseline: '0x00112233445566778899aabbccddeeff', changed: '0xdc24b4f719a7eee61f56b4da7c0729fc', mask: '0xdc3596c45df2889197cf1e61b0dac703', changedBits: 64, ratio: 0.5 },
    { variant: 192, direction: 'decrypt', baseline: '0x00112233445566778899aabbccddeeff', changed: '0x3e582aef75e914919765dc9ef973add8', mask: '0x3e4908dc31bc72e61ffc762535ae4327', changedBits: 66, ratio: 0.515625 },
    { variant: 256, direction: 'decrypt', baseline: '0x00112233445566778899aabbccddeeff', changed: '0x70baccfe9583ab4105e4f0f4f6f95691', mask: '0x70abeecdd1d6cd368d7d5a4f3a24b86e', changedBits: 71, ratio: 0.5546875 },
  ] as const

  it.each(vectors)('executes AES-$variant $direction with equal independent keys and full-width measurements', async (vector) => {
    const pairedRequests: Extract<WorkerRequest, { kind: 'compare' }>[] = []
    class ObservedWorker extends WorkerStub {
      override postMessage(request: WorkerRequest): void {
        if (request.kind === 'compare') pairedRequests.push(request)
        super.postMessage(request)
      }
    }
    vi.stubGlobal('Worker', ObservedWorker)
    const created = createBrowserLessonSession(dataAvalancheLesson(documents(vector.variant), vector.variant, vector.direction), 'en-US', i18n.getFixedT('en-US', 'translations'), visualizerCatalog)
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
    const session = created.value
    try {
      expect((await session.enter()).ok).toBe(true)
      expect((await session.next()).ok).toBe(true)
      expect(session.state().comparisons).toEqual({})
      const entered = await session.next()
      if (!entered.ok) throw new Error(JSON.stringify(entered.diagnostics))
      const comparison = entered.value.comparisons.compare
      expect(comparison.truncated).toBe(false)
      const step = session.lesson.steps[2]
      const compare = step.visualizer!.compare!
      const graph = session.lesson.graphs[compare.graph]
      const output = graph.graph.outputs[0]
      const outputPath = `${output.node}.${output.port}`
      expect(outputHex(comparison.executions.baseline, outputPath)).toBe(vector.baseline)
      expect(outputHex(comparison.executions.changed, outputPath)).toBe(vector.changed)
      const final = comparison.checkpoints.find(({ path }) => path === outputPath)
      if (!final?.complete) throw new Error('Expected complete final checkpoint')
      expect([hex(final.mask), final.changedBits, final.ratio, final.left.type.size]).toEqual([vector.mask, vector.changedBits, vector.ratio, 128])
      const source = comparison.checkpoints.find(({ path }) => path === `${compare.sources![0]}.value`)
      if (!source?.complete) throw new Error('Expected original data checkpoint')
      expect([hex(source.mask), source.changedBits, source.ratio]).toEqual(['0x80000000000000000000000000000000', 1, 0.0078125])
      for (const [id, binding] of Object.entries(compare.bindings).filter(([id]) => id !== compare.sources![0])) {
        expect(binding.baseline).toEqual({ step: 'schedule', output: `${id}.value` })
        expect(binding.changed).toEqual({ step: 'equal-schedule', output: `${id}.value` })
        const key = comparison.checkpoints.find(({ path }) => path === `${id}.value`)
        if (!key?.complete) throw new Error('Expected retained independent key')
        const expected = outputHex(entered.value.snapshots.schedule, `${id}.value`)
        expect([hex(key.left), hex(key.right), key.changedBits, key.ratio]).toEqual([expected, expected, 0, 0])
        expect(outputHex(entered.value.snapshots['equal-schedule'], `${id}.value`)).toBe(expected)
      }
      const request = pairedRequests[0]
      const incomplete = executeWorkerRequest({ ...request, payload: {
        ...request.payload, right: { ...request.payload.right, limits: { traceEvents: 3 } },
      } })
      if (incomplete.kind !== 'comparison') throw new Error(JSON.stringify(incomplete))
      expect(incomplete.comparison.truncated).toBe(true)
      expect(incomplete.comparison.checkpoints.find(({ path }) => path === source.path)).toMatchObject({ complete: true, changedBits: 1, ratio: 0.0078125 })
      const gap = incomplete.comparison.checkpoints.find((checkpoint) => !checkpoint.complete)
      expect(gap).toHaveProperty('left')
      for (const field of ['right', 'mask', 'changedBits', 'ratio']) expect(gap).not.toHaveProperty(field)
      expect(outputHex(incomplete.comparison.executions.baseline, outputPath)).toBe(vector.baseline)
      expect(outputHex(incomplete.comparison.executions.changed, outputPath)).toBe(vector.changed)
    } finally { session.dispose(); vi.unstubAllGlobals() }
  })
})
