import { parse, stringify } from 'yaml'
import type { LessonDocuments } from '../src/lesson_runtime'
import { serializeLessonLocales } from './serializeLessonLocales'
import enUS from './locales/en-US/keyAvalanche.json' with { type: 'json' }
import zhCN from './locales/zh-CN/keyAvalanche.json' with { type: 'json' }

const locales = { 'en-US': enUS, 'zh-CN': zhCN }

// Public synthetic content reuses the authored real AES schedule, without its cipher.
export const keyAvalancheLesson = (documents: LessonDocuments): LessonDocuments => {
  const lesson = parse(documents.lesson)
  const key = lesson.inputs.key
  lesson.id = 'key-avalanche'
  lesson.inputs = {
    key,
    'changed-key': { ...key, default: `0x${(BigInt(key.default) ^ 1n << BigInt(key.type.size - 1)).toString(16).padStart(key.type.size / 4, '0')}` },
  }
  lesson.graphs = { schedule: lesson.graphs.schedule }
  lesson.steps = [{
    id: 'key-inputs', prose: 'introduction',
    inputs: [{ input: 'key', prompt: 'key' }],
    bit_flip: [{ input: 'key', changed: 'changed-key', prompt: 'key' }],
  }, {
    id: 'compare-key', presentation: lesson.steps[0].presentation,
    visualizer: { id: 'avalanche@1', compare: {
      kind: 'avalanche', sources: ['key'], graph: 'schedule', traceLevel: 'detail',
      bindings: { key: { baseline: { input: 'key' }, changed: { input: 'changed-key' } } },
    } },
  }]
  return {
    lesson: stringify(lesson, { aliasDuplicateObjects: false }),
    locales: serializeLessonLocales(locales),
  }
}
