import React, { useMemo } from 'react'
import { hex, type BitsValue, type TraceEvent, type WorkerExecutionSnapshot } from 'crypto_graph'
import { LearningPresentationView, type LearningPresentation } from '../ui/learning'
import { flowRows, formatTracePath, type FlowNode } from './traceFlow'

type Locale = 'en-US' | 'zh-CN'

export type TeachingSpnRendererProps = {
  readonly execution: WorkerExecutionSnapshot
  readonly locale: string
  readonly executionIdentity: string
}

const copy = {
  'en-US': {
    title: 'Teaching SPN execution',
    instructions: 'Select a bit to inspect structural lineage. Lines show structural dependency, not individual causation.',
    flow: 'State flow',
    stage: 'Stage',
    keys: 'Round keys',
    bit: 'Bit',
    value: 'Value',
    selected: 'Selected lineage',
    details: 'Operation detail',
    input: 'Input state',
    output: 'Output state',
    round: 'Round',
    keyMix: 'Key-mixing result',
    substitution: 'S-box result',
    permutation: 'Permutation result',
    roundState: 'Round state',
    xor: 'XOR',
    sBox: 'S-box',
    different: 'different',
    incomplete: 'Trace is incomplete. Retained raw values remain visible; lineage stops at missing stages.',
    gap: 'Trace gap',
  },
  'zh-CN': {
    title: '教学 SPN 执行',
    instructions: '选择一位以查看结构谱系。连线表示结构依赖，不表示单个位的独立因果。',
    flow: '状态流',
    stage: '阶段',
    keys: '轮密钥',
    bit: '位',
    value: '值',
    selected: '所选谱系',
    details: '操作详情',
    input: '输入状态',
    output: '输出状态',
    round: '轮',
    keyMix: '密钥混合结果',
    substitution: 'S 盒结果',
    permutation: '置换结果',
    roundState: '轮状态',
    xor: '异或',
    sBox: 'S 盒',
    different: '不同',
    incomplete: '轨迹不完整。保留的原始值仍可见；谱系会在缺失阶段停止。',
    gap: '轨迹缺口',
  },
} as const

const textFor = (locale: string) => copy[locale as Locale] ?? copy['en-US']
const isBits = (event: TraceEvent): event is TraceEvent & { readonly value: BitsValue } =>
  event.value?.type.family === 'bits' && 'bytes' in event.value

const stageName = (node: FlowNode, locale: string): string => {
  const text = textFor(locale)
  if (node.stage === 'input') return text.input
  if (node.stage === 'key-mix') return text.keyMix
  if (node.stage === 'substitute') return text.substitution
  if (node.stage === 'permute') return text.permutation
  if (node.stage === 'output') return node.round === undefined ? text.output : text.roundState
  return formatTracePath(node.path, locale)
}

export const teachingSpnPresentation = (execution: WorkerExecutionSnapshot, locale: string, executionIdentity: string): LearningPresentation => {
  const text = textFor(locale)
  const nodes: readonly FlowNode[] = execution.trace.flatMap((event) => 'value' in event && isBits(event)
    ? [{ path: event.path, round: event.round, stage: event.stage, operation: event.operation, values: [event.value] }]
    : [])
  const rows = flowRows(nodes, text, (node) => stageName(node, locale)).map((row, index) => ({
    ...row,
    cells: [{ value: nodes[index].round ?? '—' }, { value: `${formatTracePath(nodes[index].path, locale)}: ${hex(nodes[index].values[0])}` }],
  }))
  return {
    title: text.title,
    instructions: text.instructions,
    executionIdentity,
    initialSelection: rows.find((row) => row.selectableBits)?.selectableBits?.[0]?.id,
    selectionStatus: (selected) => !selected
      ? text.gap
      : 'bit' in selected
        ? `${text.selected}: ${rows.find((row) => row.selectableBits?.includes(selected))?.label}, ${text.bit} ${selected.bit}.`
        : `${text.selected}: ${selected.ariaLabel}`,
    sections: [
      { kind: 'trace', caption: text.flow, headers: [text.stage, text.round, text.value, text.bit, text.details], rows },
      ...(execution.traceStatus.truncated
        ? [{ kind: 'raw' as const, caption: text.incomplete, headers: [text.stage, text.value], rows: [{ id: 'gap', label: text.gap, state: 'incomplete' as const, cells: [{ value: '—' }] }] }]
        : []),
    ],
  }
}

export const TeachingSpnRenderer: React.FC<TeachingSpnRendererProps> = ({ execution, locale, executionIdentity }) => {
  const presentation = useMemo(() => teachingSpnPresentation(execution, locale, executionIdentity), [execution, locale, executionIdentity])
  return <LearningPresentationView presentation={presentation} />
}
