import { afterEach, describe, expect, it, vi } from 'vitest'
import { parse, stringify } from 'yaml'
import { dataAvalancheDocuments } from '../../demos/dataAvalancheLesson'
import i18n from '../app/i18n'
import { executeWorkerRequest, hex, type WorkerRequest } from '../crypto_graph'
import { visualizerCatalog } from '../visualizers'
import { compileLesson, createBrowserLessonSession, type BrowserLessonSession, type LessonDocuments } from './index'

class LocalWorker extends EventTarget {
  postMessage(request: WorkerRequest): void {
    queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: executeWorkerRequest(request) })))
  }
  terminate(): void {}
}
afterEach(() => vi.unstubAllGlobals())

const fixed = (): LessonDocuments => ({
  ...dataAvalancheDocuments,
  lesson: dataAvalancheDocuments.lesson.replace(/  - id: inputs[\s\S]*?(?=  - id: compare)/, ''),
})

describe('Controlled v2 data avalanche (#142)', () => {
  it('executes a fixed example without an input Step and accepts distinct equal key references', async () => {
    vi.stubGlobal('Worker', LocalWorker)
    const documents = fixed()
    expect(compileLesson(documents, visualizerCatalog).ok).toBe(true)
    const created = createBrowserLessonSession(documents, 'en-US', i18n.getFixedT('en-US', 'translations'), visualizerCatalog)
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
    const session = created.value
    try {
      expect(session.lesson.steps).toHaveLength(1)
      expect(session.lesson.steps[0].inputs).toBeUndefined()
      const entered = await session.enter()
      if (!entered.ok) throw new Error(JSON.stringify(entered.diagnostics))
      const checkpoints = entered.value.comparisons.compare.checkpoints
      const data = checkpoints.find(({ path }) => path === 'data.value')
      if (!data?.complete) throw new Error('Expected retained source values')
      expect([hex(data.left), hex(data.right), hex(data.mask), data.changedBits, data.ratio]).toEqual(['0x00', '0x80', '0x80', 1, 0.125])
      const key = checkpoints.find(({ path }) => path === 'key.value')
      if (!key?.complete) throw new Error('Expected equal independent keys')
      expect([hex(key.left), hex(key.right), key.changedBits]).toEqual(['0x5a', '0x5a', 0])
      const output = checkpoints.find(({ path }) => path === 'result.value')
      if (!output?.complete) throw new Error('Expected paired execution values')
      expect([hex(output.left), hex(output.right)]).toEqual(['0xf6', '0x96'])
    } finally { session.dispose() }
  })

  it.each([
    ['zero source bits', (lesson: string) => lesson.replace('default: "0x80"', 'default: "0x00"')],
    ['two source bits', (lesson: string) => lesson.replace('default: "0x80"', 'default: "0xc0"')],
    ['another data input', (lesson: string) => lesson.replace('changed-other: {type: {family: bits, size: 8}, encoding: hex, default: "0x00"}', 'changed-other: {type: {family: bits, size: 8}, encoding: hex, default: "0x01"}')],
    ['independent key', (lesson: string) => lesson.replace('equal-key: {type: {family: bits, size: 8}, encoding: hex, value: "0x5a"}', 'equal-key: {type: {family: bits, size: 8}, encoding: hex, value: "0x5b"}')],
    ['undeclared data source', (lesson: string) => lesson.replace('sources: [data, other]', 'sources: [other]')],
  ] as const)('rejects %s before paired execution', async (_name, change) => {
    class UnexpectedWorker extends LocalWorker {
      override postMessage(): void { throw new Error('An invalid avalanche must not execute') }
    }
    vi.stubGlobal('Worker', UnexpectedWorker)
    const documents = fixed()
    const created = createBrowserLessonSession({ ...documents, lesson: change(documents.lesson) }, 'en-US', i18n.getFixedT('en-US', 'translations'), visualizerCatalog)
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
    try {
      expect(await created.value.enter()).toMatchObject({ ok: false, diagnostics: [{ code: 'lesson.invalid-avalanche', path: 'steps.compare.visualizer.compare' }] })
      expect(created.value.state().comparisons).toEqual({})
    } finally { created.value.dispose() }
  })

  it.each(['[]', '[absent]', '[data, data]', 'data'])('rejects invalid declared data sources %s', (sources) => {
    const documents = fixed()
    expect(compileLesson({ ...documents, lesson: documents.lesson.replace('[data, other]', sources) }, visualizerCatalog)).toMatchObject({
      ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'lesson.invalid-input', path: 'steps.0.visualizer.compare.sources' })]),
    })
  })

  it('replaces MSB-first flips, follows baseline edits and executes only on Step entry', async () => {
    class RecordingWorker extends LocalWorker {
      static readonly requests: WorkerRequest[] = []
      override postMessage(request: WorkerRequest): void {
        RecordingWorker.requests.push(structuredClone(request))
        super.postMessage(request)
      }
    }
    vi.stubGlobal('Worker', RecordingWorker)
    const created = createBrowserLessonSession(dataAvalancheDocuments, 'en-US', i18n.getFixedT('en-US', 'translations'), visualizerCatalog)
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
    const session = created.value
    const value = (id: string) => {
      const input = session.state().inputs[id]
      if (typeof input === 'string' || !('bytes' in input)) throw new Error('Expected decoded bits')
      return hex(input)
    }
    try {
      expect((await session.enter()).ok).toBe(true)
      expect([value('data'), value('changed-data')]).toEqual(['0x00', '0x80'])
      expect(session.setBitFlip('inputs', 'data', 1).ok).toBe(true)
      expect([value('data'), value('changed-data')]).toEqual(['0x00', '0x40'])
      expect(session.setInput('data', '0x01').ok).toBe(true)
      expect([value('data'), value('changed-data')]).toEqual(['0x01', '0x41'])
      expect(RecordingWorker.requests).toHaveLength(0)
      expect(session.state().comparisons).toEqual({})
      expect((await session.next()).ok).toBe(true)
      expect(RecordingWorker.requests).toHaveLength(1)
      const previous = session.state().comparisons.compare
      const identity = session.state().executionIdentities.compare
      await session.previous()
      expect(session.setBitFlip('inputs', 'other', 7).ok).toBe(true)
      expect([value('changed-data'), value('other'), value('changed-other')]).toEqual(['0x01', '0x00', '0x01'])
      expect(session.state().comparisons).toEqual({})
      expect(session.state().executionIdentities).toEqual({})
      expect(RecordingWorker.requests).toHaveLength(1)
      expect((await session.next()).ok).toBe(true)
      expect(RecordingWorker.requests).toHaveLength(2)
      expect(session.state().executionIdentities.compare).not.toBe(identity)
      expect(session.state().comparisons.compare.checkpoints.find(({ path }) => path === 'other.value')).toMatchObject({ complete: true, changedBits: 1, ratio: 0.125 })
      const previousData = previous.checkpoints.find(({ path }) => path === 'data.value')
      if (!previousData?.complete) throw new Error('Expected retained prior source values')
      expect([hex(previousData.left), hex(previousData.right)]).toEqual(['0x01', '0x41'])
    } finally { session.dispose() }
  })

  it.each([
    ['unknown source', (session: BrowserLessonSession) => session.setBitFlip('inputs', 'missing', 0)],
    ['negative bit', (session: BrowserLessonSession) => session.setBitFlip('inputs', 'data', -1)],
    ['out-of-range bit', (session: BrowserLessonSession) => session.setBitFlip('inputs', 'data', 8)],
    ['fractional bit', (session: BrowserLessonSession) => session.setBitFlip('inputs', 'data', 0.5)],
    ['NaN bit', (session: BrowserLessonSession) => session.setBitFlip('inputs', 'data', NaN)],
    ['invalid baseline', (session: BrowserLessonSession) => session.setInput('data', 'invalid')],
  ] as const)('invalidates a valid comparison after an %s and requires a valid replacement', async (_name, invalidate) => {
    vi.stubGlobal('Worker', LocalWorker)
    const created = createBrowserLessonSession(dataAvalancheDocuments, 'en-US', i18n.getFixedT('en-US', 'translations'), visualizerCatalog)
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
    const session = created.value
    try {
      expect((await session.next()).ok).toBe(true)
      const old = session.state().comparisons.compare
      expect(old).toBeDefined()
      expect(invalidate(session).ok).toBe(false)
      expect(session.state().comparisons).toEqual({})
      expect(session.state().executionIdentities).toEqual({})
      expect((await session.enter()).ok).toBe(false)
      expect(session.setInput('data', '0x00').ok).toBe(true)
      expect(session.setBitFlip('inputs', 'data', 1).ok).toBe(true)
      expect((await session.enter()).ok).toBe(true)
      const replacementData = session.state().comparisons.compare.checkpoints.find(({ path }) => path === 'data.value')
      const oldData = old.checkpoints.find(({ path }) => path === 'data.value')
      if (!replacementData?.complete || !oldData?.complete) throw new Error('Expected complete source values')
      expect([hex(replacementData.right), hex(oldData.right)]).toEqual(['0x40', '0x80'])
    } finally { session.dispose() }
  })

  it.each([
    ['source', (session: BrowserLessonSession) => session.setBitFlip('inputs', 'missing', 0)],
    ['bit', (session: BrowserLessonSession) => session.setBitFlip('inputs', 'data', 8)],
    ['input', (session: BrowserLessonSession) => session.setInput('data', 'invalid')],
  ] as const)('blocks stale data forwarded through an executing Step after an invalid %s and recovers with valid data', async (_name, invalidate) => {
    vi.stubGlobal('Worker', LocalWorker)
    const lesson = parse(dataAvalancheDocuments.lesson)
    lesson.steps[0].bit_flip = lesson.steps[0].bit_flip.slice(0, 1)
    lesson.steps[1].visualizer.compare.bindings.other.changed = { input: 'other' }
    lesson.graphs.forward = {
      nodes: [{ id: 'data', operation: 'core.source@1', parameters: { type: { family: 'bits', size: 8 } } }],
      outputs: [{ node: 'data', port: 'value' }],
    }
    lesson.steps.splice(1, 0, { id: 'forward', execute: { graph: 'forward', bindings: { 'data.value': { input: 'changed-data' } } } })
    lesson.steps[2].visualizer.compare.bindings.data.changed = { step: 'forward', output: 'data.value' }
    const documents = { ...dataAvalancheDocuments, lesson: stringify(lesson) }
    expect(compileLesson(documents, visualizerCatalog).ok).toBe(true)
    const created = createBrowserLessonSession(documents, 'en-US', i18n.getFixedT('en-US', 'translations'), visualizerCatalog)
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
    const session = created.value
    try {
      expect((await session.enter()).ok).toBe(true)
      expect((await session.next()).ok).toBe(true)
      expect((await session.next()).ok).toBe(true)
      const original = session.state().comparisons.compare.checkpoints.find(({ path }) => path === 'data.value')
      if (!original?.complete) throw new Error('Expected original source values')
      expect([hex(original.left), hex(original.right)]).toEqual(['0x00', '0x80'])
      await session.previous()
      await session.previous()
      expect(invalidate(session).ok).toBe(false)
      expect(session.state().snapshots).toEqual({})
      expect(session.state().comparisons).toEqual({})
      expect(session.state().executionIdentities).toEqual({})
      const forward = await session.next()
      expect(forward).toMatchObject({ ok: true, value: {
        snapshots: {}, executionDiagnostics: { forward: { code: 'lesson.missing-step-result', path: 'steps.forward' } },
      } })
      expect(await session.next()).toMatchObject({ ok: false, diagnostics: [
        { code: 'lesson.comparison-input-unavailable', path: 'steps.compare.visualizer.compare.bindings.data' },
      ] })
      expect(session.state().comparisons).toEqual({})
      await session.previous()
      await session.previous()
      expect(session.setInput('data', '0x01').ok).toBe(true)
      expect(session.setBitFlip('inputs', 'data', 1).ok).toBe(true)
      expect((await session.next()).ok).toBe(true)
      const forwarded = session.state().snapshots.forward.outputs['data.value']
      if (!('bytes' in forwarded)) throw new Error('Expected forwarded bit values')
      expect(hex(forwarded)).toBe('0x41')
      expect((await session.next()).ok).toBe(true)
      expect(session.state().executionDiagnostics).toEqual({})
      const replacement = session.state().comparisons.compare.checkpoints.find(({ path }) => path === 'data.value')
      if (!replacement?.complete) throw new Error('Expected recovered source values')
      expect([hex(replacement.left), hex(replacement.right), replacement.changedBits]).toEqual(['0x01', '0x41', 1])
      expect([hex(original.left), hex(original.right)]).toEqual(['0x00', '0x80'])
    } finally { session.dispose() }
  })

  it.each([
    ['source', (session: BrowserLessonSession) => session.setBitFlip('inputs', 'missing', 0)],
    ['bit', (session: BrowserLessonSession) => session.setBitFlip('inputs', 'data', 8)],
    ['input', (session: BrowserLessonSession) => session.setInput('data', 'invalid')],
  ] as const)('rejects delayed results after invalid %s selection and a replacement execution', async (_name, invalidate) => {
    class DelayedWorker extends LocalWorker {
      static instance: DelayedWorker
      readonly requests: WorkerRequest[] = []
      constructor() { super(); DelayedWorker.instance = this }
      override postMessage(request: WorkerRequest): void { this.requests.push(structuredClone(request)) }
      reply(index: number): void { this.dispatchEvent(new MessageEvent('message', { data: executeWorkerRequest(this.requests[index]) })) }
    }
    vi.stubGlobal('Worker', DelayedWorker)
    const created = createBrowserLessonSession(dataAvalancheDocuments, 'en-US', i18n.getFixedT('en-US', 'translations'), visualizerCatalog)
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
    const session = created.value
    try {
      const pending = session.next()
      const worker = DelayedWorker.instance
      expect(worker.requests).toHaveLength(1)
      expect(invalidate(session).ok).toBe(false)
      worker.reply(0)
      expect((await pending).ok).toBe(false)
      expect((await session.enter()).ok).toBe(false)
      expect(worker.requests).toHaveLength(1)
      expect(session.state().comparisons).toEqual({})
      session.setInput('data', '0x00')
      session.setBitFlip('inputs', 'data', 1)
      const replacement = session.enter()
      worker.reply(0)
      expect(session.state().comparisons).toEqual({})
      worker.reply(1)
      expect((await replacement).ok).toBe(true)
      const comparison = session.state().comparisons.compare
      const data = comparison.checkpoints.find(({ path }) => path === 'data.value')
      if (!data?.complete) throw new Error('Expected current source values')
      expect(hex(data.right)).toBe('0x40')
      worker.reply(0)
      expect(session.state().comparisons.compare).toBe(comparison)
    } finally { session.dispose() }
  })
})
