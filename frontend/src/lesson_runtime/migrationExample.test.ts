import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { executeWorkerRequest, hex, type BitsValue } from '../crypto_graph'
import { visualizerCatalog } from '../visualizers'
import { compileLesson, validateLessonDocuments } from './index'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/examples/migration')
const example = (path: string): string => readFileSync(join(root, path), 'utf8')

it.each([1, 2])('executes the complete documented v%s XOR Lesson with both locales (#114)', (version) => {
  const documents = {
    lesson: example(`xor-v${version}/lesson.yaml`),
    locales: { 'en-US': example(`xor-v${version}/locales/en-US.yaml`), 'zh-CN': example(`xor-v${version}/locales/zh-CN.yaml`) },
  }
  const compiled = compileLesson(documents, visualizerCatalog)
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
  const notices = version === 1 ? ['lesson.schema-v1-deprecated'] : []
  expect(compiled.value.notices.map((notice) => notice.code)).toEqual(notices)
  expect(Object.keys(compiled.value.locales)).toEqual(['en-US', 'zh-CN'])
  expect(validateLessonDocuments(documents, visualizerCatalog)).toMatchObject({ ok: true, diagnostics: [] })
  const response = executeWorkerRequest({ requestId: `guide-v${version}`, kind: 'execute', payload: {
    graph: compiled.value.graphs.mix.graph,
    inputs: { 'state.value': compiled.value.inputs.plaintext.default, 'mask.value': compiled.value.constants.mask },
  } })
  if (response.kind !== 'snapshot') throw new Error(JSON.stringify(response))
  expect(hex(response.snapshot.outputs['result.value'] as BitsValue)).toBe('0x12cb')
  if (version === 2) {
    expect(response.snapshot.trace.map((event) => ({ path: event.path, value: 'value' in event ? hex(event.value as BitsValue) : undefined }))).toEqual([
      { path: 'state.value', value: '0x1234' },
      { path: 'mask.value', value: '0x00ff' },
      { path: 'mixed.value', value: '0x12cb' },
      { path: 'result.value', value: '0x12cb' },
    ])
    expect(compiled.value.steps[0].presentation).toMatchObject({ kind: 'spn-cipher', labels: { 'core.xor@1': 'mix-label' } })
    expect(compiled.value.locales['en-US'].texts['mix-label']).toBe('Mix with the mask')
    expect(compiled.value.locales['zh-CN'].texts['mix-label']).toBe('与掩码异或')
  }
})

it('preserves the documented five-bit concat value across Steps (#114)', () => {
  const documents = {
    lesson: example('projection/lesson.yaml'),
    locales: { 'en-US': example('projection/locales/en-US.yaml'), 'zh-CN': example('projection/locales/zh-CN.yaml') },
  }
  const compiled = compileLesson(documents, visualizerCatalog)
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
  expect(validateLessonDocuments(documents, visualizerCatalog)).toMatchObject({
    ok: true, notices: [], dryRun: { steps: [{ id: 'compose' }, { id: 'consume' }] },
  })
  const composed = executeWorkerRequest({ requestId: 'guide-compose', kind: 'execute', payload: {
    graph: compiled.value.graphs.compose.graph,
    inputs: { 'left.value': compiled.value.inputs.left.default, 'right.value': compiled.value.inputs.right.default },
  } })
  if (composed.kind !== 'snapshot') throw new Error(JSON.stringify(composed))
  const value = composed.snapshot.outputs['joined.value'] as BitsValue
  expect(value.type).toEqual({ family: 'bits', size: 5 })
  expect(hex(value)).toBe('0x0a')
  expect([...value.bytes]).toEqual([0x0a])
  const consumed = executeWorkerRequest({ requestId: 'guide-consume', kind: 'execute', payload: {
    graph: compiled.value.graphs.consume.graph, inputs: { 'value.value': value },
  } })
  if (consumed.kind !== 'snapshot') throw new Error(JSON.stringify(consumed))
  expect(consumed.snapshot.outputs['value.value']).toEqual(value)
  expect(consumed.snapshot.trace).toMatchObject([{ path: 'value.value', value }])
})
