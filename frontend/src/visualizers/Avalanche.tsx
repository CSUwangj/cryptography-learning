import React, { useMemo } from 'react'
import { hex, type AvalancheCheckpoint, type AvalancheComparison } from 'crypto_graph'
import { LearningPresentationView, type LearningPresentation, type LearningRow } from '../ui/learning'
import { flowRows, formatTracePath, type FlowNode } from './traceFlow'

type Locale = 'en-US' | 'zh-CN'
type CompleteCheckpoint = AvalancheCheckpoint & { readonly complete: true }

export type AvalancheRendererProps = {
  readonly comparison: AvalancheComparison
  readonly locale: string
  readonly executionIdentity: string
}

const copy = {
  'en-US': {
    title: 'Continuous avalanche comparison',
    instructions: 'Select one bit to inspect its structural lineage. Underlined cells differ; connected lines show dependency, not individual causation.',
    flow: 'State flow',
    summary: 'Comparison summary',
    raw: 'Retained raw execution values',
    stage: 'Stage',
    baseline: 'Baseline',
    changed: 'Changed',
    changedBits: 'Changed bits',
    ratio: 'Ratio',
    keys: 'Round keys',
    details: 'Operation details',
    incomplete: 'Trace is incomplete. Raw retained values remain visible; paired differences and lineage stop at the gap.',
    gap: 'Trace gap',
    warning: 'This round key differs between the two executions.',
    lineage: 'Selected bit lineage',
    noSelection: 'No differing plaintext bit is available.',
    keyMix: 'XOR operands and result',
    substitution: 'S-box input and output',
    permutation: 'Permutation source to destination',
    bit: 'Bit',
    different: 'different',
    run: 'Run',
    sBox: 'S-box',
    stages: {
      'add-round-key': 'AddRoundKey',
      'sub-bytes': 'SubBytes',
      'inv-sub-bytes': 'InvSubBytes',
      'shift-rows': 'ShiftRows',
      'inv-shift-rows': 'InvShiftRows',
      'mix-columns': 'MixColumns',
      'inv-mix-columns': 'InvMixColumns',
    },
  },
  'zh-CN': {
    title: '连续雪崩比较',
    instructions: '选择一位以查看其结构谱系。带下划线的格表示差异；连线表示依赖关系，不表示单个位的独立因果。',
    flow: '状态流',
    summary: '比较摘要',
    raw: '保留的原始执行值',
    stage: '阶段',
    baseline: '基准执行',
    changed: '改变后执行',
    changedBits: '改变位数',
    ratio: '比例',
    keys: '轮密钥',
    details: '操作详情',
    incomplete: '轨迹不完整。保留的原始值仍可见；配对差异和位谱系会在缺口处停止。',
    gap: '轨迹缺口',
    warning: '两次执行的这个轮密钥不同。',
    lineage: '所选位的谱系',
    noSelection: '没有可选择的不同明文位。',
    keyMix: '异或操作数与结果',
    substitution: 'S 盒输入和输出',
    permutation: '置换来源到目标',
    bit: '位',
    different: '不同',
    run: '执行',
    sBox: 'S 盒',
    stages: {
      'add-round-key': '轮密钥加',
      'sub-bytes': '字节替换',
      'inv-sub-bytes': '逆字节替换',
      'shift-rows': '行移位',
      'inv-shift-rows': '逆行移位',
      'mix-columns': '列混合',
      'inv-mix-columns': '逆列混合',
    },
  },
} as const

const textFor = (locale: string) => copy[locale as Locale] ?? copy['en-US']

const stageName = (checkpoint: { readonly path: string; readonly stage?: string; readonly round?: number }, locale: string): string => {
  const text = textFor(locale)
  if (checkpoint.stage === 'key-mix') return text.keyMix
  if (checkpoint.stage === 'substitute') return text.substitution
  if (checkpoint.stage === 'permute') return text.permutation
  if (checkpoint.stage && checkpoint.stage in text.stages) {
    const label = text.stages[checkpoint.stage as keyof typeof text.stages]
    return checkpoint.round === undefined ? label : `${label} ${checkpoint.round}`
  }
  return formatTracePath(checkpoint.path, locale)
}

export const avalanchePresentation = (comparison: AvalancheComparison, locale: string, executionIdentity: string): LearningPresentation => {
  const text = textFor(locale)
  const checkpoints = comparison.checkpoints.filter((checkpoint): checkpoint is CompleteCheckpoint => checkpoint.complete)
  const nodes: readonly FlowNode[] = checkpoints.map((checkpoint) => ({ ...checkpoint, values: [checkpoint.left, checkpoint.right] }))
  const rows = flowRows(nodes, { ...text, xor: text.keyMix }, (node) => stageName(node, locale)).map((row, index) => ({
    ...row,
    cells: [
      { value: `${hex(checkpoints[index].left)} | ${hex(checkpoints[index].right)}` },
    ],
  }))
  const warned = (checkpoint: AvalancheCheckpoint): boolean => checkpoint.complete && checkpoint.stage === 'round-key' && checkpoint.changedBits > 0
  const summary: readonly LearningRow[] = comparison.checkpoints.map((checkpoint) => checkpoint.complete
    ? {
        id: checkpoint.path,
        label: stageName(checkpoint, locale),
        state: warned(checkpoint) ? 'warning' : undefined,
        cells: [hex(checkpoint.left), hex(checkpoint.right), checkpoint.changedBits, checkpoint.ratio].map((value) => ({ value })),
        detail: warned(checkpoint) ? text.warning : undefined,
      }
    : { id: checkpoint.path, label: stageName(checkpoint, locale), cells: [{ value: text.gap }] })
  const retained: readonly LearningRow[] = (['baseline', 'changed'] as const).flatMap((run) => comparison.executions[run].trace.flatMap((event) =>
    'value' in event && event.value && 'bytes' in event.value ? [{ id: `${run}-${event.path}`, label: text[run], cells: [{ value: event.path }, { value: hex(event.value) }] }] : []))
  const input = rows.find((row) => (row.id === 'plaintext' || row.id === 'ciphertext') && row.selectableBits)
  const initialChanged = input?.selectableBits?.find((bit) => bit.state === 'changed')?.id
    ?? rows.flatMap((row) => row.selectableBits ?? []).find((bit) => bit.state === 'changed')?.id
  return {
    title: text.title,
    instructions: text.instructions,
    executionIdentity,
    initialSelection: initialChanged,
    selectionStatus: (selected) => !selected
      ? text.noSelection
      : 'bit' in selected
        ? `${text.lineage}: ${rows.find((row) => row.selectableBits?.includes(selected))?.label}, ${text.bit} ${selected.bit}.`
        : `${text.lineage}: ${selected.ariaLabel}`,
    sections: [
      { kind: 'trace', caption: text.flow, headers: [text.stage, `${text.baseline} | ${text.changed}`, text.bit, text.details], rows },
      {
        kind: 'comparison',
        caption: text.summary,
        headers: [text.stage, text.baseline, text.changed, text.changedBits, text.ratio, ...(summary.some((row) => row.detail) ? [text.details] : [])],
        rows: summary,
      },
      ...(comparison.truncated
        ? [{
            kind: 'raw' as const,
            caption: text.incomplete,
            headers: [text.run, text.stage, text.raw],
            rows: [...retained, { id: 'gap', label: text.gap, state: 'incomplete' as const, cells: [{ value: '—' }, { value: '—' }] }],
          }]
        : []),
    ],
  }
}

export const AvalancheRenderer: React.FC<AvalancheRendererProps> = ({ comparison, locale, executionIdentity }) => {
  const presentation = useMemo(() => avalanchePresentation(comparison, locale, executionIdentity), [comparison, locale, executionIdentity])
  return <LearningPresentationView presentation={presentation} />
}
