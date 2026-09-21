import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { bits, executeWorkerRequest, hex } from '../crypto_graph'
import {
  compileLesson,
  createBrowserLessonSession,
  validateLessonDocuments,
  type LessonDocuments,
} from './index'

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), 'fixture')
const frontendDirectory = join(fixtureDirectory, '..', '..', '..')

const fixture = (): LessonDocuments => ({
  lesson: readFileSync(join(fixtureDirectory, 'lesson.yaml'), 'utf8'),
  locales: {
    'en-US': readFileSync(join(fixtureDirectory, 'locales', 'en-US.yaml'), 'utf8'),
    'zh-CN': readFileSync(join(fixtureDirectory, 'locales', 'zh-CN.yaml'), 'utf8'),
  },
})

const normalizedLesson = (lesson: unknown): unknown => JSON.parse(JSON.stringify(lesson))

describe('Lesson Runtime compiler (#29)', () => {
  it('compiles bilingual XOR fixture and executes supplied inputs', () => {
    const compiled = compileLesson(fixture())
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) return

    const execution = compiled.value.graphs.xor.execute({
      'left.value': compiled.value.inputs.plaintext.default,
      'right.value': compiled.value.constants.mask,
    })
    expect(execution.ok).toBe(true)
    if (!execution.ok) return
    expect(hex(execution.value.outputs['mixed.value'] as never)).toBe('0x0ff0')
    expect(compiled.value.steps.map((step) => step.id)).toEqual(['introduction', 'enter-input', 'calculate'])
  })

  it('gives Node and browser adapters identical validation results', () => {
    expect(validateLessonDocuments(fixture())).toEqual({ ok: true, diagnostics: [] })
    const browserDocuments = { ...fixture(), locales: { 'en-US': fixture().locales['en-US'] } }
    const browser = createBrowserLessonSession(browserDocuments, 'zh-CN')
    expect(browser.ok).toBe(true)
    if (!browser.ok) return
    expect(browser.value.locale).toBe('en-US')
    const compiled = compileLesson(browserDocuments)
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) return
    expect(normalizedLesson(browser.value.lesson)).toEqual(normalizedLesson(compiled.value))

    const malformed = { ...fixture(), lesson: fixture().lesson.replace('version: 1', 'version: 2') }
    const node = validateLessonDocuments(malformed)
    const browserMalformed = createBrowserLessonSession(malformed, 'zh-CN')
    expect(node.ok).toBe(false)
    expect(browserMalformed.ok).toBe(false)
    if (node.ok || browserMalformed.ok) return
    expect(browserMalformed.diagnostics.map(({ message: _, ...diagnostic }) => diagnostic))
      .toEqual(node.diagnostics.map(({ message: _, ...diagnostic }) => diagnostic))
    expect(browserMalformed.diagnostics[0].message).toBe('不支持的课程版本。')
  })

  it('validates Lesson directories through the Node command', () => {
    expect(JSON.parse(execFileSync(process.execPath, ['scripts/validate_lessons.mjs', 'src/lesson_runtime/fixture'], {
      cwd: frontendDirectory,
      encoding: 'utf8',
    }))).toEqual({ ok: true, diagnostics: [] })
    const missing = spawnSync(process.execPath, ['scripts/validate_lessons.mjs', 'missing'], {
      cwd: frontendDirectory,
      encoding: 'utf8',
    })
    expect(missing.status).toBe(1)
    expect(JSON.parse(missing.stdout)).toMatchObject({ ok: false })
  })

  it('rejects schema, binding, limit, and Catalog errors', () => {
    const source = fixture().lesson
    for (const lesson of [
      source.replace('id: xor-intro', 'extra: true\nid: xor-intro'),
      source.replace('{constant: mask}', '{constant: absent}'),
      source.replace('size: 16}\n    encoding: hex\n    value', 'size: 8}\n    encoding: hex\n    value'),
      source.replace('{node: mixed, port: value}', '{node: mixed, port: value, typo: true}'),
      source.replace('        right.value: {constant: mask}', '        right.value: {constant: mask}\n    accepted_error_codes: ["invented"]'),
      `${source}\nlimits: {timeoutMs: 1001}\n`,
    ]) expect(compileLesson({ ...fixture(), lesson })).toMatchObject({ ok: false })

    const visualizer = source.replace(
      '        right.value: {constant: mask}\n',
      `        right.value: {constant: mask}
    visualizer:
      id: test@1
      bindings:
        result: {step: calculate, output: mixed.value}
      options: {show: true}
`,
    )
    const catalog = {
      get: (id: string) => id === 'test@1'
        ? { id, inputSlots: { result: { family: 'bits' as const, size: 16 } }, traceLevels: [], tracePaths: [], options: { show: 'boolean' as const } }
        : undefined,
    }
    expect(compileLesson({ ...fixture(), lesson: visualizer }, catalog).ok).toBe(true)
    expect(compileLesson({ ...fixture(), lesson: visualizer.replace('show: true', 'show: "yes"') }, catalog)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'lesson.invalid-input', path: 'steps.2.visualizer.options.show' })]),
    })
  })

  it('invalidates and recomputes execution snapshots after an input change', async () => {
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
      const session = createBrowserLessonSession(fixture(), 'en-US')
      expect(session.ok).toBe(true)
      if (!session.ok) return
      await session.value.next()
      const pending = session.value.next()
      expect(session.value.setInput('plaintext', bits(16, Uint8Array.of(0, 0))).ok).toBe(true)
      await pending
      expect(session.value.state().snapshots).toEqual({})
      const first = await session.value.next()
      expect(first.ok && hex(first.value.snapshots.calculate.outputs['mixed.value'] as never)).toBe('0x00ff')
      session.value.previous()
      expect(session.value.setInput('plaintext', 'invalid').ok).toBe(false)
      expect(session.value.state().inputs.plaintext).toBe('invalid')
      expect(session.value.state().snapshots).toEqual({})
      expect(session.value.setInput('plaintext', bits(16, Uint8Array.of(0x0f, 0x0f))).ok).toBe(true)
      const second = await session.value.next()
      expect(second.ok && hex(second.value.snapshots.calculate.outputs['mixed.value'] as never)).toBe('0x0ff0')
      const node = compileLesson(fixture())
      expect(node.ok).toBe(true)
      if (node.ok && second.ok) {
        const snapshot = node.value.graphs.xor.execute({
          'left.value': node.value.inputs.plaintext.default,
          'right.value': node.value.constants.mask,
        })
        expect(snapshot.ok).toBe(true)
        if (snapshot.ok) {
          expect(normalizedLesson({
            outputs: second.value.snapshots.calculate.outputs,
            trace: second.value.snapshots.calculate.trace,
          })).toEqual(normalizedLesson({
            outputs: snapshot.value.outputs,
            trace: snapshot.value.trace,
          }))
        }
      }
      session.value.dispose()
    } finally {
      globalThis.Worker = previousWorker
    }
  })

  it('uses stable diagnostics with source locations and rejects forbidden YAML', () => {
    const unsupported = compileLesson({ ...fixture(), lesson: fixture().lesson.replace('version: 1', 'version: 2') })
    expect(unsupported).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'lesson.unsupported-version', path: 'version', span: { file: 'lesson.yaml', line: 1, column: 10 }, details: { version: 2 } }],
    })

    for (const lesson of [
      `${fixture().lesson}\ncopy: &copy test\n`,
      `${fixture().lesson}\ntag: !custom value\n`,
      `${fixture().lesson}\ntag: !<tag:example.com,2026:custom> value\n`,
      `${fixture().lesson}\nbase: &base {value: test}\ncopy: {<<: *base}\n`,
    ]) expect(compileLesson({ ...fixture(), lesson })).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'lesson.yaml-restriction' })]),
    })
    expect(compileLesson({ ...fixture(), lesson: `version: 1\n${fixture().lesson}` })).toMatchObject({ ok: false, diagnostics: [{ code: 'lesson.yaml-syntax' }] })
  })

  it('requires every supplied locale to include all referenced text', () => {
    const documents = fixture()
    expect(compileLesson({
      ...documents,
      locales: { ...documents.locales, 'zh-CN': documents.locales['zh-CN'].replace('  plaintext-prompt:', '  missing-prompt:') },
    })).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: 'lesson.missing-text',
        path: 'texts.plaintext-prompt',
        span: expect.objectContaining({ file: 'locales/zh-CN.yaml' }),
      })]),
    })
  })
})
