import { parse, stringify } from 'yaml'
import { describe, expect, it } from 'vitest'
import { compileLesson } from './index'
import { executeWorkerRequest, hex, type AuthoredNode, type BitsValue } from '../crypto_graph'
import lesson from './fixture/teaching-spn-v2.yaml?raw'
import en from './fixture/teaching-spn-v2-locales/en-US.yaml?raw'
import zh from './fixture/teaching-spn-v2-locales/zh-CN.yaml?raw'

const documents = {
  lesson,
  locales: { 'en-US': en, 'zh-CN': zh },
}

describe('Structural SPN cipher compilation (#107 P4-A1)', () => {
  it('requires state and round-key roles only when a cipher teaching presentation is requested', () => {
    const lesson = parse(documents.lesson)
    delete lesson.graphs.cipher.nodes[0].role
    const result = compileLesson({ ...documents, lesson: stringify(lesson) })
    expect(result).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([
      expect.objectContaining({ code: 'presentation.spn-role-required', path: 'steps.0.presentation' }),
    ]) })
    delete lesson.steps[0].presentation
    expect(compileLesson({ ...documents, lesson: stringify(lesson) }).ok).toBe(true)
  })

  it.each([undefined, 0])('diagnoses an absent or mismatched round-key round (%s)', (round) => {
    const lesson = parse(documents.lesson)
    lesson.graphs.cipher.nodes[0].round = round
    expect(compileLesson({ ...documents, lesson: stringify(lesson) })).toMatchObject({
      ok: false, diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'presentation.spn-round-required', path: 'steps.0.presentation' }),
      ]),
    })
  })

  it('compiles dependency-ordered state rows and inserts a round key at its first consumer after renaming and declaration reversal', () => {
    const lesson = parse(documents.lesson)
    const nodes: AuthoredNode[] = lesson.graphs.cipher.nodes
    const names = Object.fromEntries(nodes.map((node, index) => [node.id, `renamed-${nodes.length - index}`]))
    for (const node of nodes) {
      node.id = names[node.id]
      for (const input of Object.values(node.inputs ?? {})) input.node = names[input.node]
    }
    lesson.graphs.cipher.nodes.reverse()
    lesson.graphs.cipher.outputs[0].node = names.result
    lesson.steps[0].execute.bindings = {
      [`${names.state}.value`]: { input: 'state' }, [`${names.key}.value`]: { constant: 'key' },
    }
    lesson.steps[0].presentation.algorithm = 'Another SPN'
    lesson.steps[0].presentation.variant = 37
    const result = compileLesson({ ...documents, lesson: stringify(lesson) })
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
    expect(result.value.steps[0].presentation).toMatchObject({
      rowOrder: ['state', 'key', 'mix', 'substitute', 'permute', 'result'].map((id) => `${names[id]}.value`),
    })
  })

  it('diagnoses an ambiguous fork instead of using declaration order to place teaching rows', () => {
    const lesson = parse(documents.lesson)
    lesson.graphs.cipher.nodes.push({ id: 'fork', operation: 'core.output@1', inputs: { value: { node: 'mix', port: 'value' } }, role: 'state', round: 1 })
    expect(compileLesson({ ...documents, lesson: stringify(lesson) })).toMatchObject({
      ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'presentation.spn-order-unsupported' })]),
    })
    delete lesson.steps[0].presentation
    expect(compileLesson({ ...documents, lesson: stringify(lesson) }).ok).toBe(true)
  })

  it('preserves descending source round identities while ordering decryption rows by consumption', () => {
    const lesson = parse(documents.lesson)
    const nodes: AuthoredNode[] = lesson.graphs.cipher.nodes
    for (const node of nodes) node.round = node.id === 'state' ? 12 : 11
    lesson.steps[0].presentation.direction = 'decrypt'
    const result = compileLesson({ ...documents, lesson: stringify(lesson) })
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
    expect(result.value.steps[0].presentation).toMatchObject({
      direction: 'decrypt', rowOrder: ['state.value', 'key.value', 'mix.value', 'substitute.value', 'permute.value', 'result.value'],
    })
    expect(result.value.graphs.cipher.graph.nodes.find((node) => node.id === 'key')?.round).toBe(11)
  })

  it('requires compiled lineage for presented transforms while preserving executable raw graphs', () => {
    const lesson = parse(documents.lesson)
    lesson.inputs.state.type.size = 32
    lesson.inputs.state.default = '0x00001234'
    lesson.constants.key.type.size = 32
    lesson.constants.key.value = '0x00000f0f'
    const nodes: AuthoredNode[] = lesson.graphs.cipher.nodes
    for (const node of nodes.filter((node) => node.operation === 'core.source@1')) node.parameters = { type: { family: 'bits', size: 32 } }
    const word = nodes.find((node) => node.id === 'substitute')!
    // This registered legacy primitive executes, but intentionally has no v2 lineage declaration.
    word.operation = 'aes.key-word@1'
    word.inputs = { key: { node: 'mix', port: 'value' } }
    word.parameters = { index: 0 }
    nodes.find((node) => node.id === 'permute')!.parameters = { permutation: [3, 0, 1, 2, 4, 5, 6, 7] }
    expect(compileLesson({ ...documents, lesson: stringify(lesson) })).toMatchObject({
      ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'presentation.spn-lineage-required' })]),
    })
    delete lesson.steps[0].presentation
    const raw = compileLesson({ ...documents, lesson: stringify(lesson) })
    if (!raw.ok) throw new Error(JSON.stringify(raw.diagnostics))
    const execution = executeWorkerRequest({ requestId: 'raw', kind: 'execute', payload: {
      graph: raw.value.graphs.cipher.graph,
      inputs: { 'state.value': raw.value.inputs.state.default, 'key.value': raw.value.constants.key },
    } })
    if (execution.kind !== 'snapshot') throw new Error(JSON.stringify(execution))
    expect(hex(execution.snapshot.outputs['result.value'] as BitsValue)).toBe('0x00001d3b')
  })
})
