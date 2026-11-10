import { afterEach, describe, expect, it, vi } from 'vitest'
import { parse, stringify } from 'yaml'
import { executeWorkerRequest, type WorkerRequest } from '../crypto_graph'
import { visualizerCatalog } from '../visualizers'
import { i18n } from '../app'
import { createBrowserLessonSession } from './index'
import { caesarV2Documents } from '../../demos/caesarLesson'

class LocalWorker extends EventTarget {
  postMessage(request: WorkerRequest): void {
    queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: executeWorkerRequest(request) })))
  }
  terminate(): void {}
}
afterEach(() => vi.unstubAllGlobals())

describe('v2 Caesar Lesson (#145)', () => {
  it('executes a declared classical view with its custom alphabet through the Lesson session', async () => {
    vi.stubGlobal('Worker', LocalWorker)
    const created = createBrowserLessonSession(caesarV2Documents, 'en-US', i18n.getFixedT('en-US', 'translations'), visualizerCatalog)
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
    const session = created.value
    try {
      const result = await session.next()
      if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
      expect(result.value.snapshots.rotate.outputs['rotated.text']).toMatchObject({ symbols: [...'βγ😀 ?'] })
      expect(result.value.executionIdentities.rotate).toBeDefined()
      expect(session.lesson.steps[1].visualizer?.id).toBe('classical-cipher@1')
    } finally {
      session.dispose()
    }
  })

  it.each([
    [-1, '😀αγ ?'],
    [-6, '😀αγ ?'],
    [Number.MAX_SAFE_INTEGER, 'βγ😀 ?'],
    [Number.MIN_SAFE_INTEGER, '😀αγ ?'],
  ])('retains signed shift %s and replaces the current result without mutating its predecessor', async (shift, expected) => {
    vi.stubGlobal('Worker', LocalWorker)
    const created = createBrowserLessonSession(caesarV2Documents, 'en-US', i18n.getFixedT('en-US', 'translations'), visualizerCatalog)
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
    const session = created.value
    try {
      const first = await session.next()
      if (!first.ok) throw new Error(JSON.stringify(first.diagnostics))
      expect(session.setInput('rotation', String(shift)).ok).toBe(true)
      expect(session.state().snapshots).toEqual({})
      const replacement = await session.enter()
      if (!replacement.ok) throw new Error(JSON.stringify(replacement.diagnostics))
      expect(replacement.value.inputs.rotation).toMatchObject({ value: shift })
      expect(replacement.value.snapshots.rotate.outputs['rotated.text']).toMatchObject({ symbols: [...String(expected)] })
      expect(replacement.value.executionIdentities.rotate).not.toBe(first.value.executionIdentities.rotate)
      expect(first.value.snapshots.rotate.outputs['rotated.text']).toMatchObject({ symbols: [...'βγ😀 ?'] })
    } finally {
      session.dispose()
    }
  })

  it('preserves Strict diagnostics and safe-integer input validation', async () => {
    vi.stubGlobal('Worker', LocalWorker)
    const created = createBrowserLessonSession(caesarV2Documents, 'en-US', i18n.getFixedT('en-US', 'translations'), visualizerCatalog)
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
    const session = created.value
    try {
      session.setInput('policy', 'strict')
      const strict = await session.next()
      expect(strict.ok && strict.value.executionDiagnostics.rotate).toMatchObject({ code: 'cipher.unmapped-symbol', details: { symbol: ' ', index: 3, strict: true } })
      expect(session.setInput('rotation', '1.5')).toMatchObject({ ok: false, diagnostics: [{ code: 'cipher.invalid-key' }] })
    } finally {
      session.dispose()
    }
  })

  it('supports a fixed example with no editable inputs or input Step', async () => {
    vi.stubGlobal('Worker', LocalWorker)
    const lesson = parse(caesarV2Documents.lesson)
    for (const [id, input] of Object.entries(lesson.inputs) as [string, { type: unknown, encoding: string, default: unknown }][]) {
      lesson.constants[id] = { type: input.type, encoding: input.encoding, value: input.default }
    }
    lesson.inputs = {}
    lesson.steps.shift()
    for (const bindings of [lesson.steps[0].execute.bindings, lesson.steps[0].visualizer.bindings]) {
      for (const [port, reference] of Object.entries(bindings) as [string, { input?: string }][]) {
        if (reference.input) bindings[port] = { constant: reference.input }
      }
    }
    const created = createBrowserLessonSession({ ...caesarV2Documents, lesson: stringify(lesson) }, 'en-US', i18n.getFixedT('en-US', 'translations'), visualizerCatalog)
    if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
    try {
      const result = await created.value.enter()
      expect(result.ok && result.value.snapshots.rotate.outputs['rotated.text']).toMatchObject({ symbols: [...'βγ😀 ?'] })
      expect(created.value.state().inputs).toEqual({})
    } finally {
      created.value.dispose()
    }
  })
})
