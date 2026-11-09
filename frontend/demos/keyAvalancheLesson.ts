import { parse, stringify } from 'yaml'
import type { LessonDocuments } from '../src/lesson_runtime'

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
    locales: {
      'en-US': `title: Inspect one original-key bit
summary: Compare real standalone AES key schedules after changing one original-key bit.
texts:
  introduction: Edit the original key and choose one MSB-first bit. Continue to inspect the paired schedule. Choosing another bit replaces the previous flip.
  key: Original key
`,
      'zh-CN': `title: 检查一个原始密钥位
summary: 改变原始密钥的一个位，比较真实的独立 AES 密钥编排。
texts:
  introduction: 编辑原始密钥并选择一个从最高有效位开始编号的位。继续下一步查看成对编排。更换位会替换之前的翻转。
  key: 原始密钥
`,
    },
  }
}
