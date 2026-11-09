import { afterEach, describe, expect, it, vi } from 'vitest'
import { genericComparisonDocuments } from '../../demos/genericComparisonLesson'
import i18n from '../app/i18n'
import { executeWorkerRequest, hex, type WorkerRequest } from '../crypto_graph'
import { visualizerCatalog } from '../visualizers'
import { compileLesson, createBrowserLessonSession } from './index'

class LocalWorker extends EventTarget {
  postMessage(request: WorkerRequest): void {
    queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: executeWorkerRequest(request) })))
  }
  terminate(): void {}
}
afterEach(() => vi.unstubAllGlobals())

describe('Generic v2 Lesson comparison (#141)', () => {
  it('accepts independent data and key changes and executes only on entering the comparison Step', async () => {
    vi.stubGlobal('Worker', LocalWorker)
    const compiled = compileLesson(genericComparisonDocuments, visualizerCatalog)
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
    expect(compiled.value.steps[1].presentation).toMatchObject({ rowOrder: ['data.value', 'key.value', 'mix.value', 'substitute.value', 'result.value'] })
    const created = createBrowserLessonSession(genericComparisonDocuments, 'en-US', i18n.getFixedT('en-US', 'translations'), visualizerCatalog)
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
    const session = created.value
    try {
      expect(await session.enter()).toMatchObject({ ok: true, value: { comparisons: {} } })
      expect(session.setInput('changed-data', '0x00ff').ok).toBe(true)
      expect(session.setInput('changed-key', '0x8000').ok).toBe(true)
      expect(session.state().comparisons).toEqual({})
      const entered = await session.next()
      if (!entered.ok) throw new Error(JSON.stringify(entered.diagnostics))
      const data = entered.value.comparisons.compare.checkpoints.find(({ path }) => path === 'data.value')
      expect(data).toMatchObject({ complete: true, changedBits: 8, ratio: 0.5 })
      if (!data?.complete) throw new Error('Expected a complete input comparison')
      expect([hex(data.left), hex(data.right), hex(data.mask)]).toEqual(['0x0f0f', '0x00ff', '0x0ff0'])
      expect(entered.value.comparisons.compare.checkpoints.find(({ path }) => path === 'mix.value')).toMatchObject({ complete: true, changedBits: 9 })
      await session.previous()
      expect(session.setInput('changed-data', '0x0000').ok).toBe(true)
      expect(session.state().comparisons).toEqual({})
      expect(session.state().executionIdentities).toEqual({})
      await session.next()
      expect(session.state().comparisons.compare.checkpoints[0]).toMatchObject({ complete: true, changedBits: 8 })
      expect(hex(data.right)).toBe('0x00ff')
    } finally {
      session.dispose()
    }
  })
  it('keeps comparison optional and preserves typed input and binding validation', () => {
    const withoutComparison = genericComparisonDocuments.lesson.replace(/  - id: compare[\s\S]*/, '')
    expect(compileLesson({ ...genericComparisonDocuments, lesson: withoutComparison }, visualizerCatalog).ok).toBe(true)
    for (const invalid of [
      genericComparisonDocuments.lesson.replace('default: "0x00ff"', 'default: "0x10000"'),
      genericComparisonDocuments.lesson.replace('changed: {input: changed-data}', 'changed: {input: absent}'),
      genericComparisonDocuments.lesson.replace('changed-data: {type: {family: bits, size: 16}', 'changed-data: {type: {family: bits, size: 8}').replace('default: "0x00ff"', 'default: "0xff"'),
    ]) expect(compileLesson({ ...genericComparisonDocuments, lesson: invalid }, visualizerCatalog).ok).toBe(false)
  })

  it('rejects invalid edits and ignores a delayed old comparison after a replacement request', async () => {
    class DelayedWorker extends LocalWorker {
      static instance: DelayedWorker
      readonly requests: WorkerRequest[] = []
      constructor() { super(); DelayedWorker.instance = this }
      override postMessage(request: WorkerRequest): void { this.requests.push(structuredClone(request)) }
      reply(index: number): void {
        this.dispatchEvent(new MessageEvent('message', { data: executeWorkerRequest(this.requests[index]) }))
      }
    }
    vi.stubGlobal('Worker', DelayedWorker)
    const created = createBrowserLessonSession(genericComparisonDocuments, 'en-US', i18n.getFixedT('en-US', 'translations'), visualizerCatalog)
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
    const session = created.value
    try {
      const old = session.next()
      const worker = DelayedWorker.instance
      expect(session.setInput('changed-data', '0x10000').ok).toBe(false)
      expect(session.state().comparisons).toEqual({})
      expect((await session.enter()).ok).toBe(false)
      expect(session.setInput('changed-data', '0x0000').ok).toBe(true)
      const replacement = session.enter()
      worker.reply(0)
      expect(session.state().comparisons).toEqual({})
      worker.reply(1)
      expect((await replacement).ok).toBe(true)
      expect((await old).ok).toBe(false)
      const comparison = session.state().comparisons.compare
      expect(comparison.checkpoints[0]).toMatchObject({ complete: true })
      const data = comparison.checkpoints[0]
      if (!data.complete) throw new Error('Expected a complete checkpoint')
      expect(hex(data.right)).toBe('0x0000')
      worker.reply(0)
      expect(session.state().comparisons.compare).toBe(comparison)
      expect(session.state().executionDiagnostics).toEqual({})
    } finally { session.dispose() }
  })

})
