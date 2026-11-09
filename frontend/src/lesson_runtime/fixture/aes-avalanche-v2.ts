import { parse, stringify } from 'yaml'
import { aesInverseCipherGraph } from '../../crypto_graph'
import type { LessonDocuments } from '../index'

// Reuse the authored v2 schedules/ciphers and the registered inverse-cipher builder.
export const dataAvalancheLesson = (documents: LessonDocuments, variant: 128 | 192 | 256, direction: 'encrypt' | 'decrypt'): LessonDocuments => {
  const lesson = parse(documents.lesson)
  const rounds = { 128: 10, 192: 12, 256: 14 }[variant]
  const ciphertext = {
    128: '0x69c4e0d86a7b0430d8cdb78070b4c55a',
    192: '0xdda97ca4864cdfe06eaf70a0ec0d7191',
    256: '0x8ea2b7ca516745bfeafc49904b496089',
  }[variant]
  if (direction === 'decrypt' && !lesson.graphs.decrypt) {
    const inverse = aesInverseCipherGraph(variant)
    lesson.graphs.decrypt = {
      nodes: inverse.nodes.map((node) => ({
        ...node,
        role: node.id.startsWith('round-key-') ? 'round-key' : 'state',
        round: Number(node.id.match(/\d+/)?.[0] ?? rounds),
        unit: node.id.startsWith('round-key-') ? 32 : 8,
      })),
      outputs: inverse.outputs,
    }
  }
  const source = direction === 'encrypt' ? 'plaintext' : 'ciphertext'
  const graph = direction === 'encrypt' ? 'cipher' : 'decrypt'
  lesson.inputs.ciphertext = { type: { family: 'bits', size: 128 }, encoding: 'hex', default: ciphertext }
  lesson.inputs[`changed-${source}`] = {
    ...lesson.inputs[source],
    default: `0x${(BigInt(lesson.inputs[source].default) ^ 1n << 127n).toString(16).padStart(32, '0')}`,
  }
  const schedule = lesson.steps[0]
  lesson.steps = [schedule, { ...schedule, id: 'equal-schedule' }, {
    id: 'compare',
    presentation: { kind: 'spn-cipher', algorithm: 'AES', variant, direction },
    visualizer: {
      id: 'avalanche@1',
      compare: {
        kind: 'avalanche', sources: [source], graph, traceLevel: 'detail',
        bindings: Object.fromEntries(lesson.graphs[graph].nodes.filter((node: { operation: string }) => node.operation === 'core.source@1')
          .map((node: { id: string }) => [node.id, node.id === source
            ? { baseline: { input: source }, changed: { input: `changed-${source}` } }
            : { baseline: { step: 'schedule', output: `${node.id}.value` }, changed: { step: 'equal-schedule', output: `${node.id}.value` } }])),
      },
    },
  }]
  return { ...documents, lesson: stringify(lesson, { aliasDuplicateObjects: false }) }
}
