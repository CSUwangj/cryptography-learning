import { useTranslation } from 'react-i18next'
import React from 'react'
import { hex, type AlphabetMapping, type AlphabetPolicyValue, type AlphabetTextValue, type AvalancheComparison, type WorkerExecutionSnapshot } from 'crypto_graph'
import type { LessonPresentation, LessonValueReference } from '../lesson_runtime'
import { AvalancheRenderer } from './Avalanche'
import { classicalCipherPositions, ClassicalCipherRenderer } from './ClassicalCipher'
import { TeachingSpnRenderer } from './TeachingSpn'
import { BlockCipherRenderer } from './BlockCipher'
import { KeyExpansionRenderer } from './KeyExpansion'
import { ExecutionTraceRenderer } from './ExecutionTrace'

export type RenderHostProps = {
  /** Absent for descriptor-free Steps, whose execution renders as a generic trace. */
  readonly invocation?: { readonly id: string }
  /** Explicit presentation metadata; never inferred from key length or graph identity. */
  readonly presentation?: LessonPresentation
  /** Text values for locale-specific presentation label IDs authored by the Lesson. */
  readonly lessonTexts?: Readonly<Record<string, string>>
  /** All step snapshots in the lesson; passed so block-cipher can locate the expansion step. */
  readonly allSnapshots?: Readonly<Record<string, WorkerExecutionSnapshot>>
  /** bindings map from the Step that produced `execution`, for deriving the schedule step. */
  readonly executionBindings?: Readonly<Record<string, LessonValueReference>>
  readonly comparison?: AvalancheComparison
  readonly execution?: WorkerExecutionSnapshot
  readonly dimensions: { readonly width: number; readonly height: number }
  readonly reducedMotion: boolean
  readonly executionIdentity: string
  readonly classicalCipher?: {
    readonly input: AlphabetTextValue
    readonly output: AlphabetTextValue
    readonly mapping: AlphabetMapping
    readonly policy: AlphabetPolicyValue
    readonly policyLabel: string
    readonly motionDirection?: 1 | -1
  }
}

const safeHex = (value: unknown): string =>
  typeof value === 'object' && value !== null && 'type' in value && 'bytes' in value
    && (value as { bytes: unknown }).bytes instanceof Uint8Array
    ? hex(value as Parameters<typeof hex>[0])
    : '—'

const Fallback: React.FC<Pick<RenderHostProps, 'comparison' | 'execution'>> = ({ comparison, execution }) => {
  const { t } = useTranslation('visualizers', { keyPrefix: 'fallback' })
  const events = execution?.trace.filter((event): event is import('crypto_graph').TraceEvent =>
    'value' in event && event.value !== undefined) ?? []
  if (!comparison) return <section role="alert">
    <h3>{t('title')}</h3>
    <table>
      <caption>{t('executionSummary')}</caption>
      <thead><tr><th>{t('path')}</th><th>{t('value')}</th></tr></thead>
      <tbody>{events.map((event) => <tr key={event.path}><th>{event.path}</th><td>{safeHex(event.value)}</td></tr>)}</tbody>
    </table>
  </section>
  return <section role="alert">
    <h3>{t('title')}</h3>
    <table>
      <caption>{t('comparisonSummary')}</caption>
      <thead><tr><th>{t('path')}</th><th>{t('baseline')}</th><th>{t('changed')}</th><th>{t('mask')}</th></tr></thead>
      <tbody>{comparison.checkpoints.map((checkpoint) => checkpoint.complete
        ? <tr key={checkpoint.path}>
            <th>{checkpoint.path}</th><td>{safeHex(checkpoint.left)}</td><td>{safeHex(checkpoint.right)}</td><td>{safeHex(checkpoint.mask)}</td>
          </tr>
        : <tr key={checkpoint.path}><th>{checkpoint.path}</th><td colSpan={3}>{t('gap')}</td></tr>)}</tbody>
    </table>
  </section>
}

class IsolatedRenderer extends React.Component<Pick<RenderHostProps, 'comparison' | 'execution'> & { readonly children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render(): React.ReactNode {
    if (this.state.failed) return <Fallback comparison={this.props.comparison} execution={this.props.execution} />
    return this.props.children
  }
}

export const RenderHost: React.FC<RenderHostProps> = (props) => {
  // Block-cipher overlay: derive the expansion step from the cipher step's round-key bindings.
  const roundKeySource = props.presentation?.kind === 'block-cipher'
    ? Object.values(props.executionBindings ?? {}).find((reference): reference is Extract<LessonValueReference, { readonly step: string }> =>
      'step' in reference && reference.output.startsWith('round-key-'))
    : undefined
  const keyScheduleExecution = roundKeySource && props.allSnapshots?.[roundKeySource.step]
  const presentation = props.presentation?.labels && props.lessonTexts
    ? { ...props.presentation, labels: Object.fromEntries(Object.entries(props.presentation.labels).map(([identity, textId]) => [identity, props.lessonTexts![textId] ?? textId])) }
    : props.presentation
  return <IsolatedRenderer comparison={props.comparison} execution={props.execution} key={props.executionIdentity}>
      {presentation?.kind === 'block-cipher' && props.execution
        ? <BlockCipherRenderer
            execution={props.execution}
            executionIdentity={props.executionIdentity}
            presentation={presentation}
            keyScheduleExecution={keyScheduleExecution}
          />
        : presentation?.kind === 'key-expansion' && props.execution
          ? <KeyExpansionRenderer
              execution={props.execution}
              executionIdentity={props.executionIdentity}
              presentation={presentation}
            />
        : !props.invocation && props.execution
        ? <ExecutionTraceRenderer
            execution={props.execution}
            executionIdentity={props.executionIdentity}
            primitiveLabels={presentation?.labels}
          />
        : props.invocation?.id === 'avalanche@1' && props.comparison
        ? <AvalancheRenderer
            comparison={props.comparison}
            executionIdentity={props.executionIdentity}
          />
        : props.invocation?.id === 'teaching-spn@1' && props.execution
          ? <TeachingSpnRenderer
              execution={props.execution}
              executionIdentity={props.executionIdentity}
            />
          : props.invocation?.id === 'classical-cipher@1' && props.classicalCipher
            ? <ClassicalCipherRenderer
                {...props.classicalCipher}
                positions={classicalCipherPositions(
                  props.classicalCipher.input,
                  props.classicalCipher.output,
                  props.classicalCipher.mapping,
                )}
                reducedMotion={props.reducedMotion}
              />
            : <Fallback comparison={props.comparison} execution={props.execution} />}
  </IsolatedRenderer>
}
