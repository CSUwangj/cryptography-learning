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
import { teachingSpnV2DemoDocuments } from '../../demos/teachingSpnV2Lesson'
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
const aes128V2Fixture: LessonDocuments = {
  lesson: readFileSync(join(fixtureDirectory, 'aes128-v2.yaml'), 'utf8'),
  locales: {
    'en-US': 'title: AES-128 v2 calculation\nsummary: Verify composed AES-128 execution.\ntexts: {}',
    'zh-CN': 'title: AES-128 v2 计算\nsummary: 验证组合 AES-128 执行。\ntexts: {}',
  },
}

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
  it('executes literal AES-128 v2 schedule and cipher Lessons with projected key binding', async () => {
    const compiled = compileLesson(aes128V2Fixture)
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) return
    const scheduleStep = compiled.value.steps.find((step) => step.id === 'schedule')!
    const cipherStep = compiled.value.steps.find((step) => step.id === 'cipher')!
    expect(cipherStep.execute?.bindings['round-key-1.value']).toEqual({ step: 'schedule', output: 'round-key-1.value' })
    expect(compiled.value.graphs.schedule.graph.nodes.find((node) => node.id === 'word-1')?.inputs?.temp.bits).toEqual([96, 32])

    // WorkerStub runs the worker request function in-process; this covers Lesson binding and
    // snapshot behavior, not browser Worker transport, isolation, cancellation, or timing.
    const previousWorker = globalThis.Worker
    globalThis.Worker = WorkerStub as unknown as typeof Worker
    try {
      const session = createBrowserLessonSession(aes128V2Fixture, 'en-US')
      expect(session.ok).toBe(true)
      if (!session.ok) return
      const schedule = await session.value.enter()
      expect(schedule.ok).toBe(true)
      if (!schedule.ok) return
      const scheduleSnapshot = schedule.value.snapshots.schedule
      expect(hex(scheduleSnapshot.outputs['round-key-0.value'] as never)).toBe('0x000102030405060708090a0b0c0d0e0f')
      expect(hex(scheduleSnapshot.outputs['round-key-1.value'] as never)).toBe('0xd6aa74fdd2af72fadaa678f1d6ab76fe')
      expect(hex(scheduleSnapshot.outputs['round-key-10.value'] as never)).toBe('0x13111d7fe3944a17f307a78b4d2b30c5')
      const keyEvents = scheduleSnapshot.trace.filter((event) => 'primitive' in event && event.primitive === 'core.output@1')
      expect(keyEvents[0]).toMatchObject({ path: 'round-key-0.value', value: { type: { family: 'bits', size: 128 } } })
      expect(keyEvents.at(-1)).toMatchObject({ path: 'round-key-10.value', value: { type: { family: 'bits', size: 128 } } })
      expect(scheduleSnapshot.trace.filter((event) => 'primitive' in event && event.primitive === 'core.output@1')
        .every((event) => 'value' in event && event.value?.type.family === 'bits' && event.value.type.size === 128)).toBe(true)

      const cipher = await session.value.next()
      expect(cipher.ok).toBe(true)
      if (cipher.ok) {
        const snapshot = cipher.value.snapshots.cipher
        expect(hex(snapshot.outputs['add-round-key-10.value'] as never)).toBe('0x69c4e0d86a7b0430d8cdb78070b4c55a')
        expect(snapshot.trace.filter((event) => 'primitive' in event && event.primitive?.startsWith('aes.'))
          .every((event) => 'value' in event && event.value?.type.family === 'bits' && event.value.type.size === 128)).toBe(true)
      }
      session.value.dispose()
    } finally {
      globalThis.Worker = previousWorker
    }
  })

  it('executes the authored v2 Teaching SPN fixture with bilingual label overrides', async () => {
    const compiled = compileLesson(teachingSpnV2DemoDocuments)
    expect(compiled).toMatchObject({ ok: true, value: { notices: [], steps: [{ presentation: {
      kind: 'spn-cipher',
      labels: { 'core.substitute-nibbles@1': 'substitute-label', 'spn.permute-gather@1': 'permute-label' },
    } }] } })
    if (!compiled.ok) return
    const previousWorker = globalThis.Worker
    globalThis.Worker = WorkerStub as unknown as typeof Worker
    try {
      const session = createBrowserLessonSession(teachingSpnV2DemoDocuments, 'en-US')
      expect(session.ok).toBe(true)
      if (!session.ok) return
      const entered = await session.value.enter()
      expect(entered.ok).toBe(true)
      if (entered.ok) {
        const snapshot = entered.value.snapshots.execute
        expect(hex(snapshot.outputs['result.value'] as never)).toBe('0xc491')
        expect(snapshot.trace.map((event) => [event.path, 'primitive' in event ? event.primitive : undefined, 'round' in event ? event.round : undefined])).toEqual([
          ['state.value', 'core.source@1', 0],
          ['key.value', 'core.source@1', 1],
          ['key-mix.value', 'core.xor@1', 1],
          ['substitute.value', 'core.substitute-nibbles@1', 1],
          ['permute.value', 'spn.permute-gather@1', 1],
          ['result.value', 'core.output@1', 1],
        ])
        expect(snapshot.trace.map((event) => ['value' in event && event.value ? hex(event.value as never) : undefined])).toEqual([
          ['0x1234'], ['0x0f0f'], ['0x1d3b'], ['0x491c'], ['0xc491'], ['0xc491'],
        ])
      }
      session.value.dispose()
    } finally {
      globalThis.Worker = previousWorker
    }
    expect(compileLesson({
      ...teachingSpnV2DemoDocuments,
      locales: { ...teachingSpnV2DemoDocuments.locales, 'en-US': teachingSpnV2DemoDocuments.locales['en-US'].replace('  permute-label:', '  other-label:') },
    })).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'lesson.missing-text' })]) })
  })

  it('exports projected concat values into a later Step and rejects table bindings', async () => {
    const lesson = [
      'version: 2', 'id: composed-values', 'default_locale: en-US',
      'inputs:', '  left: {type: {family: bits, size: 5}, encoding: hex, default: "0x15"}', '  right: {type: {family: bits, size: 2}, encoding: hex, default: "0x2"}',
      'constants:', '  table: {kind: table, entryBits: 4, value: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]}',
      'graphs:',
      '  compose:', '    nodes:',
      '      - {id: left, operation: core.source@1, parameters: {type: {family: bits, size: 5}}}',
      '      - {id: right, operation: core.source@1, parameters: {type: {family: bits, size: 2}}}',
      '      - {id: joined, operation: core.concat@1, inputs: {left: {node: left, port: value, bits: [1, 3]}, right: {node: right, port: value}}}',
      '    outputs: [{node: joined, port: value}]',
      '  consume:', '    nodes:',
      '      - {id: value, operation: core.source@1, parameters: {type: {family: bits, size: 5}}}',
      '    outputs: [{node: value, port: value}]',
      'steps:',
      '  - id: first', '    execute: {graph: compose, bindings: {left.value: {input: left}, right.value: {input: right}}}',
      '  - id: second', '    execute: {graph: consume, bindings: {value.value: {step: first, output: joined.value}}}', '',
    ].join('\n')
    const documents = { lesson, locales: { 'en-US': 'title: Compose\nsummary: Compose.\ntexts: {}', 'zh-CN': 'title: 组合\nsummary: 组合。\ntexts: {}' } }
    expect(compileLesson(documents)).toMatchObject({ ok: true, value: { steps: [{ id: 'first' }, { id: 'second' }] } })
    expect(compileLesson({ ...documents, lesson: lesson.replace('{input: right}', '{constant: table}') })).toMatchObject({
      ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'lesson.invalid-constant-use' })]),
    })
    const previousWorker = globalThis.Worker
    globalThis.Worker = WorkerStub as unknown as typeof Worker
    try {
      const session = createBrowserLessonSession(documents, 'en-US')
      expect(session.ok).toBe(true)
      if (!session.ok) return
      expect(await session.value.enter()).toMatchObject({ ok: true, value: { snapshots: { first: expect.anything() } } })
      const second = await session.value.next()
      expect(second).toMatchObject({ ok: true, value: { snapshots: { second: expect.anything() } } })
      if (second.ok) expect(hex(second.value.snapshots.second.outputs['value.value'] as never)).toBe('0x0a')
      session.value.dispose()
    } finally {
      globalThis.Worker = previousWorker
    }
  })

  it('resolves a named SPN table only for execution while retaining its named trace parameter', async () => {
    const documents: LessonDocuments = {
      lesson: [
        'version: 2', 'id: table-reference', 'default_locale: en-US', 'inputs:', '  state: {type: {family: bits, size: 16}, encoding: hex, default: "0x1234"}',
        'constants:', '  sbox: {kind: table, entryBits: 4, value: [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7]}',
        'graphs:', '  substitute:', '    nodes:',
        '      - {id: state, operation: core.source@1, parameters: {type: {family: bits, size: 16}, value: "0x1234"}}',
        '      - {id: result, operation: spn.substitute@1, inputs: {value: {node: state, port: value}}, parameters: {sBox: {constant: sbox}}}',
        '    outputs: [{node: result, port: value}]', 'steps:',
        '  - id: run', '    execute: {graph: substitute, bindings: {state.value: {input: state}}}', '',
      ].join('\n'),
      locales: { 'en-US': 'title: Table\nsummary: Table.\ntexts: {}', 'zh-CN': 'title: 表\nsummary: 表。\ntexts: {}' },
    }
    const compiled = compileLesson(documents)
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) return
    expect(compiled.value.constants).toEqual({})
    const execution = compiled.value.graphs.substitute.execute()
    expect(execution.ok && hex(execution.value.outputs['result.value'] as never)).toBe('0x4d12')
    expect(execution.ok && execution.value.trace[1]).toMatchObject({ parameters: { sBox: { constant: 'sbox' } } })
    const previousWorker = globalThis.Worker
    globalThis.Worker = WorkerStub as unknown as typeof Worker
    try {
      const session = createBrowserLessonSession(documents, 'en-US')
      expect(session.ok).toBe(true)
      if (!session.ok) return
      const entered = await session.value.enter()
      expect(entered).toMatchObject({ ok: true, value: { snapshots: { run: expect.anything() } } })
      if (entered.ok) {
        expect(hex(entered.value.snapshots.run.outputs['result.value'] as never)).toBe('0x4d12')
        expect(entered.value.snapshots.run.trace[1]).toMatchObject({ parameters: { sBox: { constant: 'sbox' } } })
      }
      session.value.dispose()
    } finally {
      globalThis.Worker = previousWorker
    }
  })

  it('rejects table constants in equality checks instead of treating them as unavailable values', () => {
    const documents: LessonDocuments = {
      lesson: [
        'version: 2', 'id: table-check', 'default_locale: en-US', 'inputs: {}',
        'constants:', '  sbox: {kind: table, entryBits: 2, value: [0, 1, 2, 3]}',
        'graphs:', '  value:', '    nodes:',
        '      - {id: state, operation: core.source@1, parameters: {type: {family: bits, size: 2}, value: "0x0"}}',
        '    outputs: [{node: state, port: value}]',
        'steps:', '  - id: check',
        '    check:', '      kind: equal', '      actual: {constant: sbox}', '      expected: {constant: sbox}', '      feedback: {match: ok, mismatch: bad}',
        '',
      ].join('\n'),
      locales: { 'en-US': 'title: Table check\nsummary: Check.\ntexts: {ok: ok, bad: bad}', 'zh-CN': 'title: 表检查\nsummary: 检查。\ntexts: {ok: 好, bad: 坏}' },
    }
    expect(compileLesson(documents)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'lesson.invalid-constant-use' })]),
    })
  })

  it('does not expand nested table references inside an operation parameter', () => {
    const documents: LessonDocuments = {
      lesson: `version: 2
id: nested-table
default_locale: en-US
inputs:
  state: {type: {family: bits, size: 16}, encoding: hex, default: "0x1234"}
constants:
  sbox: {kind: table, entryBits: 4, value: [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7]}
graphs:
  substitute:
    nodes:
      - {id: probe, operation: test.throw@1, parameters: {wrapped: {nested: {constant: sbox}}}}
    outputs: []
steps:
  - id: run
    prose: intro
`,
      locales: { 'en-US': 'title: Nested\nsummary: Nested.\ntexts: {intro: Intro.}', 'zh-CN': 'title: 嵌套\nsummary: 嵌套。\ntexts: {intro: 介绍。}' },
    }
    const compiled = compileLesson(documents)
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) return
    expect(compiled.value.graphs.substitute.graph.nodes[0].parameters?.wrapped).toEqual({ nested: { constant: 'sbox' } })
    expect(compiled.value.graphs.substitute.graph.nodes[0].traceParameters?.wrapped).toEqual({ nested: { constant: 'sbox' } })
  })

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
    expect(compiled.value.notices).toEqual([{ severity: 'warning', code: 'lesson.schema-v1-deprecated', path: 'version', message: expect.any(String) }])
    expect(validateLessonDocuments(fixture()).notices).toEqual(compiled.value.notices)
  })

  it('rejects v2-only projections, parameter constants, tables, and trace metadata in v1 Lessons', () => {
    const projected = compileLesson({
      ...fixture(),
      lesson: fixture().lesson.replace('left: {node: left, port: value}', 'left: {node: left, port: value, bits: [0, 4]}'),
    })
    expect(projected).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'lesson.v2-feature-in-v1' })]),
    })

    const base = (graph: string, constants = '  mask: {type: {family: bits, size: 8}, encoding: hex, value: "0x01"}') => ({
      lesson: `version: 1
id: v1-boundary
default_locale: en-US
inputs: {}
constants:
${constants}
graphs:
${graph}
steps:
  - id: intro
    prose: intro
`,
      locales: { 'en-US': 'title: Boundary\nsummary: Boundary.\ntexts: {intro: Intro.}', 'zh-CN': 'title: 边界\nsummary: 边界。\ntexts: {intro: 介绍。}' },
    })
    const parameter = compileLesson(base(`  probe:
    nodes:
      - {id: source, operation: core.source@1, parameters: {type: {family: bits, size: 8}}}
      - {id: substitute, operation: spn.substitute@1, inputs: {value: {node: source, port: value}}, parameters: {sBox: {constant: mask}}}
    outputs: [{node: substitute, port: value}]
`))
    expect(parameter).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'lesson.v2-feature-in-v1' })]),
    })

    const table = compileLesson(base(
      '  probe:\n    nodes:\n      - {id: probe, operation: core.source@1, parameters: {type: {family: bits, size: 8}}}\n    outputs: [{node: probe, port: value}]',
      '  table: {kind: table, entryBits: 2, value: [0, 1, 2, 3]}',
    ))
    expect(table).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'lesson.v2-feature-in-v1' })]),
    })

    const repeated = compileLesson(base(`  graph:
    nodes:
      - {id: source, operation: core.source@1, parameters: {type: {family: bits, size: 8}}}
      - {id: rounds, repeat: {subgraph: round, count: 2}, inputs: {value: {node: source, port: value}}}
    outputs: []
    subgraphs:
      round:
        inputs: [{name: value, type: {family: bits, size: 8}}]
        outputs: [{name: value, type: {family: bits, size: 8}}]
        nodes:
          - {id: probe, operation: spn.substitute@1, inputs: {value: {node: '@input', port: value}}, parameters: {sBox: {constant: mask}}}
          - {id: value, operation: core.output@1, inputs: {value: {node: '@input', port: value}}}
`))
    expect(repeated).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'lesson.v2-feature-in-v1' })]),
    })

    const compiled = compileLesson(fixture())
    expect(compiled).toMatchObject({ ok: true })
    if (compiled.ok) expect(compiled.value.graphs.xor.graph.nodes[0]).not.toHaveProperty('traceParameters')
  })

  it('resolves top-level CryptoValue parameter references before source validation', () => {
    const documents: LessonDocuments = {
      lesson: `version: 2
id: source-reference
default_locale: en-US
inputs:
  state: {type: {family: bits, size: 4}, encoding: hex, default: "0xa"}
constants:
  mask: {type: {family: bits, size: 4}, encoding: hex, value: "0x5"}
graphs:
  source:
    nodes:
      - {id: value, operation: core.source@1, parameters: {type: {family: bits, size: 4}, value: {constant: mask}}}
    outputs: [{node: value, port: value}]
steps:
  - id: run
    execute: {graph: source, bindings: {value.value: {input: state}}}
`,
      locales: { 'en-US': 'title: Source reference\nsummary: Source reference.\ntexts: {}', 'zh-CN': 'title: 来源引用\nsummary: 来源引用。\ntexts: {}' },
    }
    const compiled = compileLesson(documents)
    expect(compiled).toMatchObject({ ok: true })
    if (!compiled.ok) return
    expect(compiled.value.graphs.source.graph.nodes[0].parameters?.value).toMatchObject({ type: { family: 'bits', size: 4 } })
    expect([...(compiled.value.graphs.source.graph.nodes[0].parameters?.value as { bytes: Uint8Array }).bytes]).toEqual([5])
    const execution = compiled.value.graphs.source.execute({ 'value.value': compiled.value.inputs.state.default })
    expect(execution.ok).toBe(true)
    if (execution.ok) expect(execution.value.trace[0]).toMatchObject({ parameters: { value: { type: { family: 'bits', size: 4 } } } })
    expect(compileLesson({ ...documents, lesson: documents.lesson.replace('{constant: mask}', '{constant: missing}') })).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'lesson.unknown-constant' })]),
    })
    const mismatch = compileLesson({ ...documents, lesson: documents.lesson.replace('size: 4}, encoding: hex, value: "0x5"', 'size: 8}, encoding: hex, value: "0x05"') })
    expect(mismatch).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'invalid-parameter' })]),
    })
  })

  it('rejects graph output projections while consuming resolved repeated exports across Steps', async () => {
    for (const version of ['version: 1', 'version: 2']) {
      const outputProjection = compileLesson({
        ...fixture(),
        lesson: fixture().lesson.replace('version: 1', version).replace('{node: mixed, port: value}', '{node: mixed, port: value, bits: [0, 2]}'),
      })
      expect(outputProjection).toMatchObject({
        ok: false,
        diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'lesson.unknown-field' })]),
      })
    }

    const documents: LessonDocuments = {
      lesson: `version: 2
id: repeated-export
default_locale: en-US
inputs:
  state: {type: {family: bits, size: 8}, encoding: hex, default: "0xd6"}
constants: {}
graphs:
  first:
    nodes:
      - {id: source, operation: core.source@1, parameters: {type: {family: bits, size: 8}}}
      - {id: repeated, repeat: {subgraph: project, count: 1}, inputs: {value: {node: source, port: value, bits: [2, 2]}}}
    outputs: [{node: repeated, port: value}]
    subgraphs:
      project:
        inputs: [{name: value, type: {family: bits, size: 2}}]
        outputs: [{name: value, type: {family: bits, size: 2}}]
        nodes:
          - {id: value, operation: core.output@1, inputs: {value: {node: '@input', port: value}}}
  second:
    nodes:
      - {id: value, operation: core.source@1, parameters: {type: {family: bits, size: 2}}}
    outputs: [{node: value, port: value}]
steps:
  - id: first
    execute: {graph: first, bindings: {source.value: {input: state}}}
  - id: second
    execute: {graph: second, bindings: {value.value: {step: first, output: repeated.value}}}
`,
      locales: { 'en-US': 'title: Repeat export\nsummary: Repeat export.\ntexts: {}', 'zh-CN': 'title: 重复导出\nsummary: 重复导出。\ntexts: {}' },
    }
    const compiled = compileLesson(documents)
    expect(compiled).toMatchObject({ ok: true, value: { graphs: { first: { outputAliases: { 'repeated.value': 'repeated.1/value.value' } } } } })
    expect(validateLessonDocuments(documents)).toMatchObject({ ok: true, dryRun: { steps: [{ id: 'first' }, { id: 'second' }] } })
    const staleWidth = compileLesson({
      ...documents,
      lesson: documents.lesson
        .replace('outputs: [{name: value, type: {family: bits, size: 2}}]', 'outputs: [{name: value, type: {family: bits, size: 4}}]')
        .replace('parameters: {type: {family: bits, size: 2}}}', 'parameters: {type: {family: bits, size: 4}}}'),
    })
    expect(staleWidth).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'lesson.invalid-input' })]) })
    const previousWorker = globalThis.Worker
    globalThis.Worker = WorkerStub as unknown as typeof Worker
    try {
      const session = createBrowserLessonSession(documents, 'en-US')
      expect(session.ok).toBe(true)
      if (!session.ok) return
      expect(await session.value.enter()).toMatchObject({ ok: true, value: { snapshots: { first: expect.anything() } } })
      const second = await session.value.next()
      expect(second).toMatchObject({ ok: true, value: { snapshots: { second: expect.anything() } } })
      if (second.ok) expect(hex(second.value.snapshots.second.outputs['value.value'] as never)).toBe('0x1')
      session.value.dispose()
    } finally {
      globalThis.Worker = previousWorker
    }
  })

  it('executes a minimal v2 source/XOR/output graph with annotated trace events', () => {
    const documents: LessonDocuments = {
      lesson: `version: 2
id: v2-xor
default_locale: en-US
inputs:
  plaintext: {type: {family: bits, size: 16}, encoding: hex, default: "0x1234"}
constants:
  mask: {type: {family: bits, size: 16}, encoding: hex, value: "0x00ff"}
graphs:
  mix:
    nodes:
      - {id: state, operation: core.source@1, parameters: {type: {family: bits, size: 16}}, role: state, round: 0, unit: 8}
      - {id: mask, operation: core.source@1, parameters: {type: {family: bits, size: 16}}, role: round-key, round: 0, unit: 8}
      - {id: mixed, operation: core.xor@1, inputs: {left: {node: state, port: value}, right: {node: mask, port: value}}, role: state, round: 0, unit: 8}
      - {id: restored, operation: core.xor@1, inputs: {left: {node: mixed, port: value}, right: {node: mask, port: value}}, role: state, round: 0, unit: 8}
      - {id: result, operation: core.output@1, inputs: {value: {node: restored, port: value}}, role: state, round: 0, unit: 8}
    outputs: [{node: result, port: value}]
steps:
  - id: run
    execute:
      graph: mix
      bindings: {state.value: {input: plaintext}, mask.value: {constant: mask}}
`,
      locales: { 'en-US': 'title: V2 XOR\nsummary: Run a minimal graph.\ntexts: {}', 'zh-CN': 'title: V2 XOR\nsummary: 运行最小图。\ntexts: {}' },
    }
    const compiled = compileLesson(documents)
    expect(compiled).toMatchObject({ ok: true, value: { notices: [] } })
    expect(compileLesson({ ...documents, lesson: documents.lesson.replace('version: 2\n', '') })).toMatchObject({ ok: true, value: { notices: [] } })
    if (!compiled.ok) return
    const execution = compiled.value.graphs.mix.execute({
      'state.value': compiled.value.inputs.plaintext.default,
      'mask.value': compiled.value.constants.mask,
    })
    expect(execution.ok).toBe(true)
    if (!execution.ok) return
    expect(execution.value.trace.map((event) => ({
      path: event.path,
      primitive: 'primitive' in event ? event.primitive : undefined,
      role: 'role' in event ? event.role : undefined,
      round: 'round' in event ? event.round : undefined,
      unit: 'unit' in event ? event.unit : undefined,
    }))).toEqual([
      { path: 'state.value', primitive: 'core.source@1', role: 'state', round: 0, unit: 8 },
      { path: 'mask.value', primitive: 'core.source@1', role: 'round-key', round: 0, unit: 8 },
      { path: 'mixed.value', primitive: 'core.xor@1', role: 'state', round: 0, unit: 8 },
      { path: 'restored.value', primitive: 'core.xor@1', role: 'state', round: 0, unit: 8 },
      { path: 'result.value', primitive: 'core.output@1', role: 'state', round: 0, unit: 8 },
    ])
    expect(execution.value.trace[0]).toMatchObject({
      parameters: { type: { family: 'bits', size: 16 } },
      value: { type: { family: 'bits', size: 16 }, bytes: expect.any(Uint8Array) },
    })
    expect(validateLessonDocuments(documents)).toMatchObject({ ok: true, notices: [], dryRun: { steps: [{ id: 'run' }] } })
  })

  it('rejects version-exclusive and internal v2 fields', () => {
    const v1Annotations = compileLesson({ ...fixture(), lesson: fixture().lesson.replace('parameters:', 'role: state\n        parameters:') })
    expect(v1Annotations).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'lesson.v2-feature-in-v1' })]) })

    const v2Fields = compileLesson({
      lesson: `version: 2
id: invalid-v2
default_locale: en-US
inputs: {}
constants: {}
graphs:
  graph:
    schema: 2
    traceLevel: detail
    nodes:
      - {id: state, operation: core.source@1, traceParameters: {}, parameters: {type: {family: bits, size: 8}, value: "0x00"}}
    outputs: [{node: state, port: value}]
steps: []
`,
      locales: { 'en-US': 'title: Invalid\nsummary: Invalid\ntexts: {}' },
    })
    expect(v2Fields).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'lesson.unknown-field', path: 'graphs.graph.schema' }),
        expect.objectContaining({ code: 'lesson.v1-feature-in-v2', path: 'graphs.graph.traceLevel' }),
        expect.objectContaining({ code: 'lesson.unknown-field', path: 'graphs.graph.nodes.0.traceParameters' }),
      ]),
    })
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

    const malformed = { ...fixture(), lesson: fixture().lesson.replace('version: 1', 'version: 3') }
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
    const unsupported = compileLesson({ ...fixture(), lesson: fixture().lesson.replace('version: 1', 'version: 3') })
    expect(unsupported).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'lesson.unsupported-version', path: 'version', span: { file: 'lesson.yaml', line: 1, column: 10 }, details: { version: 3 } }],
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
