import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import React, { useMemo } from 'react'
import { hex, type BitsValue, type TraceEvent, type WorkerExecutionSnapshot } from 'crypto_graph'
import { LearningPresentationView, type LearningPresentation } from '../ui/learning'
import { flowRows, formatTracePath, type FlowNode } from './traceFlow'

export type TeachingSpnRendererProps = {
  readonly execution: WorkerExecutionSnapshot
  readonly executionIdentity: string
}

const isBits = (event: TraceEvent): event is TraceEvent & { readonly value: BitsValue } =>
  event.value?.type.family === 'bits' && 'bytes' in event.value

const stageName = (node: FlowNode, t: TFunction<'visualizers'>): string => {
  if (node.stage === 'input') return t('teachingSpn.input')
  if (node.stage === 'key-mix') return t('teachingSpn.keyMix')
  if (node.stage === 'substitute') return t('teachingSpn.substitution')
  if (node.stage === 'permute') return t('teachingSpn.permutation')
  if (node.stage === 'output') return node.round === undefined ? t('teachingSpn.output') : t('teachingSpn.roundState')
  return formatTracePath(node.path, t)
}

export const teachingSpnPresentation = (execution: WorkerExecutionSnapshot, t: TFunction<'visualizers'>, executionIdentity: string): LearningPresentation => {
  const nodes: readonly FlowNode[] = execution.trace.flatMap((event) => 'value' in event && isBits(event)
    ? [{ path: event.path, round: event.round, stage: event.stage, operation: event.operation, values: [event.value] }]
    : [])
  const rows = flowRows(nodes, { bit: t('teachingSpn.bit'), keys: t('teachingSpn.keys'), xor: t('teachingSpn.xor'), sBox: t('teachingSpn.sBox'), different: t('teachingSpn.different') }, (node) => stageName(node, t)).map((row, index) => ({
    ...row,
    cells: [{ value: nodes[index].round ?? '—' }, { value: `${formatTracePath(nodes[index].path, t)}: ${hex(nodes[index].values[0])}` }],
  }))
  return {
    title: t('teachingSpn.title'),
    instructions: t('teachingSpn.instructions'),
    executionIdentity,
    initialSelection: rows.find((row) => row.selectableBits)?.selectableBits?.[0]?.id,
    selectionStatus: (selected) => !selected
      ? t('teachingSpn.gap')
      : 'bit' in selected
        ? `${t('teachingSpn.selected')}: ${rows.find((row) => row.selectableBits?.includes(selected))?.label}, ${t('teachingSpn.bit')} ${selected.bit}.`
        : `${t('teachingSpn.selected')}: ${selected.ariaLabel}`,
    sections: [
      { kind: 'trace', caption: t('teachingSpn.flow'), headers: [t('teachingSpn.stage'), t('teachingSpn.round'), t('teachingSpn.value'), t('teachingSpn.bit'), t('teachingSpn.details')], rows },
      ...(execution.traceStatus.truncated
        ? [{ kind: 'raw' as const, caption: t('teachingSpn.incomplete'), headers: [t('teachingSpn.stage'), t('teachingSpn.value')], rows: [{ id: 'gap', label: t('teachingSpn.gap'), state: 'incomplete' as const, cells: [{ value: '—' }] }] }]
        : []),
    ],
  }
}

export const TeachingSpnRenderer: React.FC<TeachingSpnRendererProps> = ({ execution, executionIdentity }) => {
  const { t } = useTranslation('visualizers')
  const presentation = useMemo(() => teachingSpnPresentation(execution, t, executionIdentity), [execution, t, executionIdentity])
  return <LearningPresentationView presentation={presentation} />
}
