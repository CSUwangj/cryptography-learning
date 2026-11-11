import { parse, stringify } from 'yaml'
import { aesInverseCipherGraph } from '../src/crypto_graph'
import type { LessonDocuments } from '../src/lesson_runtime'
import { keyAvalancheLesson } from './keyAvalancheLesson'
import { serializeLessonLocales } from './serializeLessonLocales'
import enUS from './locales/en-US/keyChange.json' with { type: 'json' }
import zhCN from './locales/zh-CN/keyChange.json' with { type: 'json' }

const locales = { 'en-US': enUS, 'zh-CN': zhCN }

// Reuse authored schedules and cipher graphs, including the registered inverse builder.
export const aesKeyChangeLesson = (documents: LessonDocuments, variant: 128 | 192 | 256, direction: 'encrypt' | 'decrypt'): LessonDocuments => {
  const authored = parse(documents.lesson)
  const schedule = keyAvalancheLesson(documents)
  const lesson = parse(schedule.lesson)
  lesson.id = `aes${variant}-key-change-${direction}`
  const graph = direction === 'encrypt' ? 'cipher' : 'decrypt'
  const data = direction === 'encrypt' ? 'plaintext' : 'ciphertext'
  if (direction === 'decrypt' && !authored.graphs.decrypt) {
    const inverse = aesInverseCipherGraph(variant)
    authored.graphs.decrypt = {
      nodes: inverse.nodes.map((node) => ({ ...node,
        role: node.id.startsWith('round-key-') ? 'round-key' : 'state',
        round: Number(node.id.match(/\d+/)?.[0] ?? { 128: 10, 192: 12, 256: 14 }[variant]),
        unit: node.id.startsWith('round-key-') ? 32 : 8,
      })),
      outputs: inverse.outputs,
    }
  }
  lesson.inputs[data] = direction === 'encrypt' ? authored.inputs.plaintext : {
    type: { family: 'bits', size: 128 }, encoding: 'hex',
    default: { 128: '0x69c4e0d86a7b0430d8cdb78070b4c55a', 192: '0xdda97ca4864cdfe06eaf70a0ec0d7191', 256: '0x8ea2b7ca516745bfeafc49904b496089' }[variant],
  }
  lesson.graphs[graph] = authored.graphs[graph]
  lesson.steps[1].prose = 'schedule-description'
  lesson.steps.push({
    id: 'compare-cipher', prose: 'cipher-description',
    presentation: { kind: 'spn-cipher', algorithm: 'AES', variant, direction, overlay: true },
    visualizer: { id: 'avalanche@1', compare: {
      kind: 'avalanche', keyChange: 'compare-key', graph, traceLevel: 'detail',
      bindings: Object.fromEntries(authored.graphs[graph].nodes.filter((node: { operation: string }) => node.operation === 'core.source@1')
        .map((node: { id: string }) => [node.id, node.id === data
          ? { input: data }
          : { step: 'compare-key', output: `${node.id}.value` }])),
    } },
  })
  return {
    lesson: stringify(lesson, { aliasDuplicateObjects: false }),
    locales: serializeLessonLocales(locales, (copy) => stringify(copy[direction])
      .replaceAll('{{variant}}', String(variant)).replaceAll('{{dataDefault}}', lesson.inputs[data].default)),
  }
}

// Keep complete first-generation AES-192 lineage and real cipher transforms for UI checks.
export const firstAes192KeyChangeLesson = (source: string, direction: 'encrypt' | 'decrypt'): LessonDocuments => {
  const lesson = parse(source)
  const scheduleNodes = new Set(['key', 'rot-0', 'sub-0', 'rcon-0', 'batch-0', 'round-key-0', 'round-key-1', 'round-key-2'])
  const cipherNodes = new Set(['plaintext', 'round-key-0', 'add-round-key-0', 'sub-bytes-1', 'shift-rows-1', 'mix-columns-1', 'round-key-1', 'add-round-key-1'])
  lesson.graphs.schedule.nodes = lesson.graphs.schedule.nodes.filter((node: { id: string }) => scheduleNodes.has(node.id))
  lesson.graphs.schedule.outputs = lesson.graphs.schedule.outputs.filter((output: { node: string }) => scheduleNodes.has(output.node))
  lesson.graphs.cipher.nodes = lesson.graphs.cipher.nodes.filter((node: { id: string }) => cipherNodes.has(node.id))
  lesson.graphs.cipher.outputs = [{ node: 'add-round-key-1', port: 'value' }]
  return aesKeyChangeLesson({ lesson: stringify(lesson), locales: {} }, 192, direction)
}
