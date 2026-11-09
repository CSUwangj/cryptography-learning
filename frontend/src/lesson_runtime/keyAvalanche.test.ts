import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parse, stringify } from 'yaml'
import { keyAvalancheLesson } from '../../demos/keyAvalancheLesson'
import { dataAvalancheDocuments } from '../../demos/dataAvalancheLesson'
import { i18n } from '../app'
import { executeWorkerRequest, hex, type CryptoValue, type WorkerRequest } from '../crypto_graph'
import { visualizerCatalog } from '../visualizers'
import { compileLesson, createBrowserLessonSession, type LessonDocuments } from './index'
import { aesKeyChangeLesson, firstAes192KeyChangeLesson } from '../../demos/keyChangeLesson'

// Only transport is replaced; the public session uses the real Worker executor.
class LocalWorker extends EventTarget {
  postMessage(request: WorkerRequest): void {
    queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: executeWorkerRequest(request) })))
  }
  terminate(): void {}
}
afterEach(() => vi.unstubAllGlobals())

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), 'fixture')
const documents = (variant: 128 | 192 | 256): LessonDocuments => keyAvalancheLesson({
  lesson: readFileSync(join(fixtureDirectory, `aes${variant}-v2.yaml`), 'utf8'),
  locales: {},
})
const fixed = (variant: 128 | 192 | 256): LessonDocuments => {
  const result = documents(variant)
  const lesson = parse(result.lesson)
  lesson.steps.shift()
  return { ...result, lesson: stringify(lesson) }
}

// Literal round keys independently obtained with OpenSSL AES_set_encrypt_key.
// Baseline keys are the FIPS-197 Appendix C key bytes 00..0f/17/1f; changed keys flip bit 0.
const vectors = [
  { variant: 128, round: 10, iteration: 1, internal: 'word-1.value',
    left: '0x13111d7fe3944a17f307a78b4d2b30c5', right: '0x865f8873e3da4a1b6607a7874d2b30c9',
    mask: '0x954e950c004e000c9500000c0000000c', count: 28, ratio: 0.21875 },
  { variant: 192, round: 12, iteration: 0, internal: 'batch-0.value',
    left: '0xa4970a331a78dc09c418c271e3a41d5d', right: '0x387250f61a9ddcccc88cccb1e3301d9d',
    mask: '0x9ce55ac500e500c50c940ec0009400c0', count: 41, ratio: 0.3203125 },
  { variant: 256, round: 14, iteration: 0, internal: 'batch-0.value',
    left: '0x24fc79ccbf0979e9371ac23c6d68de36', right: '0x655697aafe0997e9371a2c5a6d683036',
    mask: '0x41aaee664100ee000000ee660000ee00', count: 40, ratio: 0.3125 },
] as const

// FIPS-197 Appendix C baselines. Changed-key outputs are literal OpenSSL 3.6.4
// AES ECB results with no padding, flipping the original key's MSB only.
const cipherVectors = [
  { variant: 128, direction: 'encrypt', baseline: '0x69c4e0d86a7b0430d8cdb78070b4c55a', changed: '0xae175e68d1e005092e0bf7a4d354c485' },
  { variant: 192, direction: 'encrypt', baseline: '0xdda97ca4864cdfe06eaf70a0ec0d7191', changed: '0xca281b7de5bfc42eaa74bff1e7dbbc29' },
  { variant: 256, direction: 'encrypt', baseline: '0x8ea2b7ca516745bfeafc49904b496089', changed: '0x13d73056b96e5fc429e1610bbcb91b31' },
  { variant: 128, direction: 'decrypt', baseline: '0x00112233445566778899aabbccddeeff', changed: '0x60b007735cc26f1cb38807c28ff08acd' },
  { variant: 192, direction: 'decrypt', baseline: '0x00112233445566778899aabbccddeeff', changed: '0x57e97bee435484aa5d1a9fbfb1437a24' },
  { variant: 256, direction: 'decrypt', baseline: '0x00112233445566778899aabbccddeeff', changed: '0x79bc507597a916969c19aecc34db9dcd' },
] as const

const cipherDocuments = (variant: 128 | 192 | 256 = 128, direction: 'encrypt' | 'decrypt' = 'encrypt'): LessonDocuments => aesKeyChangeLesson({
  lesson: readFileSync(join(fixtureDirectory, `aes${variant}-v2.yaml`), 'utf8'), locales: {},
}, variant, direction)
const smallCipher = (): LessonDocuments => firstAes192KeyChangeLesson(readFileSync(join(fixtureDirectory, 'aes192-v2.yaml'), 'utf8'), 'encrypt')

describe('Original-key cipher overlays (#144)', () => {
  it.each([
    ['zero original bits', '0x000102030405060708090a0b0c0d0e0f1011121314151617'],
    ['two original bits', '0xc00102030405060708090a0b0c0d0e0f1011121314151617'],
  ])('rejects %s in an overlay experiment before executing the schedule', async (_name, changed) => {
    class UnexpectedWorker extends LocalWorker {
      override postMessage(): void { throw new Error('Invalid original-key changes must not execute') }
    }
    vi.stubGlobal('Worker', UnexpectedWorker)
    const source = smallCipher()
    const lesson = parse(source.lesson)
    lesson.steps.shift()
    lesson.inputs['changed-key'].default = changed
    const created = createBrowserLessonSession({ ...source, lesson: stringify(lesson) }, 'en-US', i18n.getFixedT('en-US', 'translations'), visualizerCatalog)
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
    try {
      expect(await created.value.enter()).toMatchObject({ ok: false, diagnostics: [{ code: 'lesson.invalid-avalanche', path: 'steps.compare-key.visualizer.compare' }] })
      expect(created.value.state().comparisons).toEqual({})
    } finally { created.value.dispose() }
  })

  it.each(['schedule', 'cipher'])('rejects another independent input change in the %s', async (owner) => {
    vi.stubGlobal('Worker', LocalWorker)
    const source = smallCipher()
    const lesson = parse(source.lesson)
    lesson.steps.shift()
    if (owner === 'schedule') {
      lesson.inputs.other = { type: { family: 'bits', size: 8 }, encoding: 'hex', default: '0x00' }
      lesson.inputs['changed-other'] = { ...lesson.inputs.other, default: '0x01' }
      lesson.graphs.schedule.nodes.push({ id: 'other', operation: 'core.source@1', parameters: { type: { family: 'bits', size: 8 } }, role: 'state' })
      lesson.steps[0].visualizer.compare.bindings.other = { baseline: { input: 'other' }, changed: { input: 'changed-other' } }
    } else {
      lesson.inputs['changed-data'] = { ...lesson.inputs.plaintext, default: '0x80112233445566778899aabbccddeeff' }
      lesson.steps[1].visualizer.compare.bindings.plaintext = { baseline: { input: 'plaintext' }, changed: { input: 'changed-data' } }
    }
    const created = createBrowserLessonSession({ ...source, lesson: stringify(lesson, { aliasDuplicateObjects: false }) }, 'en-US', i18n.getFixedT('en-US', 'translations'), visualizerCatalog)
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
    try {
      const result = owner === 'schedule' ? await created.value.enter() : (await created.value.enter(), await created.value.next())
      expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'lesson.invalid-avalanche', path: `steps.compare-${owner === 'schedule' ? 'key' : 'cipher'}.visualizer.compare` }] })
      expect(created.value.state().comparisons['compare-cipher']).toBeUndefined()
    } finally { created.value.dispose() }
  })

  it.each([
    ['absent experiment', (lesson: ReturnType<typeof parse>) => { lesson.steps[2].visualizer.compare.keyChange = 'absent' }, 'lesson.invalid-step-reference'],
    ['self experiment', (lesson: ReturnType<typeof parse>) => { lesson.steps[2].visualizer.compare.keyChange = 'compare-cipher' }, 'lesson.invalid-step-reference'],
    ['ordinary comparison', (lesson: ReturnType<typeof parse>) => { lesson.steps[1].visualizer.compare.kind = 'generic'; delete lesson.steps[1].visualizer.compare.sources }, 'lesson.invalid-step-reference'],
    ['missing original source', (lesson: ReturnType<typeof parse>) => { lesson.steps[1].visualizer.compare.sources = ['absent'] }, 'lesson.invalid-input'],
    ['derived source declaration', (lesson: ReturnType<typeof parse>) => { lesson.steps[1].visualizer.compare.sources = ['round-key-1'] }, 'lesson.invalid-input'],
    ['unequal original key widths', (lesson: ReturnType<typeof parse>) => { lesson.inputs['changed-key'].type.size = 128; lesson.inputs['changed-key'].default = '0x800102030405060708090a0b0c0d0e0f' }, 'lesson.invalid-step-reference'],
    ['implicit experiment', (lesson: ReturnType<typeof parse>) => { delete lesson.steps[2].visualizer.compare.keyChange }, 'lesson.overlay-without-schedule-binding'],
    ['absent key binding', (lesson: ReturnType<typeof parse>) => { delete lesson.steps[2].visualizer.compare.bindings['round-key-1'] }, 'overlay.unbound-round-key'],
    ['incompatible key binding', (lesson: ReturnType<typeof parse>) => { lesson.steps[2].visualizer.compare.bindings['round-key-1'] = { input: 'key' } }, 'lesson.invalid-step-reference'],
    ['different side anchors', (lesson: ReturnType<typeof parse>) => { lesson.steps[2].visualizer.compare.bindings['round-key-1'] = { baseline: { step: 'compare-key', output: 'round-key-0.value' }, changed: { step: 'compare-key', output: 'round-key-1.value' } } }, 'overlay.unbound-round-key'],
    ['duplicate anchor', (lesson: ReturnType<typeof parse>) => { lesson.steps[2].visualizer.compare.bindings['round-key-1'].output = 'round-key-0.value' }, 'overlay.duplicate-anchor'],
    ['non-key export', (lesson: ReturnType<typeof parse>) => { lesson.graphs.schedule.nodes.find((node: { id: string }) => node.id === 'round-key-1').role = 'state' }, 'overlay.not-round-key'],
  ] as const)('reports a stable diagnostic for %s', (_name, change, code) => {
    const source = smallCipher()
    const lesson = parse(source.lesson)
    change(lesson)
    expect(compileLesson({ ...source, lesson: stringify(lesson) }, visualizerCatalog)).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([
      expect.objectContaining({ code }),
    ]) })
  })

  it('does not enable an incidental overlay on an ordinary data-change view', () => {
    const source = smallCipher()
    const lesson = parse(source.lesson)
    const cipher = lesson.steps[2]
    delete cipher.presentation.overlay
    delete cipher.visualizer.compare.keyChange
    cipher.visualizer.compare.kind = 'generic'
    const compiled = compileLesson({ ...source, lesson: stringify(lesson) }, visualizerCatalog)
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
    expect(compiled.value.steps[2].overlay).toBeUndefined()
  })

  it('invalidates a dependent cipher when its original-key experiment changes', async () => {
    vi.stubGlobal('Worker', LocalWorker)
    const source = { lesson: readFileSync(join(fixtureDirectory, 'aes128-v2.yaml'), 'utf8'), locales: {} }
    const created = createBrowserLessonSession(aesKeyChangeLesson(source, 128, 'encrypt'), 'en-US', i18n.getFixedT('en-US', 'translations'), visualizerCatalog)
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
    const session = created.value
    try {
      expect((await session.next()).ok).toBe(true)
      expect((await session.next()).ok).toBe(true)
      expect(session.state().comparisons['compare-cipher']).toBeDefined()
      expect(session.setInput('key', '0x00000000000000000000000000000001').ok).toBe(true)
      expect(session.state().comparisons).toEqual({})
      expect(session.state().executionIdentities).toEqual({})
      expect(await session.enter()).toMatchObject({ ok: false, diagnostics: [{ code: 'lesson.comparison-input-unavailable' }] })
      await session.previous()
      expect((await session.next()).ok).toBe(true)
      expect(session.state().comparisons['compare-cipher']).toBeDefined()
    } finally { session.dispose() }
  })

  it.each(cipherVectors)('feeds each AES-$variant $direction side from its own original-key schedule', async (vector) => {
    vi.stubGlobal('Worker', LocalWorker)
    const created = createBrowserLessonSession(cipherDocuments(vector.variant, vector.direction), 'en-US', i18n.getFixedT('en-US', 'translations'), visualizerCatalog)
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
    const session = created.value
    try {
      expect((await session.next()).ok).toBe(true)
      expect((await session.next()).ok).toBe(true)
      const comparison = session.state().comparisons['compare-cipher']
      expect(comparison).toBeDefined()
      const finalRound = { 128: 10, 192: 12, 256: 14 }[vector.variant]
      const graph = session.lesson.graphs[session.lesson.steps[2].visualizer!.compare!.graph]
      const exported = graph.graph.outputs[0]
      const output = comparison.checkpoints.find(({ path }) => path === `${exported.node}.${exported.port}`)
      if (!output?.complete) throw new Error('Expected paired cipher outputs')
      expect([hex(output.left), hex(output.right)]).toEqual([vector.baseline, vector.changed])
      const schedule = session.state().comparisons['compare-key']
      for (const side of ['baseline', 'changed'] as const) {
        const source = vector.direction === 'encrypt' ? 'plaintext' : 'ciphertext'
        const data = comparison.executions[side].trace.find(({ path }) => path === `${source}.value`)
        expect(data).toHaveProperty('value', session.lesson.inputs[source].default)
        for (let round = 0; round <= finalRound; round++) {
          const path = `round-key-${round}.value`
          expect(comparison.executions[side].trace.find((event) => event.path === path)).toHaveProperty('value', schedule.executions[side].outputs[path])
        }
      }
      const knownSchedule = vectors.find(({ variant }) => variant === vector.variant)!
      const finalKey = schedule.checkpoints.find(({ path }) => path === `round-key-${finalRound}.value`)
      if (!finalKey?.complete) throw new Error('Expected independently checked schedule values')
      expect([hex(finalKey.left), hex(finalKey.right)]).toEqual([knownSchedule.left, knownSchedule.right])
      expect(comparison.checkpoints.filter((pair) => pair.role === 'round-key' && pair.complete && pair.changedBits > 0).length).toBeGreaterThan(1)
      expect(session.lesson.steps[2].overlay).toMatchObject({ step: 'compare-key', anchors: expect.arrayContaining([
        { cipherRow: `round-key-${finalRound}.value`, scheduleRow: `round-key-${finalRound}.value`, round: finalRound },
      ]) })
    } finally { session.dispose() }
  })
})

describe('Standalone original-key avalanche (#143)', () => {
  it('keeps an independent data comparison when editing or replacing the key experiment', async () => {
    vi.stubGlobal('Worker', LocalWorker)
    const lesson = parse(dataAvalancheDocuments.lesson)
    lesson.inputs.key = { type: { family: 'bits', size: 8 }, encoding: 'hex', default: '0x5a' }
    lesson.inputs['changed-key'] = { ...lesson.inputs.key, default: '0xda' }
    const keyStep = structuredClone(lesson.steps[1])
    keyStep.id = 'key-compare'
    keyStep.presentation = { kind: 'spn-cipher', mode: 'key-expansion' }
    keyStep.visualizer.compare.sources = ['key']
    keyStep.visualizer.compare.bindings.data.changed = { input: 'data' }
    keyStep.visualizer.compare.bindings.other.changed = { input: 'other' }
    keyStep.visualizer.compare.bindings.key = { baseline: { input: 'key' }, changed: { input: 'changed-key' } }
    lesson.steps.push({ id: 'key-inputs', bit_flip: [{ input: 'key', changed: 'changed-key', prompt: 'data' }] }, keyStep)
    const created = createBrowserLessonSession({ ...dataAvalancheDocuments, lesson: stringify(lesson, { aliasDuplicateObjects: false }) }, 'en-US', i18n.getFixedT('en-US', 'translations'), visualizerCatalog)
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
    const session = created.value
    try {
      expect((await session.next()).ok).toBe(true)
      const data = session.state().comparisons.compare
      const identity = session.state().executionIdentities.compare
      expect(data).toBeDefined()
      // Select a key flip without changing any input consumed by the data Step.
      expect(session.setBitFlip('key-inputs', 'key', 1).ok).toBe(true)
      expect(session.state().comparisons.compare).toBe(data)
      expect(session.state().executionIdentities.compare).toBe(identity)
      expect((await session.next()).ok).toBe(true)
      expect((await session.next()).ok).toBe(true)
      const key = session.state().comparisons['key-compare']
      expect(key).toBeDefined()
      expect(session.setInput('key', '0x01').ok).toBe(true)
      expect(session.state().comparisons.compare).toBe(data)
      expect(session.state().comparisons['key-compare']).toBeUndefined()
      expect(session.state().executionIdentities['key-compare']).toBeUndefined()
      expect((await session.enter()).ok).toBe(true)
      expect(session.state().comparisons['key-compare']).not.toBe(key)
      expect(session.state().comparisons.compare).toBe(data)
    } finally { session.dispose() }
  })

  it.each(vectors)('executes fixed AES-$variant paired schedules without a cipher or input Step', async (vector) => {
    vi.stubGlobal('Worker', LocalWorker)
    const source = fixed(vector.variant)
    const created = createBrowserLessonSession(source, 'en-US', i18n.getFixedT('en-US', 'translations'), visualizerCatalog)
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
    const session = created.value
    try {
      expect(Object.keys(session.lesson.graphs)).toEqual(['schedule'])
      expect(session.lesson.steps).toHaveLength(1)
      expect(session.lesson.steps[0].inputs).toBeUndefined()
      expect((await session.enter()).ok).toBe(true)
      expect(session.state().executionIdentities['compare-key']).toMatch(/^compare-key-/)
      const comparison = session.state().comparisons['compare-key']
      expect(comparison.truncated).toBe(false)
      const original = comparison.checkpoints.find(({ path }) => path === 'key.value')
      if (!original?.complete) throw new Error('Expected original-key values')
      expect(original.left.type.size).toBe(vector.variant)
      expect(original.changedBits).toBe(1)
      expect(original.ratio).toBe(1 / vector.variant)
      const pair = comparison.checkpoints.find(({ path }) => path === `round-key-${vector.round}.value`)
      if (!pair?.complete) throw new Error('Expected final round-key values')
      expect([hex(pair.left), hex(pair.right), hex(pair.mask), pair.changedBits, pair.ratio]).toEqual([
        vector.left, vector.right, vector.mask, vector.count, vector.ratio,
      ])
      expect(pair).toMatchObject({ role: 'round-key', round: vector.round, unit: 32 })
      expect(comparison.checkpoints.find(({ path }) => path === vector.internal)).toMatchObject({ iteration: vector.iteration, unit: 32 })
      for (const side of ['baseline', 'changed'] as const) {
        const event = comparison.executions[side].trace.find(({ path }) => path === vector.internal)
        expect(event).toMatchObject({ iteration: vector.iteration, unit: 32 })
      }
    } finally { session.dispose() }
  })

  it.each(vectors)('pairs reordered AES-$variant schedules by identity and retains honest one-sided gaps', (vector) => {
    const result = compileLesson(fixed(vector.variant), visualizerCatalog)
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
    const lesson = result.value
    const graph = lesson.graphs.schedule.graph
    const inputs = (changed: boolean): Record<string, CryptoValue> => ({ 'key.value': lesson.inputs[changed ? 'changed-key' : 'key'].default })
    const response = executeWorkerRequest({ requestId: 'reordered-schedule', kind: 'compare', payload: {
      left: { graph, inputs: inputs(false) },
      right: { graph: { ...graph, nodes: graph.nodes.toReversed() }, inputs: inputs(true) },
    } })
    if (response.kind !== 'comparison') throw new Error(JSON.stringify(response))
    const final = response.comparison.checkpoints.find(({ path }) => path === `round-key-${vector.round}.value`)
    if (!final?.complete) throw new Error('Expected semantically paired final key')
    expect([hex(final.left), hex(final.right)]).toEqual([vector.left, vector.right])
    const partial = executeWorkerRequest({ requestId: 'partial-schedule', kind: 'compare', payload: {
      left: { graph, inputs: inputs(false) }, right: { graph, inputs: inputs(true), limits: { traceEvents: 1 } },
    } })
    if (partial.kind !== 'comparison') throw new Error(JSON.stringify(partial))
    expect(partial.comparison.truncated).toBe(true)
    expect(partial.comparison.checkpoints.find(({ path }) => path === 'key.value')).toMatchObject({ complete: true, changedBits: 1 })
    const gap = partial.comparison.checkpoints.find(({ path }) => path === `round-key-${vector.round}.value`)
    expect(gap).toMatchObject({ complete: false, role: 'round-key', round: vector.round })
    expect(gap).not.toHaveProperty('right')
    expect(gap).not.toHaveProperty('mask')
    expect(gap).not.toHaveProperty('ratio')
    if (!gap?.left) throw new Error('Expected retained baseline key')
    expect(hex(gap.left)).toBe(vector.left)
  })

  it.each([
    ['zero bits', '0x000102030405060708090a0b0c0d0e0f'],
    ['two bits', '0xc00102030405060708090a0b0c0d0e0f'],
  ])('rejects a fixed key experiment with %s at the session boundary', async (_name, changed) => {
    class UnexpectedWorker extends LocalWorker {
      override postMessage(): void { throw new Error('Invalid original-key changes must not execute') }
    }
    vi.stubGlobal('Worker', UnexpectedWorker)
    const source = fixed(128)
    const lesson = parse(source.lesson)
    lesson.inputs['changed-key'].default = changed
    const created = createBrowserLessonSession({ ...source, lesson: stringify(lesson) }, 'en-US', i18n.getFixedT('en-US', 'translations'), visualizerCatalog)
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
    try {
      expect(await created.value.enter()).toMatchObject({ ok: false, diagnostics: [{ code: 'lesson.invalid-avalanche', path: 'steps.compare-key.visualizer.compare' }] })
      expect(created.value.state().comparisons).toEqual({})
    } finally { created.value.dispose() }
  })

  it('rejects a changed independent non-key input before executing a real schedule', async () => {
    class UnexpectedWorker extends LocalWorker {
      override postMessage(): void { throw new Error('A non-key source change must not execute') }
    }
    vi.stubGlobal('Worker', UnexpectedWorker)
    const source = fixed(128)
    const lesson = parse(source.lesson)
    lesson.inputs.other = { type: { family: 'bits', size: 8 }, encoding: 'hex', default: '0x00' }
    lesson.inputs['changed-other'] = { ...lesson.inputs.other, default: '0x01' }
    lesson.graphs.schedule.nodes.push({ id: 'other', operation: 'core.source@1', parameters: { type: { family: 'bits', size: 8 } } })
    lesson.steps[0].visualizer.compare.bindings.other = { baseline: { input: 'other' }, changed: { input: 'changed-other' } }
    const created = createBrowserLessonSession({ ...source, lesson: stringify(lesson, { aliasDuplicateObjects: false }) }, 'en-US', i18n.getFixedT('en-US', 'translations'), visualizerCatalog)
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
    try {
      expect(await created.value.enter()).toMatchObject({ ok: false, diagnostics: [{ code: 'lesson.invalid-avalanche', path: 'steps.compare-key.visualizer.compare' }] })
    } finally { created.value.dispose() }
  })

  it('rejects a missing stable schedule checkpoint identity instead of pairing by position', () => {
    const result = compileLesson(fixed(128), visualizerCatalog)
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
    const lesson = result.value
    const graph = lesson.graphs.schedule.graph
    const rename = (id: string) => id === 'round-key-10' ? 'different-final-identity' : id
    const right = { ...graph,
      nodes: graph.nodes.map((node) => ({ ...node, id: rename(node.id) })),
      outputs: graph.outputs.map((output) => ({ ...output, node: rename(output.node) })),
    }
    expect(executeWorkerRequest({ requestId: 'missing-key-identity', kind: 'compare', payload: {
      left: { graph, inputs: { 'key.value': lesson.inputs.key.default } },
      right: { graph: right, inputs: { 'key.value': lesson.inputs['changed-key'].default } },
    } })).toMatchObject({ kind: 'diagnostic', diagnostics: [{ code: 'comparison.incompatible-structure', path: 'trace.round-key-10.value' }] })
  })

  it('retains stable declaration diagnostics for invalid original sources and key widths', () => {
    const source = fixed(128)
    for (const sources of [[], ['absent'], ['round-key-1'], ['key', 'key']]) {
      const lesson = parse(source.lesson)
      lesson.steps[0].visualizer.compare.sources = sources
      expect(compileLesson({ ...source, lesson: stringify(lesson) }, visualizerCatalog)).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'lesson.invalid-input', path: 'steps.0.visualizer.compare.sources' }),
      ]) })
    }
    const lesson = parse(source.lesson)
    lesson.inputs['changed-key'].type.size = 192
    lesson.inputs['changed-key'].default = '0x800102030405060708090a0b0c0d0e0f1011121314151617'
    expect(compileLesson({ ...source, lesson: stringify(lesson) }, visualizerCatalog)).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([
      expect.objectContaining({ code: 'lesson.invalid-step-reference', path: 'steps.0.visualizer.compare.bindings.key' }),
    ]) })
  })

  it('replaces the selected original-key flip and rederives it after baseline edits', async () => {
    vi.stubGlobal('Worker', LocalWorker)
    const created = createBrowserLessonSession(documents(128), 'en-US', i18n.getFixedT('en-US', 'translations'), visualizerCatalog)
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
    const session = created.value
    const key = () => {
      const value = session.state().inputs['changed-key']
      if (typeof value === 'string' || !('bytes' in value)) throw new Error('Expected decoded key')
      return hex(value)
    }
    try {
      expect(key()).toBe('0x800102030405060708090a0b0c0d0e0f')
      expect(session.setBitFlip('key-inputs', 'key', 1).ok).toBe(true)
      expect(key()).toBe('0x400102030405060708090a0b0c0d0e0f')
      expect(session.setInput('key', '0x00000000000000000000000000000001').ok).toBe(true)
      expect(key()).toBe('0x40000000000000000000000000000001')
      expect(session.state().comparisons).toEqual({})
      expect((await session.next()).ok).toBe(true)
      expect(session.state().comparisons['compare-key'].checkpoints.find(({ path }) => path === 'key.value')).toMatchObject({ complete: true, changedBits: 1 })
      const previous = session.state().comparisons['compare-key']
      expect(session.setBitFlip('key-inputs', 'key', 127).ok).toBe(true)
      expect(key()).toBe('0x00000000000000000000000000000000')
      expect(session.state().comparisons).toEqual({})
      expect((await session.enter()).ok).toBe(true)
      expect(session.state().comparisons['compare-key']).not.toBe(previous)
    } finally { session.dispose() }
  })

})
