import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { executeWorkerRequest, hex, type BitsValue, type TraceEvent, type WorkerExecutionSnapshot } from '../crypto_graph'
import { compileLesson, createBrowserLessonSession, type LessonDocuments } from './index'

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), 'fixture')
const documents = (variant: 192 | 256): LessonDocuments => ({
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
  const session = createBrowserLessonSession(documents(variant), 'en-US')
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
