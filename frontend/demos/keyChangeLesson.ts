import { parse, stringify } from 'yaml'
import { aesInverseCipherGraph } from '../src/crypto_graph'
import type { LessonDocuments } from '../src/lesson_runtime'
import { keyAvalancheLesson } from './keyAvalancheLesson'

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
    locales: {
      'en-US': `title: AES-${variant} key-change ${direction === 'encrypt' ? 'encryption' : 'decryption'} overlay
summary: Follow one original-key bit through paired schedules into AES-${variant} ${direction === 'encrypt' ? 'encryption' : 'decryption'}, then open the complete schedule overlay.
texts:
  key: Original key
  introduction: >-
    The data-bit avalanche example changes the message. This key-change avalanche experiment
    flips one bit of the original key, derives baseline and changed key schedules, and feeds
    each schedule into its matching ${direction === 'encrypt' ? 'encryption' : 'decryption'} execution.
    Both executions use the same ${data}: \`${lesson.inputs[data].default}\`.
    Edit the original key or choose another MSB-first bit, then choose Next to compare the schedules.
    Choosing another bit replaces the previous flip.
  schedule-description: >-
    Compare the original and changed keys and every exported round key in these two schedules.
    Derived round keys may differ in many bits even though the original key differs by exactly one bit.
    The standalone key-schedule example stops here. Choose Next to reach the
    ${direction === 'encrypt' ? 'encryption' : 'decryption'} comparison and its complete schedule overlay.
  cipher-description: >-
    Each ${direction === 'encrypt' ? 'encryption' : 'decryption'} uses the round keys from its corresponding schedule.
    Both ${data} inputs remain \`${lesson.inputs[data].default}\`; the paired output shows how the original-key change propagates through the cipher.
    Choose Show key schedule in the toolbar, or on any bound round-key row, to open the complete schedule overlay.
    Baseline and changed schedule values appear together, aligned with the cipher rows that consume each key.
    ${direction === 'encrypt' ? 'Encryption consumes round keys in forward order.' : 'Decryption consumes round keys in reverse order while preserving each schedule block\'s internal generation order.'}
    The overlay starts closed. Opening or closing it clears the comparison selection; each view keeps its own selection unit.
`,
      'zh-CN': `title: AES-${variant} 密钥变化与${direction === 'encrypt' ? '加密' : '解密'}叠加
summary: 跟随一个原始密钥位的变化，经过成对密钥编排进入 AES-${variant} ${direction === 'encrypt' ? '加密' : '解密'}，再打开完整密钥编排叠加视图。
texts:
  key: 原始密钥
  introduction: >-
    数据位雪崩示例改变消息。本密钥变化雪崩实验翻转原始密钥的一个位，生成基准与改变后的两份密钥编排，
    分别供对应的${direction === 'encrypt' ? '加密' : '解密'}执行使用。
    两次执行使用相同的${direction === 'encrypt' ? '明文' : '密文'}：\`${lesson.inputs[data].default}\`。
    编辑原始密钥或选择另一个从最高有效位开始编号的位，然后点击下一步比较编排。更换位会替换之前的翻转。
  schedule-description: >-
    比较两份编排中的原始密钥与每个导出的轮密钥。虽然原始密钥恰好只有一个位不同，派生轮密钥可以有多个位不同。
    独立密钥编排示例到此结束。在这里点击下一步进入${direction === 'encrypt' ? '加密' : '解密'}比较，查看完整密钥编排叠加视图。
  cipher-description: >-
    两次${direction === 'encrypt' ? '加密' : '解密'}分别使用对应编排的轮密钥。
    两份${direction === 'encrypt' ? '明文' : '密文'}输入均保持为 \`${lesson.inputs[data].default}\`，成对输出展示原始密钥变化如何经过密码运算传播。
    点击工具栏或任意已绑定轮密钥行上的"显示密钥编排"，打开完整密钥编排叠加视图。
    基准与改变后的编排值成对显示，并与消耗各轮密钥的密码运算行对齐。
    ${direction === 'encrypt' ? '加密按正向顺序消耗轮密钥。' : '解密按逆序消耗轮密钥，每个编排块内部保留原始生成顺序。'}
    叠加视图初始关闭。打开或关闭它会清空比较中的选择，每个视图保留独立的选择单位。
`,
    },
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
