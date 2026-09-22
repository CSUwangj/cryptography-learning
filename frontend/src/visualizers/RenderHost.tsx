import React from 'react'
import { hex, type AvalancheComparison } from 'crypto_graph'
import { AvalancheRenderer } from './Avalanche'

export type RenderHostProps = {
  readonly invocation: { readonly id: string }
  readonly comparison: AvalancheComparison
  readonly locale: string
  readonly dimensions: { readonly width: number; readonly height: number }
  readonly reducedMotion: boolean
  readonly executionIdentity: string
}

const fallbackCopy = {
  'en-US': { title: 'Visualizer unavailable', summary: 'Retained comparison data', path: 'Path', baseline: 'Baseline', changed: 'Changed', mask: 'Mask', gap: 'Incomplete trace gap' },
  'zh-CN': { title: '可视化工具不可用', summary: '保留的比较数据', path: '路径', baseline: '基准执行', changed: '改变后执行', mask: '掩码', gap: '不完整轨迹缺口' },
} as const

const safeHex = (value: unknown): string =>
  typeof value === 'object' && value !== null && 'type' in value && 'bytes' in value
    && (value as { bytes: unknown }).bytes instanceof Uint8Array
    ? hex(value as Parameters<typeof hex>[0])
    : '—'

const Fallback: React.FC<Pick<RenderHostProps, 'comparison' | 'locale'>> = ({ comparison, locale }) => {
  const text = fallbackCopy[locale as keyof typeof fallbackCopy] ?? fallbackCopy['en-US']
  return <section role="alert">
    <h3>{text.title}</h3>
    <table>
      <caption>{text.summary}</caption>
      <thead><tr><th>{text.path}</th><th>{text.baseline}</th><th>{text.changed}</th><th>{text.mask}</th></tr></thead>
      <tbody>{comparison.checkpoints.map((checkpoint) => checkpoint.complete
        ? <tr key={checkpoint.path}>
            <th>{checkpoint.path}</th><td>{safeHex(checkpoint.left)}</td><td>{safeHex(checkpoint.right)}</td><td>{safeHex(checkpoint.mask)}</td>
          </tr>
        : <tr key={checkpoint.path}><th>{checkpoint.path}</th><td colSpan={3}>{text.gap}</td></tr>)}</tbody>
    </table>
  </section>
}

class IsolatedRenderer extends React.Component<Pick<RenderHostProps, 'comparison' | 'locale'> & { readonly children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render(): React.ReactNode {
    if (this.state.failed) return <Fallback comparison={this.props.comparison} locale={this.props.locale} />
    return this.props.children
  }
}

export const RenderHost: React.FC<RenderHostProps> = (props) =>
  <IsolatedRenderer comparison={props.comparison} key={props.executionIdentity} locale={props.locale}>
      {props.invocation.id === 'avalanche@1'
        ? <AvalancheRenderer
            comparison={props.comparison}
            dimensions={props.dimensions}
            executionIdentity={props.executionIdentity}
            locale={props.locale}
            reducedMotion={props.reducedMotion}
          />
        : <Fallback comparison={props.comparison} locale={props.locale} />}
  </IsolatedRenderer>
