import React from 'react'
import { hex, type AvalancheComparison, type WorkerExecutionSnapshot } from 'crypto_graph'
import { AvalancheRenderer } from './Avalanche'
import { TeachingSpnRenderer } from './TeachingSpn'

export type RenderHostProps = {
  readonly invocation: { readonly id: string }
  readonly comparison?: AvalancheComparison
  readonly execution?: WorkerExecutionSnapshot
  readonly locale: string
  readonly dimensions: { readonly width: number; readonly height: number }
  readonly reducedMotion: boolean
  readonly executionIdentity: string
}

const fallbackCopy = {
  'en-US': { title: 'Visualizer unavailable', executionSummary: 'Retained execution data', comparisonSummary: 'Retained comparison data', path: 'Path', value: 'Value', baseline: 'Baseline', changed: 'Changed', mask: 'Mask', gap: 'Incomplete trace gap' },
  'zh-CN': { title: '可视化工具不可用', executionSummary: '保留的执行数据', comparisonSummary: '保留的比较数据', path: '路径', value: '值', baseline: '基准执行', changed: '改变后执行', mask: '掩码', gap: '不完整轨迹缺口' },
} as const

const safeHex = (value: unknown): string =>
  typeof value === 'object' && value !== null && 'type' in value && 'bytes' in value
    && (value as { bytes: unknown }).bytes instanceof Uint8Array
    ? hex(value as Parameters<typeof hex>[0])
    : '—'

const Fallback: React.FC<Pick<RenderHostProps, 'comparison' | 'execution' | 'locale'>> = ({ comparison, execution, locale }) => {
  const text = fallbackCopy[locale as keyof typeof fallbackCopy] ?? fallbackCopy['en-US']
  const events = execution?.trace.filter((event): event is import('crypto_graph').TraceEvent =>
    'value' in event && event.value !== undefined) ?? []
  if (!comparison) return <section role="alert">
    <h3>{text.title}</h3>
    <table>
      <caption>{text.executionSummary}</caption>
      <thead><tr><th>{text.path}</th><th>{text.value}</th></tr></thead>
      <tbody>{events.map((event) => <tr key={event.path}><th>{event.path}</th><td>{safeHex(event.value)}</td></tr>)}</tbody>
    </table>
  </section>
  return <section role="alert">
    <h3>{text.title}</h3>
    <table>
      <caption>{text.comparisonSummary}</caption>
      <thead><tr><th>{text.path}</th><th>{text.baseline}</th><th>{text.changed}</th><th>{text.mask}</th></tr></thead>
      <tbody>{comparison.checkpoints.map((checkpoint) => checkpoint.complete
        ? <tr key={checkpoint.path}>
            <th>{checkpoint.path}</th><td>{safeHex(checkpoint.left)}</td><td>{safeHex(checkpoint.right)}</td><td>{safeHex(checkpoint.mask)}</td>
          </tr>
        : <tr key={checkpoint.path}><th>{checkpoint.path}</th><td colSpan={3}>{text.gap}</td></tr>)}</tbody>
    </table>
  </section>
}

class IsolatedRenderer extends React.Component<Pick<RenderHostProps, 'comparison' | 'execution' | 'locale'> & { readonly children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render(): React.ReactNode {
    if (this.state.failed) return <Fallback comparison={this.props.comparison} execution={this.props.execution} locale={this.props.locale} />
    return this.props.children
  }
}

export const RenderHost: React.FC<RenderHostProps> = (props) =>
  <IsolatedRenderer comparison={props.comparison} execution={props.execution} key={props.executionIdentity} locale={props.locale}>
      {props.invocation.id === 'avalanche@1' && props.comparison
        ? <AvalancheRenderer
            comparison={props.comparison}
            dimensions={props.dimensions}
            executionIdentity={props.executionIdentity}
            locale={props.locale}
            reducedMotion={props.reducedMotion}
          />
        : props.invocation.id === 'teaching-spn@1' && props.execution
          ? <TeachingSpnRenderer
              dimensions={props.dimensions}
              execution={props.execution}
              executionIdentity={props.executionIdentity}
              locale={props.locale}
            />
          : <Fallback comparison={props.comparison} execution={props.execution} locale={props.locale} />}
  </IsolatedRenderer>
