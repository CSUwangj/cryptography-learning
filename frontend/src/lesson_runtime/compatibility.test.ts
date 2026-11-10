import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import { substitutionCipherDemoDocuments, vigenereCipherDemoDocuments } from '../../demos/classicalCipherLessons'
import { aes128CipherComparisonDocuments } from '../../demos/aesCipherComparisonLesson'
import { executeWorkerRequest } from '../crypto_graph'
import { visualizerCatalog } from '../visualizers'
import { compileLesson, type LessonDocuments } from './index'

const repository = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const documentsAt = (path: string): LessonDocuments => {
  const file = join(repository, path)
  const locales = path.endsWith('/lesson.yaml') ? join(dirname(file), 'locales') : file.replace('.yaml', '-locales')
  return {
    lesson: readFileSync(file, 'utf8'),
    locales: Object.fromEntries(readdirSync(locales).map((name) => [name.replace('.yaml', ''), readFileSync(join(locales, name), 'utf8')])),
  }
}

describe('Public Lesson coexistence (#113)', () => {
  it.each([
    ['baseline/content/lessons/aes-128-comparison-demo/lesson.yaml', 1],
    ['baseline/content/lessons/aes-128-demo/lesson.yaml', 1],
    ['baseline/content/lessons/classical-substitution/lesson.yaml', 1],
    ['baseline/content/lessons/fallback-xor/lesson.yaml', 1],
    ['baseline/content/lessons/xor-intro/lesson.yaml', 1],
    ['frontend/src/lesson_runtime/fixture/lesson.yaml', 1],
    ['frontend/src/lesson_runtime/fixture/transposition/lesson.yaml', 1],
    ['frontend/src/lesson_runtime/fixture/aes128-v2.yaml', 2],
    ['frontend/src/lesson_runtime/fixture/aes192-v2.yaml', 2],
    ['frontend/src/lesson_runtime/fixture/aes256-v2.yaml', 2],
    ['frontend/src/lesson_runtime/fixture/overlay-three-anchor-v2.yaml', 2],
    ['frontend/src/lesson_runtime/fixture/teaching-spn-v2.yaml', 2],
  ] as const)('preserves the authored version and tooling notice for %s', (path, version) => {
    const documents = documentsAt(path)
    expect(parse(documents.lesson).version).toBe(version)
    const compiled = compileLesson(documents, visualizerCatalog)
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
    expect(compiled.value.notices.map((notice) => notice.code)).toEqual(version === 1 ? ['lesson.schema-v1-deprecated'] : [])
    for (const graph of Object.values(compiled.value.graphs)) expect(graph.graph.schema).toBe(version === 2 ? 2 : undefined)
  })

  it('keeps the deliberately malformed public Lesson invalid', () => {
    const lesson = readFileSync(join(repository, 'baseline/content/lessons/malformed-yaml/lesson.yaml'), 'utf8')
    expect(compileLesson({ lesson, locales: {} }, visualizerCatalog)).toMatchObject({
      ok: false, diagnostics: [expect.objectContaining({ code: 'lesson.yaml-syntax', path: '' })],
    })
  })

  it.each(['version: 2\n', ''])('uses v2 rather than legacy trace semantics with root %j', (version) => {
    const documents = documentsAt('frontend/src/lesson_runtime/fixture/lesson.yaml')
    expect(compileLesson({ ...documents, lesson: documents.lesson.replace('version: 1\n', version) })).toMatchObject({
      ok: false, diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'lesson.v1-feature-in-v2', path: 'graphs.xor.traceLevel' }),
      ]),
    })
  })

  it('rejects undeclared v2 avalanche sources', () => {
    const lesson = parse(aes128CipherComparisonDocuments.lesson)
    lesson.version = 2
    for (const graph of Object.values(lesson.graphs) as Record<string, unknown>[]) delete graph.traceLevel
    const result = compileLesson({ ...aes128CipherComparisonDocuments, lesson: stringify(lesson) }, visualizerCatalog)
    expect(result).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([
      expect.objectContaining({ code: 'lesson.invalid-input', path: 'steps.0.visualizer.compare.sources' }),
    ]) })
  })

  it.each([substitutionCipherDemoDocuments, vigenereCipherDemoDocuments])('accepts the shared classical descriptor in v2 without an algorithm-specific descriptor', (documents) => {
    const lesson = parse(documents.lesson)
    lesson.version = 2
    for (const graph of Object.values(lesson.graphs) as Record<string, unknown>[]) delete graph.traceLevel
    const compiled = compileLesson({ ...documents, lesson: stringify(lesson) }, visualizerCatalog)
    expect(compiled.ok && compiled.value.steps[1].visualizer?.id).toBe('classical-cipher@1')
  })

  it('retains raw classical primitive execution in v2 without its dedicated presentation', () => {
    const lesson = parse(substitutionCipherDemoDocuments.lesson)
    lesson.version = 2
    delete lesson.graphs.cipher.traceLevel
    for (const step of lesson.steps) delete step.visualizer
    const compiled = compileLesson({ ...substitutionCipherDemoDocuments, lesson: stringify(lesson) })
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
    const step = compiled.value.steps[1].execute!
    const inputs = Object.fromEntries(Object.entries(step.bindings).map(([port, reference]) => {
      if (!('input' in reference)) throw new Error('Expected a public Lesson input binding.')
      return [port, compiled.value.inputs[reference.input].default]
    }))
    expect(executeWorkerRequest({ requestId: 'raw-classical-v2', kind: 'execute', payload: {
      graph: compiled.value.graphs.cipher.graph, inputs,
    } })).toMatchObject({ kind: 'snapshot', snapshot: {
      outputs: { 'cipher.text': { symbols: [...'QWE BNM!'] } },
      trace: expect.arrayContaining([expect.objectContaining({
        path: 'cipher.text', primitive: 'classical.substitution@1', value: { type: { family: 'alphabet-text', mapping: 'latin' }, symbols: [...'QWE BNM!'] },
      })]),
    } })
  })
})
