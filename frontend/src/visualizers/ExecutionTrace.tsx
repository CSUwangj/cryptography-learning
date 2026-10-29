import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import React, { useMemo } from 'react'
import { hex, type CryptoValue, type TraceCheckpoint, type TraceEvent, type WorkerExecutionSnapshot } from 'crypto_graph'
import { learningColors, LearningPresentationView, type LearningDiagnostic, type LearningPresentation, type LearningRow } from '../ui/learning'
import { PermutationVisual } from './OperationVisuals'

export type ExecutionTraceRendererProps = {
  readonly execution: WorkerExecutionSnapshot
  readonly executionIdentity: string
  readonly primitiveLabels?: Readonly<Record<string, string>>
}

const valueText = (value: CryptoValue | undefined): string => {
  if (!value) return '—'
  if ('symbol' in value) return value.symbol
  if ('symbols' in value) return value.symbols.join('')
  if ('value' in value) return String(value.value)
  if ('words' in value) return `0x${[...value.words].map((word) => word.toString(16).padStart(2, '0')).join('')}`
  return hex(value)
}

const stageLabel = (
  event: TraceEvent | TraceCheckpoint,
  t: TFunction<'visualizers'>,
  outputs: WorkerExecutionSnapshot['outputs'],
  primitiveLabels: Readonly<Record<string, string>> | undefined,
): string => {
  if (event.path === 'plaintext') return t('executionTrace.plaintextInput')
  if (event.path === 'ciphertext') return t('executionTrace.ciphertextInput')
  if (event.path === 'output') return t('executionTrace.output')
  if ('summary' in event) return `${event.path in outputs ? t('executionTrace.output') : t('executionTrace.checkpoint')} (${event.path})`
  if (!event.stage && event.primitive) {
    const label = primitiveLabels?.[event.primitive] ?? t(event.primitive, { ns: 'primitives', keyPrefix: '', keySeparator: false, defaultValue: t('executionTrace.unnamed') })
    return event.round === undefined ? label : `${label} ${event.round}`
  }
  if (!event.stage) return `${event.path in outputs ? t('executionTrace.output') : t('executionTrace.checkpoint')} (${event.path})`
  const round = event.round
  return round === undefined ? t(`executionTrace.stages.${event.stage}`) : `${t(`executionTrace.stages.${event.stage}`)} ${round}`
}

const operationDetail = (event: TraceEvent | TraceCheckpoint, t: TFunction<'visualizers'>): React.ReactNode => {
  const operation = 'operation' in event ? event.operation : undefined
  if (operation?.permutation) return <PermutationVisual permutation={operation.permutation} />
  if (operation?.sBox) return `${t('executionTrace.sBox')}: ${operation.sBox.map((entry) => entry.toString(16)).join(' ')}`
  if (operation?.grid) {
    const grid = operation.grid
    const symbolText = (cell: string) => cell === ' ' ? t('executionTrace.spaceMarker') : cell
    const symbols = new Map(grid.rows.flatMap((row, rowIndex) => row.flatMap((cell, columnIndex) =>
      cell === null ? [] : [[grid.inputPositions[rowIndex][columnIndex], symbolText(cell)] as const])))
    const sequence = (positions: readonly number[]) => positions.map((position) => `${position}:${symbols.get(position)}`).join(' → ')
    return <section aria-label={t('executionTrace.grid')}>
      <p>{t('executionTrace.positionLegend')}</p>
      <table><caption>{t('executionTrace.order')}</caption><tbody>
        {grid.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, columnIndex) => <td key={columnIndex}
          aria-label={cell === null ? t('executionTrace.empty') : undefined}
          style={{ border: `1px solid ${learningColors.border}`, padding: '0.5rem', textAlign: 'center', whiteSpace: 'pre-wrap', backgroundColor: cell === null ? learningColors.incomplete : undefined }}>
          {cell === null ? t('executionTrace.emptyMarker') : `${grid.inputPositions[rowIndex][columnIndex]}:${symbolText(cell)}`}
        </td>)}</tr>)}
      </tbody></table>
      <p>{t('executionTrace.writePositions')}: {sequence(grid.writeOrder)}</p>
      <p>{t('executionTrace.readPositions')}: {sequence(grid.readOrder)}</p>
    </section>
  }
  return undefined
}

/**
 * Descriptor-free rendering for any ordinary execution trace: every retained trace event becomes
 * one row labeled from its semantic stage and round, so new algorithms need no renderer descriptor.
 * Internal key-schedule words stay trace metadata; their presence without presentation metadata
 * is reported instead of rendered as a word log.
 */
export const executionTracePresentation = (execution: WorkerExecutionSnapshot, t: TFunction<'visualizers'>, executionIdentity: string, primitiveLabels?: Readonly<Record<string, string>>): LearningPresentation => {
  const events = execution.trace.filter((event) => !('word' in event && event.word !== undefined))
  const modeMissingDiagnostic: LearningDiagnostic | undefined = events.length < execution.trace.length
    ? { code: 'presentation.key-expansion-mode-missing', message: t('executionTrace.modeMissing'), path: 'presentation' }
    : undefined
  const rows: LearningRow[] = events.map((event) => {
    const detail = operationDetail(event, t)
    const value = 'summary' in event ? execution.outputs[event.path] : event.value
    return {
      id: event.path,
      label: stageLabel(event, t, execution.outputs, primitiveLabels),
      ...(!('summary' in event) && !event.value ? { state: 'incomplete' as const } : {}),
      cells: [
        { value: 'round' in event && event.round !== undefined ? event.round : '—' },
        { value: valueText(value) },
      ],
      ...(detail ? { detail } : {}),
    }
  })
  const traceIncompleteDiagnostic: LearningDiagnostic | undefined = execution.traceStatus.truncated
    ? {
      code: 'trace.incomplete',
      message: t('executionTrace.incomplete'),
      path: 'trace',
      details: { retained: execution.traceStatus.retained, dropped: execution.traceStatus.dropped },
    }
    : undefined
  const diagnostics = [modeMissingDiagnostic, traceIncompleteDiagnostic].filter((item): item is LearningDiagnostic => item !== undefined)
  const warnings = execution.warnings?.map((warning) => ({
    ...warning,
    message: warning.code === 'cipher.transposition-short-input'
      ? warning.details.direction === 'decrypt' ? t('executionTrace.transpositionDecryptWarning') : t('executionTrace.transpositionEncryptWarning')
      : warning.message,
  })) ?? []
  const allDiagnostics = [...diagnostics, ...warnings]
  return {
    title: t('executionTrace.title'),
    instructions: modeMissingDiagnostic?.message,
    executionIdentity,
    diagnostics: allDiagnostics.length ? allDiagnostics : undefined,
    sections: [
      {
        kind: 'trace',
        caption: t('executionTrace.flow'),
        headers: rows.some((row) => row.detail) ? [t('executionTrace.stage'), t('executionTrace.round'), t('executionTrace.value'), t('executionTrace.details')] : [t('executionTrace.stage'), t('executionTrace.round'), t('executionTrace.value')],
        rows,
      },
      ...(traceIncompleteDiagnostic
        ? [{ kind: 'raw' as const, caption: t('executionTrace.incomplete'), headers: [t('executionTrace.stage'), t('executionTrace.value')], rows: [{ id: 'gap', label: t('executionTrace.gap'), state: 'incomplete' as const, cells: [{ value: '—' }] }] }]
        : []),
    ],
  }
}

export const ExecutionTraceRenderer: React.FC<ExecutionTraceRendererProps> = ({ execution, executionIdentity, primitiveLabels }) => {
  const { t } = useTranslation('visualizers')
  const presentation = useMemo(() => executionTracePresentation(execution, t, executionIdentity, primitiveLabels), [execution, t, executionIdentity, primitiveLabels])
  return <LearningPresentationView presentation={presentation} />
}
