import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import React, { useMemo } from 'react'
import { hex, type AvalancheCheckpoint, type AvalancheComparison } from 'crypto_graph'
import { LearningPresentationView, type LearningPresentation, type LearningRow } from '../ui/learning'
import { flowRows, formatTracePath, type FlowNode } from './traceFlow'

type CompleteCheckpoint = AvalancheCheckpoint & { readonly complete: true }

export type AvalancheRendererProps = {
  readonly comparison: AvalancheComparison
  readonly executionIdentity: string
}

const stageName = (checkpoint: { readonly path: string; readonly stage?: string; readonly round?: number }, t: TFunction<'visualizers'>): string => {
  if (checkpoint.stage === 'key-mix') return t('avalanche.keyMix')
  if (checkpoint.stage === 'substitute') return t('avalanche.substitution')
  if (checkpoint.stage === 'permute') return t('avalanche.permutation')
  if (checkpoint.stage && ['add-round-key', 'sub-bytes', 'inv-sub-bytes', 'shift-rows', 'inv-shift-rows', 'mix-columns', 'inv-mix-columns'].includes(checkpoint.stage)) {
    const label = t(`avalanche.stages.${checkpoint.stage}`)
    return checkpoint.round === undefined ? label : `${label} ${checkpoint.round}`
  }
  return formatTracePath(checkpoint.path, t)
}

export const avalanchePresentation = (comparison: AvalancheComparison, t: TFunction<'visualizers'>, executionIdentity: string): LearningPresentation => {
  const checkpoints = comparison.checkpoints.filter((checkpoint): checkpoint is CompleteCheckpoint => checkpoint.complete)
  const nodes: readonly FlowNode[] = checkpoints.map((checkpoint) => ({ ...checkpoint, values: [checkpoint.left, checkpoint.right] }))
  const rows = flowRows(nodes, { bit: t('avalanche.bit'), keys: t('avalanche.keys'), xor: t('avalanche.keyMix'), sBox: t('avalanche.sBox'), different: t('avalanche.different') }, (node) => stageName(node, t)).map((row, index) => ({
    ...row,
    cells: [
      { value: `${hex(checkpoints[index].left)} | ${hex(checkpoints[index].right)}` },
    ],
  }))
  const warned = (checkpoint: AvalancheCheckpoint): boolean => checkpoint.complete && checkpoint.stage === 'round-key' && checkpoint.changedBits > 0
  const summary: readonly LearningRow[] = comparison.checkpoints.map((checkpoint) => checkpoint.complete
    ? {
        id: checkpoint.path,
        label: stageName(checkpoint, t),
        state: warned(checkpoint) ? 'warning' : undefined,
        cells: [hex(checkpoint.left), hex(checkpoint.right), checkpoint.changedBits, checkpoint.ratio].map((value) => ({ value })),
        detail: warned(checkpoint) ? t('avalanche.warning') : undefined,
      }
    : { id: checkpoint.path, label: stageName(checkpoint, t), cells: [{ value: t('avalanche.gap') }] })
  const retained: readonly LearningRow[] = (['baseline', 'changed'] as const).flatMap((run) => comparison.executions[run].trace.flatMap((event) =>
    'value' in event && event.value && 'bytes' in event.value ? [{ id: `${run}-${event.path}`, label: t(`avalanche.${run}`), cells: [{ value: event.path }, { value: hex(event.value) }] }] : []))
  const input = rows.find((row) => (row.id === 'plaintext' || row.id === 'ciphertext') && row.selectableBits)
  const initialChanged = input?.selectableBits?.find((bit) => bit.state === 'changed')?.id
    ?? rows.flatMap((row) => row.selectableBits ?? []).find((bit) => bit.state === 'changed')?.id
  return {
    title: t('avalanche.title'),
    instructions: t('avalanche.instructions'),
    executionIdentity,
    initialSelection: initialChanged,
    selectionStatus: (selected) => !selected
      ? t('avalanche.noSelection')
      : 'bit' in selected
        ? `${t('avalanche.lineage')}: ${rows.find((row) => row.selectableBits?.includes(selected))?.label}, ${t('avalanche.bit')} ${selected.bit}.`
        : `${t('avalanche.lineage')}: ${selected.ariaLabel}`,
    sections: [
      { kind: 'trace', caption: t('avalanche.flow'), headers: [t('avalanche.stage'), `${t('avalanche.baseline')} | ${t('avalanche.changed')}`, t('avalanche.bit'), t('avalanche.details')], rows },
      {
        kind: 'comparison',
        caption: t('avalanche.summary'),
        headers: [t('avalanche.stage'), t('avalanche.baseline'), t('avalanche.changed'), t('avalanche.changedBits'), t('avalanche.ratio'), ...(summary.some((row) => row.detail) ? [t('avalanche.details')] : [])],
        rows: summary,
      },
      ...(comparison.truncated
        ? [{
            kind: 'raw' as const,
            caption: t('avalanche.incomplete'),
            headers: [t('avalanche.run'), t('avalanche.stage'), t('avalanche.raw')],
            rows: [...retained, { id: 'gap', label: t('avalanche.gap'), state: 'incomplete' as const, cells: [{ value: '—' }, { value: '—' }] }],
          }]
        : []),
    ],
  }
}

export const AvalancheRenderer: React.FC<AvalancheRendererProps> = ({ comparison, executionIdentity }) => {
  const { t } = useTranslation('visualizers')
  const presentation = useMemo(() => avalanchePresentation(comparison, t, executionIdentity), [comparison, t, executionIdentity])
  return <LearningPresentationView presentation={presentation} />
}
