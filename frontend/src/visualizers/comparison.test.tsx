import { I18nextProvider } from 'react-i18next'
import { cleanup, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { genericComparisonDocuments } from '../../demos/genericComparisonLesson'
import { dataAvalancheDocuments } from '../../demos/dataAvalancheLesson'
import i18n from '../app/i18n'
import { executeWorkerRequest, type CryptoValue, type WorkerLimits } from '../crypto_graph'
import { compileLesson, type LessonDocuments } from '../lesson_runtime'
import { RenderHost, visualizerCatalog, type RenderHostProps } from './index'

const realComparison = (limits?: WorkerLimits, documents: LessonDocuments = genericComparisonDocuments): RenderHostProps => {
  const compiled = compileLesson(documents, visualizerCatalog)
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
  const lesson = compiled.value
  const step = lesson.steps[1]
  const compare = step.visualizer!.compare!
  const inputs = (side: 'baseline' | 'changed'): Record<string, CryptoValue> => Object.fromEntries(Object.entries(compare.bindings).map(([node, binding]) => {
    const reference = binding[side]
    if ('step' in reference) throw new Error('Expected a Lesson input or constant')
    return [`${node}.value`, 'input' in reference ? lesson.inputs[reference.input].default : lesson.constants[reference.constant]]
  }))
  const graph = lesson.graphs[compare.graph]
  const response = executeWorkerRequest({ requestId: 'render-pair', kind: 'compare', payload: {
    left: { graph: graph.graph, inputs: inputs('baseline') },
    right: { graph: graph.graph, inputs: inputs('changed'), limits },
  } })
  if (response.kind !== 'comparison') throw new Error(JSON.stringify(response))
  return { comparison: response.comparison, compiledGraph: graph, presentation: step.presentation, invocation: step.visualizer,
    executionIdentity: 'real-pair', dimensions: { width: 390, height: 844 }, reducedMotion: true }
}
afterEach(cleanup)

describe('Real v2 RenderHost comparison (#141)', () => {
  it('renders inline pairs and complete measurements while grouped lineage keeps one exact origin', async () => {
    const props = realComparison()
    const before = structuredClone(props.comparison)
    const user = userEvent.setup()
    const view = render(<I18nextProvider i18n={i18n.cloneInstance({ lng: 'en-US' })}><RenderHost {...props} /></I18nextProvider>)
    const row = (id: string) => within(view.container.querySelector(`[data-row-id="${id}.value"]`) as HTMLElement)
    const mode = view.getByRole('combobox')
    expect(mode).toHaveValue('1')
    expect(view.container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(0)
    expect(row('data').getAllByRole('button')[4]).toHaveTextContent('1|0')
    expect(row('data').getAllByRole('button')[4].querySelector('u')).toHaveTextContent('1|0')
    const summary = view.getByRole('table', { name: 'Comparison summary' })
    expect(within(summary).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Stage', 'Baseline result', 'Changed result', 'Changed bits', 'Ratio'])
    expect(within(within(summary).getByRole('row', { name: /data.value/ })).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['0x0f0f', '0x00ff', '8', '0.5'])
    await user.selectOptions(mode, '2')
    const origin = row('substitute').getAllByRole('button')[0]
    origin.focus()
    await user.keyboard('{Enter}')
    expect(origin).toHaveAttribute('aria-pressed', 'true')
    expect(view.container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(1)
    // Two output bits share all four input-nibble ancestors; those ancestors do not seed other outputs.
    expect(row('mix').getAllByRole('button').filter((button) => button.dataset.state?.startsWith('related'))).toHaveLength(2)
    expect(row('result').getAllByRole('button')[0]).toHaveAttribute('data-state', 'related-changed')
    expect(row('result').getAllByRole('button')[1]).toHaveAttribute('data-state', 'changed')
    const unrelated = row('result').getAllByRole('button')[4]
    expect(unrelated).toHaveAttribute('data-state', 'changed')
    expect(unrelated.querySelector('u')).not.toBeNull()
    expect(origin.querySelector('u')).not.toBeNull()
    expect(within(within(summary).getByRole('row', { name: /data.value/ })).getAllByRole('cell').slice(2).map((cell) => cell.textContent)).toEqual(['8', '0.5'])
    await user.click(row('data').getAllByRole('button')[0])
    expect(origin).toHaveAttribute('aria-pressed', 'false')
    expect(row('data').getAllByRole('button')[0]).toHaveAttribute('aria-pressed', 'true')
    await user.selectOptions(mode, '8')
    expect(view.container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(0)
    expect(row('data').getAllByRole('button')[0]).toHaveTextContent('0x0f|0x00')
    expect(JSON.stringify(props.comparison)).toBe(JSON.stringify(before))
  })
  it('shows retained one-sided values and explicit gaps without measurements or lineage across missing endpoints', () => {
    const props = realComparison({ traceEvents: 3 })
    const view = render(<I18nextProvider i18n={i18n.cloneInstance({ lng: 'en-US' })}><RenderHost {...props} /></I18nextProvider>)
    expect(view.container.querySelector('[data-diagnostic-code="trace.incomplete"]')).toBeVisible()
    const row = view.container.querySelector('[data-row-id="substitute.value"]') as HTMLElement
    expect(row).toHaveTextContent('0xe7e7 | —; Trace gap')
    expect(within(row).queryAllByRole('button')).toHaveLength(0)
    const summary = view.getByRole('table', { name: 'Comparison summary' })
    expect(within(within(summary).getByRole('row', { name: /substitute.value/ })).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['0xe7e7', '—', 'Trace gap', '—'])
    expect(within(within(summary).getByRole('row', { name: /data.value/ })).getAllByRole('cell').slice(2).map((cell) => cell.textContent)).toEqual(['8', '0.5'])
    // Only the complete data/key-to-mix relationships survive; the gap rows have no endpoints.
    expect([...view.container.querySelectorAll('svg[data-lineage] path')].flatMap((path) => path.getAttribute('d')?.match(/M/g) ?? [])).toHaveLength(32)
  })

  it('starts a real data avalanche at its source bit, preserves inspection across locale/resize and replaces stale selection', async () => {
    const props = realComparison(undefined, dataAvalancheDocuments)
    const before = structuredClone(props.comparison)
    const language = i18n.cloneInstance({ lng: 'en-US' })
    const user = userEvent.setup()
    const view = render(<I18nextProvider i18n={language}><RenderHost {...props} /></I18nextProvider>)
    const row = (id: string) => within(view.container.querySelector(`[data-row-id="${id}.value"]`) as HTMLElement)
    expect(view.getByRole('combobox')).toHaveValue('1')
    expect(row('data').getAllByRole('button')[0]).toHaveAttribute('aria-pressed', 'true')
    expect(view.container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(1)
    const inspect = row('other').getAllByRole('button')[7]
    inspect.focus()
    await user.keyboard('{Enter}')
    expect(inspect).toHaveAttribute('aria-pressed', 'true')
    expect(row('result').getAllByRole('button')[1]).toHaveAttribute('data-state', 'changed')
    expect(row('result').getAllByRole('button')[1].querySelector('u')).not.toBeNull()
    const chinese = language.cloneInstance({ lng: 'zh-CN' })
    view.rerender(<I18nextProvider i18n={chinese}><RenderHost {...props} dimensions={{ width: 1100, height: 700 }} /></I18nextProvider>)
    expect(row('other').getAllByRole('button')[7]).toHaveAttribute('aria-pressed', 'true')
    const summary = view.getByRole('table', { name: '比较摘要' })
    expect(summary).toHaveTextContent('0x80')
    expect(within(summary).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['阶段', '基准结果', '改变后结果', '改变位数', '比例'])
    expect(JSON.stringify(props.comparison)).toBe(JSON.stringify(before))
    const replacement = realComparison(undefined, { ...dataAvalancheDocuments, lesson: dataAvalancheDocuments.lesson.replace('default: "0x80"', 'default: "0x40"') })
    view.rerender(<I18nextProvider i18n={chinese}><RenderHost {...replacement} executionIdentity="replacement" /></I18nextProvider>)
    expect(row('data').getAllByRole('button')[1]).toHaveAttribute('aria-pressed', 'true')
    expect(row('other').getAllByRole('button')[7]).toHaveAttribute('aria-pressed', 'false')
    expect(view.getByRole('combobox')).toHaveValue('1')
  })

  it('does not select a substitute when the changed original data source is not retained on both sides', () => {
    const documents = { ...dataAvalancheDocuments, lesson: dataAvalancheDocuments.lesson
      .replace('default: "0x80"', 'default: "0x00"')
      .replace('changed-other: {type: {family: bits, size: 8}, encoding: hex, default: "0x00"}', 'changed-other: {type: {family: bits, size: 8}, encoding: hex, default: "0x80"}') }
    const props = realComparison({ traceEvents: 1 }, documents)
    const view = render(<I18nextProvider i18n={i18n.cloneInstance({ lng: 'en-US' })}><RenderHost {...props} /></I18nextProvider>)
    expect(view.container.querySelector('[data-row-id="other.value"]')).toHaveTextContent('0x00 | —; Trace gap')
    expect(view.container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(0)
    const summary = view.getByRole('table', { name: 'Comparison summary' })
    expect(within(within(summary).getByRole('row', { name: /data.value/ })).getAllByRole('cell').slice(2).map((cell) => cell.textContent)).toEqual(['0', '0'])
  })

})
