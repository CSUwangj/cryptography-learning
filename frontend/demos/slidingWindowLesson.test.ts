import { parse, stringify } from 'yaml'
import { expect, it } from 'vitest'
import { executeWorkerRequest, hex, type AuthoredNode, type BitsValue } from '../src/crypto_graph'
import { compileLesson } from '../src/lesson_runtime'
import { slidingWindowDemoDocuments } from './slidingWindowLesson'

const expected = ['0x1234', '0x2345', '0x3456', '0x4567']
// Independently enumerated source windows, with logical MSB-first positions.
const sourceBits = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
  [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27],
]

it.each([false, true])('executes all four original-key windows with exact compiled lineage (renamed=%s)', (renamed) => {
  const authored = parse(slidingWindowDemoDocuments.lesson)
  const names = renamed
    ? { key: 'origin', rk1: 'delta', rk2: 'alpha', rk3: 'charlie', rk4: 'bravo' }
    : { key: 'key', rk1: 'rk1', rk2: 'rk2', rk3: 'rk3', rk4: 'rk4' }
  if (renamed) {
    for (const node of authored.graphs.schedule.nodes as AuthoredNode[]) {
      node.id = names[node.id as keyof typeof names]
      for (const input of Object.values(node.inputs ?? {})) input.node = names[input.node as keyof typeof names]
    }
    authored.graphs.schedule.nodes.reverse()
    for (const output of authored.graphs.schedule.outputs) output.node = names[output.node as keyof typeof names]
    authored.steps[0].execute.bindings = { 'origin.value': { input: 'key' } }
  }
  const compiled = compileLesson({ ...slidingWindowDemoDocuments, lesson: stringify(authored) })
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
  const graph = compiled.value.graphs.schedule
  const result = executeWorkerRequest({ requestId: 'windows', kind: 'execute', payload: {
    graph: graph.graph, inputs: { [`${names.key}.value`]: compiled.value.inputs.key.default },
  } })
  if (result.kind !== 'snapshot') throw new Error(JSON.stringify(result))
  expect(graph.graph.schema).toBe(2)
  const keys = [names.rk1, names.rk2, names.rk3, names.rk4]
  expect(keys.map((id) => hex(result.snapshot.outputs[`${id}.value`] as BitsValue))).toEqual(expected)
  expect(keys.map((id) => result.snapshot.outputs[`${id}.value`].type)).toEqual(Array(4).fill({ family: 'bits', size: 16 }))
  expect(result.snapshot.trace.filter((event) => 'value' in event)).toHaveLength(5)
  expect(graph.lineage).toHaveLength(64)
  keys.forEach((id, index) => {
    expect(graph.lineage!.filter((edge) => edge.target === `${id}.value`).sort((a, b) => a.targetBit - b.targetBit)).toEqual(
      sourceBits[index].map((sourceBit, targetBit) => ({ source: `${names.key}.value`, sourceBit, target: `${id}.value`, targetBit })),
    )
  })
})

it('packs the second window from seven-bit and nine-bit projections without concatenating padded storage', () => {
  const authored = parse(slidingWindowDemoDocuments.lesson)
  const window = authored.graphs.schedule.nodes.find((node: AuthoredNode) => node.id === 'rk2')
  window.operation = 'core.concat@1'
  window.inputs = { left: { node: 'key', port: 'value', bits: [4, 7] }, right: { node: 'key', port: 'value', bits: [11, 9] } }
  const compiled = compileLesson({ ...slidingWindowDemoDocuments, lesson: stringify(authored) })
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
  const result = executeWorkerRequest({ requestId: 'packing', kind: 'execute', payload: {
    graph: compiled.value.graphs.schedule.graph, inputs: { 'key.value': compiled.value.inputs.key.default },
  } })
  if (result.kind !== 'snapshot') throw new Error(JSON.stringify(result))
  // 0x2345 = 0010001 | 101000101; byte padding is not part of either logical input.
  const packed = result.snapshot.outputs['rk2.value'] as BitsValue
  expect(packed.type).toEqual({ family: 'bits', size: 16 })
  expect([...packed.bytes]).toEqual([0x23, 0x45])
})
