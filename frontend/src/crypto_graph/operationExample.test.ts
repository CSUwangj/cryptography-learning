import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { compile, hex, type BitsValue } from './index'
import { compileLesson, validateLessonDocuments } from '../lesson_runtime'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/examples/operations/xor-constant')
const documents = {
  lesson: readFileSync(join(root, 'lesson.yaml'), 'utf8'),
  locales: {
    'en-US': readFileSync(join(root, 'locales/en-US.yaml'), 'utf8'),
    'zh-CN': readFileSync(join(root, 'locales/zh-CN.yaml'), 'utf8'),
  },
}

it('executes the documented constant XOR Lesson with structural bit lineage', () => {
  expect(validateLessonDocuments(documents)).toMatchObject({
    ok: true, diagnostics: [], notices: [], dryRun: { steps: [{ id: 'run' }] },
  })
  const lesson = compileLesson(documents)
  if (!lesson.ok) throw new Error(JSON.stringify(lesson.diagnostics))
  expect(Object.keys(lesson.value.locales)).toEqual(['en-US', 'zh-CN'])
  const graph = lesson.value.graphs.inject
  expect(graph.outputTypes?.['mixed.value']).toEqual({ family: 'bits', size: 64 })
  expect(graph.lineage?.filter((edge) => edge.target === 'mixed.value')).toHaveLength(64)
  expect(graph.lineage).toEqual(expect.arrayContaining([
    { source: 'state.value', sourceBit: 0, target: 'mixed.value', targetBit: 0 },
    { source: 'state.value', sourceBit: 32, target: 'mixed.value', targetBit: 32 },
    { source: 'state.value', sourceBit: 63, target: 'mixed.value', targetBit: 63 },
  ]))
  const execution = graph.execute({ 'state.value': lesson.value.inputs.plaintext.default })
  if (!execution.ok) throw new Error(JSON.stringify(execution.diagnostics))
  expect(hex(execution.value.outputs['result.value'] as BitsValue)).toBe('0x0011223345556677')
  expect(execution.value.trace.map((event) => ({
    path: event.path,
    primitive: 'primitive' in event ? event.primitive : undefined,
    value: 'value' in event ? hex(event.value as BitsValue) : undefined,
  }))).toEqual([
    { path: 'state.value', primitive: 'core.source@1', value: '0x0011223344556677' },
    { path: 'mixed.value', primitive: 'core.xor-constant@1', value: '0x0011223345556677' },
    { path: 'result.value', primitive: 'core.output@1', value: '0x0011223345556677' },
  ])
})

it('rejects an invalid constant and an out-of-range target word', () => {
  const lesson = compileLesson(documents)
  if (!lesson.ok) throw new Error(JSON.stringify(lesson.diagnostics))
  for (const parameters of [{ target: 1, constant: -1 }, { target: 2, constant: 16777216 }]) {
    const graph = lesson.value.graphs.inject.graph
    const invalid = compile({
      ...graph,
      nodes: graph.nodes.map((node) => node.id === 'mixed' ? { ...node, parameters } : node),
    })
    expect(invalid).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'operation.xor-constant-out-of-bounds' }),
      ]),
    })
  }
})
