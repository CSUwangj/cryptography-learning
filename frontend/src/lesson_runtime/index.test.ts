import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { bits, executeWorkerRequest, hex } from '../crypto_graph'
import { aesKeyExpansionGraphNodesYaml } from '../../demos/aesKeyExpansionLesson'
import { aesCipherDemoDocuments } from '../../demos/aes128CipherLesson'
import { teachingSpnDemoDocuments } from '../../demos/teachingSpnLesson'
import {
  compileLesson,
  createBrowserLessonSession,
  decodeLessonValue,
  lessonDefaultLocale,
  lessonAssetUrl,
  rewriteLessonAssets,
  validateLessonDocuments,
  validateLessonMarkdown,
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
    expect(compiled.value.steps.map((step) => step.id)).toEqual(['introduction', 'enter-input', 'calculate', 'identify-operation'])
  })

  it('compiles typed equality checks with localized feedback', () => {
    const documents = fixture()

    expect(compileLesson(documents)).toMatchObject({
      ok: true,
      value: {
        steps: [expect.anything(), expect.anything(), {
          check: {
            kind: 'equal',
            actual: { step: 'calculate', output: 'mixed.value' },
            expected: { constant: 'expected' },
            feedback: { match: 'check-xor-match', mismatch: 'check-xor-mismatch' },
          },
        }, expect.anything()],
      },
    })
  })

  it('records equality feedback in local Step state', async () => {
    const documents = fixture()
    const lesson = documents.lesson.replace('value: "0x0ff0"', 'value: "0x00ff"')
    const previousWorker = globalThis.Worker
    globalThis.Worker = WorkerStub as unknown as typeof Worker
    try {
      const session = createBrowserLessonSession({ ...documents, lesson }, 'en-US')
      expect(session.ok).toBe(true)
      if (!session.ok) return
      await session.value.next()
      const result = await session.value.next()
      expect(result).toMatchObject({
        ok: true,
        value: {
          checkResults: {
            calculate: { kind: 'equal', matched: false, feedback: 'check-xor-mismatch' },
          },
        },
      })
      session.value.dispose()
    } finally {
      globalThis.Worker = previousWorker
    }
  })

  it('evaluates standalone equality checks when their Step opens', async () => {
    const documents = fixture()
    const lesson = documents.lesson.replace(/  - id: calculate[\s\S]*/, `  - id: compare-input
    check:
      kind: equal
      actual: {input: plaintext}
      expected: {constant: expected}
      feedback: {match: check-xor-match, mismatch: check-xor-mismatch}
`)
    const session = createBrowserLessonSession({ ...documents, lesson }, 'en-US')
    expect(session.ok).toBe(true)
    if (!session.ok) return
    await session.value.next()
    expect(await session.value.next()).toMatchObject({
      ok: true,
      value: {
        checkResults: {
          'compare-input': { kind: 'equal', matched: false, feedback: 'check-xor-mismatch' },
        },
      },
    })
    session.value.dispose()
  })

  it('keeps multiple-choice selection and feedback local to its Step', async () => {
    const previousWorker = globalThis.Worker
    globalThis.Worker = WorkerStub as unknown as typeof Worker
    try {
      const session = createBrowserLessonSession(fixture(), 'en-US')
      expect(session.ok).toBe(true)
      if (!session.ok) return
      await session.value.next()
      await session.value.next()
      await session.value.next()
      expect(session.value.selectChoice('and')).toMatchObject({
        ok: true,
        value: {
          checkResults: {
            'identify-operation': { kind: 'choice', selected: 'and', correct: false, feedback: 'feedback-and' },
          },
        },
      })
      session.value.dispose()
    } finally {
      globalThis.Worker = previousWorker
    }
  })

  it('keeps accepted operation diagnostics as local teaching outcomes', async () => {
    const documents = fixture()
    const lesson = documents.lesson.replace(
      '    check:\n      kind: equal',
      '    accepted_error_codes: [operation-failed]\n    check:\n      kind: equal',
    )
    const previousWorker = globalThis.Worker
    class WorkerStub {
      private listeners: Array<(event: MessageEvent<unknown>) => void> = []

      addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
        if (type === 'message') this.listeners.push(listener)
      }

      postMessage(request: { requestId: string }): void {
        queueMicrotask(() => this.listeners.forEach((listener) => listener({
          data: {
            requestId: request.requestId,
            kind: 'diagnostic',
            diagnostics: [{ code: 'operation-failed', message: 'Operation execution failed.', path: 'mixed', details: {} }],
          },
        } as MessageEvent<unknown>)))
      }

      terminate(): void {}
    }
    globalThis.Worker = WorkerStub as unknown as typeof Worker
    try {
      const session = createBrowserLessonSession({ ...documents, lesson }, 'en-US')
      expect(session.ok).toBe(true)
      if (!session.ok) return
      await session.value.next()
      expect(await session.value.next()).toMatchObject({
        ok: true,
        value: {
          acceptedDiagnostics: {
            calculate: { code: 'operation-failed' },
          },
        },
      })
      expect(await session.value.next()).toMatchObject({ ok: true, value: { stepId: 'identify-operation' } })
      session.value.dispose()
    } finally {
      globalThis.Worker = previousWorker
    }
  })

  it('executes descriptor-free Steps on entry and when returning after an input change', async () => {
    const documents = fixture()
    const previousWorker = globalThis.Worker
    globalThis.Worker = WorkerStub as unknown as typeof Worker
    try {
      const first = createBrowserLessonSession({
        ...documents,
        lesson: documents.lesson.replace(/  - id: introduction[\s\S]*?(?=  - id: calculate)/, ''),
      }, 'en-US')
      expect(first.ok).toBe(true)
      if (!first.ok) return
      const entered = await first.value.enter()
      expect(entered).toMatchObject({ ok: true, value: { stepId: 'calculate', checkResults: { calculate: { matched: true } } } })
      if (!entered.ok) return
      expect(hex(entered.value.snapshots.calculate.outputs['mixed.value'] as never)).toBe('0x0ff0')
      first.value.dispose()

      const session = createBrowserLessonSession(documents, 'en-US')
      expect(session.ok).toBe(true)
      if (!session.ok) return
      await session.value.next()
      await session.value.next()
      await session.value.next()
      expect(session.value.setInput('plaintext', '0x0000').ok).toBe(true)
      const returned = await session.value.previous()
      expect(returned.stepId).toBe('calculate')
      expect(hex(returned.snapshots.calculate.outputs['mixed.value'] as never)).toBe('0x00ff')
      session.value.dispose()
    } finally {
      globalThis.Worker = previousWorker
    }
  })

  it('preserves accepted dry-run diagnostics', () => {
    const documents = fixture()
    const lesson = documents.lesson.replace(/steps:[\s\S]*/, `steps:
  - id: fail
    execute:
      graph: failure
      bindings: {}
    accepted_error_codes: [operation-failed]
`).replace('steps:\n', `  failure:
    nodes:
      - id: fail
        operation: test.throw@1
    outputs:
      - {node: fail, port: value}
steps:
`)

    expect(validateLessonDocuments({ ...documents, lesson })).toMatchObject({
      ok: true,
      dryRun: {
        steps: [{
          id: 'fail',
          execution: 'accepted-error',
          diagnostics: [{ code: 'operation-failed', path: 'fail', details: {} }],
        }],
      },
    })
  })

  it('enforces declared dry-run time limits', () => {
    const documents = fixture()
    const lesson = documents.lesson.replace('steps:\n', 'limits: {timeoutMs: 1}\nsteps:\n')
    const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(2)
    try {
      expect(validateLessonDocuments({ ...documents, lesson })).toMatchObject({
        ok: false,
        diagnostics: [{ code: 'execution.timeout', path: 'steps.calculate.execute' }],
      })
    } finally {
      clock.mockRestore()
    }
  })

  it('gives Node and browser adapters identical validation results', () => {
    expect(validateLessonDocuments(fixture())).toMatchObject({ ok: true, diagnostics: [], dryRun: expect.anything() })
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

  it('reads the default locale through the strict Lesson YAML parser', () => {
    expect(lessonDefaultLocale('default_locale : "en-US"')).toBe('en-US')
    expect(lessonDefaultLocale('default_locale: [')).toBeUndefined()
  })

  it('validates Lesson directories through the Node command', () => {
    expect(JSON.parse(execFileSync(process.execPath, ['scripts/validate_lessons.mjs', 'src/lesson_runtime/fixture'], {
      cwd: frontendDirectory,
      encoding: 'utf8',
    }))).toMatchObject({
      ok: true,
      diagnostics: [],
      dryRun: {
        steps: [
          { id: 'introduction' },
          { id: 'enter-input' },
          { id: 'calculate', check: { kind: 'equal', matched: true } },
          { id: 'identify-operation', check: { kind: 'choice' } },
        ],
      },
    })
    const missing = spawnSync(process.execPath, ['scripts/validate_lessons.mjs', 'missing'], {
      cwd: frontendDirectory,
      encoding: 'utf8',
    })
    expect(missing.status).toBe(1)
    expect(JSON.parse(missing.stdout)).toMatchObject({ ok: false })
  }, 60_000)

  it('validates descriptor-free and descriptor-using Lesson directories through the Node command with the Visualizer catalog', () => {
    const root = mkdtempSync(join(tmpdir(), 'validate-lessons-'))
    const validate = (name: string, documents: LessonDocuments) => {
      const directory = join(root, name)
      mkdirSync(join(directory, 'locales'), { recursive: true })
      writeFileSync(join(directory, 'lesson.yaml'), documents.lesson)
      for (const [locale, source] of Object.entries(documents.locales)) writeFileSync(join(directory, 'locales', `${locale}.yaml`), source)
      const result = spawnSync(process.execPath, ['scripts/validate_lessons.mjs', directory], { cwd: frontendDirectory, encoding: 'utf8' })
      return { status: result.status, report: JSON.parse(result.stdout) }
    }
    try {
      expect(validate('aes', aesCipherDemoDocuments(128))).toMatchObject({
        status: 0,
        report: { ok: true, diagnostics: [], dryRun: { steps: [{ id: 'enter-input' }, { id: 'expand-key' }, { id: 'encrypt' }, { id: 'decrypt' }] } },
      })
      expect(validate('spn', teachingSpnDemoDocuments)).toMatchObject({
        status: 0,
        report: { ok: true, diagnostics: [], dryRun: { steps: [{ id: 'visualize' }] } },
      })
      const unknown = { ...teachingSpnDemoDocuments, lesson: teachingSpnDemoDocuments.lesson.replace('teaching-spn@1', 'unknown-trace@1') }
      expect(validate('unknown', unknown)).toMatchObject({
        status: 1,
        report: { ok: false, diagnostics: [{ code: 'lesson.invalid-input', path: 'steps.0.visualizer.id' }] },
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)

  it('accepts contained assets and HTTPS links while rejecting unsafe prose', () => {
    expect(validateLessonMarkdown(
      '# Intro\n![Diagram](assets/xor.png)\n[Reference](https://example.test/reference)',
      'texts.introduction',
    )).toEqual([])
    expect(lessonAssetUrl('xor-intro', 'assets/xor.png')).toBe('/learning-assets/xor-intro/xor.png')
    expect(rewriteLessonAssets('[image](<assets/xor.png>)\n[image]: assets/xor.png', 'xor-intro'))
      .toBe('[image](/learning-assets/xor-intro/xor.png)\n[image]: /learning-assets/xor-intro/xor.png')
    expect(validateLessonMarkdown('<script>alert(1)</script>\n[bad](javascript:alert(1))', 'texts.introduction'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'lesson.unsafe-markdown' }),
      ]))
    expect(validateLessonMarkdown('[bad][url]\n[url]: http://example.test', 'texts.introduction'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'lesson.unsafe-markdown' }),
      ]))
    expect(validateLessonMarkdown('`<script>`', 'texts.introduction')).toEqual([])
  })

  it('rejects schema, binding, limit, and Catalog errors', () => {
    const source = fixture().lesson
    for (const lesson of [
      source.replace('id: xor-intro', 'extra: true\nid: xor-intro'),
      source.replace('{constant: mask}', '{constant: absent}'),
      source.replace('size: 16}\n    encoding: hex\n    value', 'size: 8}\n    encoding: hex\n    value'),
      source.replace('{node: mixed, port: value}', '{node: mixed, port: value, typo: true}'),
      source.replace('        right.value: {constant: mask}', '        right.value: {constant: mask}\n    accepted_error_codes: ["invented"]'),
      source.replace('correct: xor', 'correct: absent'),
      source.replace('- id: and', '- id: xor'),
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
      session.value.previous()
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

  it('executes Caesar policy inputs through the Lesson session without mutating prior snapshots', async () => {
    const documents: LessonDocuments = {
      lesson: `version: 1
id: caesar
default_locale: en-US
inputs:
  plaintext: {type: {family: alphabet-text, mapping: latin}, encoding: text, default: "ABC"}
  shift: {type: {family: integer, signed: true, safe: true}, encoding: integer, default: 3}
  policy: {type: {family: alphabet-policy}, encoding: policy, default: preserve}
constants: {}
graphs:
  caesar:
    alphabetMappings: [{id: latin, symbols: [A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z]}]
    nodes:
      - {id: text, operation: core.source@1, parameters: {type: {family: alphabet-text, mapping: latin}}}
      - {id: shift, operation: core.source@1, parameters: {type: {family: integer, signed: true, safe: true}}}
      - {id: policy, operation: core.source@1, parameters: {type: {family: alphabet-policy}}}
      - id: cipher
        operation: classical.caesar@1
        inputs:
          text: {node: text, port: value}
          shift: {node: shift, port: value}
          policy: {node: policy, port: value}
    outputs: [{node: cipher, port: text}]
steps:
  - id: enter
    inputs:
      - {input: plaintext, prompt: plaintext}
      - {input: shift, prompt: shift}
      - {input: policy, prompt: policy}
  - id: execute
    execute:
      graph: caesar
      bindings:
        text.value: {input: plaintext}
        shift.value: {input: shift}
        policy.value: {input: policy}
`,
      locales: {
        'en-US': `title: Caesar
summary: Encrypt alphabet text.
texts: {plaintext: Plaintext, shift: Shift, policy: Policy}
`,
        'zh-CN': `title: 凯撒
summary: 加密字母表文本。
texts: {plaintext: 明文, shift: 位移, policy: 策略}
`,
      },
    }
    const previousWorker = globalThis.Worker
    const compiledGraphIds: string[] = []
    const compiledGraphs = new Map()
    let workerInstances = 0
    let terminatedWorkers = 0
    class TrackingWorker {
      private listeners: Array<(event: MessageEvent<unknown>) => void> = []

      constructor() {
        workerInstances += 1
      }

      addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
        if (type === 'message') this.listeners.push(listener)
      }

      postMessage(request: Parameters<typeof executeWorkerRequest>[0]): void {
        if (request.kind === 'execute') compiledGraphIds.push(request.payload.compiledGraphId ?? '')
        queueMicrotask(() => this.listeners.forEach((listener) =>
          listener({ data: executeWorkerRequest(request, compiledGraphs) } as MessageEvent<unknown>)))
      }

      terminate(): void {
        terminatedWorkers += 1
      }
    }
    globalThis.Worker = TrackingWorker as unknown as typeof Worker
    try {
      const session = createBrowserLessonSession(documents, 'en-US')
      expect(session.ok).toBe(true)
      if (!session.ok) return
      const first = await session.value.next()
      expect(first.ok && first.value.snapshots.execute.outputs['cipher.text']).toMatchObject({ symbols: ['D', 'E', 'F'] })
      const firstSnapshot = first.ok ? first.value.snapshots.execute : undefined

      await session.value.previous()
      expect(session.value.setInput('plaintext', 'Ab C!').ok).toBe(true)
      expect(session.value.setInput('policy', 'strict').ok).toBe(true)
      const strict = await session.value.next()
      expect(strict.ok && strict.value.executionDiagnostics.execute).toMatchObject({ code: 'cipher.unmapped-symbol' })
      expect(firstSnapshot?.outputs['cipher.text']).toMatchObject({ symbols: ['D', 'E', 'F'] })
      expect(compiledGraphIds).toEqual(['0:caesar', '0:caesar'])
      expect(workerInstances).toBe(1)
      expect(compiledGraphs.size).toBe(1)
      expect(terminatedWorkers).toBe(0)

      await session.value.previous()
      expect(session.value.setInput('shift', '3.5')).toMatchObject({
        ok: false,
        diagnostics: [{ code: 'cipher.invalid-key', details: { reason: 'fraction' } }],
      })
      const invalidKey = await session.value.next()
      expect(invalidKey.ok && invalidKey.value).toMatchObject({
        inputs: { shift: '3.5' },
        executionDiagnostics: { execute: { code: 'cipher.invalid-key' } },
      })
      session.value.dispose()
      expect(terminatedWorkers).toBe(1)
    } finally {
      globalThis.Worker = previousWorker
    }
  })

  it('decodes hex-block Lesson inputs as exact-length, unprefixed hex and rejects other forms (#84)', () => {
    const documentsFor = (defaultValue: string): LessonDocuments => ({
      lesson: `version: 1
id: hex-block-fixture
default_locale: en-US
inputs:
  block:
    type: {family: bits, size: 16}
    encoding: hex-block
    default: "${defaultValue}"
constants: {}
graphs:
  identity:
    nodes:
      - {id: block, operation: core.source@1, parameters: {type: {family: bits, size: 16}}}
    outputs: [{node: block, port: value}]
steps:
  - id: run
    execute:
      graph: identity
      bindings:
        block.value: {input: block}
`,
      locales: { 'en-US': 'title: Hex block\nsummary: Decode a fixed-width hex input.\ntexts: {}' },
    })

    const valid = compileLesson(documentsFor('0f0f'))
    expect(valid.ok).toBe(true)
    if (valid.ok) expect(hex(valid.value.inputs.block.default as never)).toBe('0x0f0f')

    // Rejected respectively for: a `0x` prefix, embedded whitespace, an odd (truncated) digit
    // count, and a non-hex character - all four cases the scope for #84 calls out by name.
    for (const invalid of ['0x0f0f', '0f 0f', '0f0', '0f0g']) {
      expect(compileLesson(documentsFor(invalid))).toMatchObject({
        ok: false,
        diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'lesson.invalid-input', path: 'inputs.block.default' })]),
      })
    }
  })

  it('rejects wrong-width hex-block keys with expectedBits/actualBits for declared AES variants (#85)', () => {
    const matching = {
      128: '000102030405060708090a0b0c0d0e0f',
      192: '000102030405060708090a0b0c0d0e0f1011121314151617',
      256: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    } as const
    for (const declared of [128, 192, 256] as const) {
      expect(decodeLessonValue({ family: 'bits', size: declared }, 'hex-block', matching[declared]).ok).toBe(true)
      for (const supplied of [128, 192, 256] as const) {
        if (supplied === declared) continue
        expect(decodeLessonValue({ family: 'bits', size: declared }, 'hex-block', matching[supplied])).toMatchObject({
          ok: false,
          diagnostics: [{
            code: 'lesson.invalid-input',
            details: { expectedBits: declared, actualBits: supplied },
          }],
        })
      }
      // Malformed: no fabricated actualBits
      expect(decodeLessonValue({ family: 'bits', size: declared }, 'hex-block', '0f0g')).toMatchObject({
        ok: false,
        diagnostics: [{ code: 'lesson.invalid-input', details: {} }],
      })
      expect(decodeLessonValue({ family: 'bits', size: declared }, 'hex-block', '0f0')).toMatchObject({
        ok: false,
        diagnostics: [{ code: 'lesson.invalid-input', details: {} }],
      })
    }
  })

  it('compiles explicit AES presentation metadata on execution steps (#85)', () => {
    for (const variant of [128, 192, 256] as const) {
      const result = compileLesson(aesCipherDemoDocuments(variant))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.steps.map((step) => [step.id, step.presentation])).toEqual([
        ['enter-input', undefined],
        ['expand-key', { kind: 'key-expansion', algorithm: 'AES', variant }],
        ['encrypt', { kind: 'block-cipher', algorithm: 'AES', variant, direction: 'encrypt' }],
        ['decrypt', { kind: 'block-cipher', algorithm: 'AES', variant, direction: 'decrypt' }],
      ])
    }

    const documents = aesCipherDemoDocuments(256)
    const standaloneSchedule = compileLesson({
      ...documents,
      lesson: documents.lesson.replace('kind: block-cipher\n      algorithm: AES\n      variant: 256\n      direction: encrypt', 'kind: key-expansion\n      algorithm: AES\n      variant: 256'),
    })
    expect(standaloneSchedule.ok).toBe(true)
    if (!standaloneSchedule.ok) return
    expect(standaloneSchedule.value.steps[1].presentation).toEqual({ kind: 'key-expansion', algorithm: 'AES', variant: 256 })
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

  it('supplies one execution of an AES-shaped key-expansion graph to both a consuming encryption step and its own detail trace (#83)', async () => {
    // Reuses the demo Lesson's `expand` graph node list (same small Nk=2, Nr=1 key schedule
    // exercising the AES key-word, rot-word, sub-word, rcon-word, word-xor, round-key
    // primitives and FIPS-197 node naming) rather than a second, drift-prone copy of it; this
    // test's own concern is proving the composition, typed round-key outputs, and that one
    // Lesson execution feeds both an encryption-shaped consumer and the key-expansion trace.
    const documents: LessonDocuments = {
      lesson: `version: 1
id: aes-key-expansion-fixture
default_locale: en-US
inputs:
  key: {type: {family: bits, size: 64}, encoding: hex, default: "0x0011223344556677"}
  plaintext: {type: {family: bits, size: 128}, encoding: hex, default: "0x000102030405060708090a0b0c0d0e0f"}
constants: {}
graphs:
  expand:
    traceLevel: detail
    nodes:
${aesKeyExpansionGraphNodesYaml}
    outputs:
      - {node: round-key-0, port: value}
      - {node: round-key-1, port: value}
  encrypt:
    nodes:
      - {id: plaintext, operation: core.source@1, parameters: {type: {family: bits, size: 128}}}
      - {id: roundkey, operation: core.source@1, parameters: {type: {family: bits, size: 128}}}
      - id: xor
        operation: core.xor@1
        inputs:
          left: {node: plaintext, port: value}
          right: {node: roundkey, port: value}
    outputs: [{node: xor, port: value}]
steps:
  - id: enter-input
    inputs:
      - {input: key, prompt: key}
      - {input: plaintext, prompt: plaintext}
  - id: expand-key
    execute:
      graph: expand
      bindings:
        key.value: {input: key}
  - id: encrypt
    execute:
      graph: encrypt
      bindings:
        plaintext.value: {input: plaintext}
        roundkey.value: {step: expand-key, output: round-key-0.value}
`,
      locales: {
        'en-US': 'title: AES key expansion\nsummary: Expand a key and consume its first round key.\ntexts: {key: Key, plaintext: Plaintext}',
        'zh-CN': 'title: AES 密钥扩展\nsummary: 扩展密钥并使用其第一轮密钥。\ntexts: {key: 密钥, plaintext: 明文}',
      },
    }

    const compiled = compileLesson(documents)
    expect(compiled.ok).toBe(true)

    const previousWorker = globalThis.Worker
    globalThis.Worker = WorkerStub as unknown as typeof Worker
    try {
      const session = createBrowserLessonSession(documents, 'en-US')
      expect(session.ok).toBe(true)
      if (!session.ok) return
      await session.value.next()
      const result = await session.value.next()
      expect(result.ok).toBe(true)
      if (!result.ok) return

      // One Lesson execution pass supplies both: the encryption-shaped step's own output...
      expect(hex(result.value.snapshots.encrypt.outputs['xor.value'] as never)).toBe('0x0010203040506070f52bdd23b57abf50')
      // ...and the key-expansion step's full detail trace, with stable round/row identifiers,
      // available for a key-expansion lane driven by the same execution.
      const expandTrace = result.value.snapshots['expand-key'].trace as readonly import('../crypto_graph').TraceEvent[]
      expect(expandTrace.filter((event) => event.path.startsWith('round-key-')).map((event) =>
        [event.path, event.round, hex(event.value as never)])).toEqual([
        ['round-key-0', 0, '0x0011223344556677fd22d728b977b15f'],
        ['round-key-1', 1, '0x0aea187eb39da9215039e513e3a44c32'],
      ])
      expect(expandTrace.some((event) => event.path === 'word-2-rot' && event.stage === 'rot-word')).toBe(true)
      session.value.dispose()
    } finally {
      globalThis.Worker = previousWorker
    }
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
