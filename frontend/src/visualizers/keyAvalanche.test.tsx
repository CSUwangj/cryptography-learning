import { I18nextProvider } from 'react-i18next'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import { dataAvalancheDocuments } from '../../demos/dataAvalancheLesson'
import { keyAvalancheLesson } from '../../demos/keyAvalancheLesson'
import aes128 from '../lesson_runtime/fixture/aes128-v2.yaml?raw'
import { i18n } from '../app'
import { executeWorkerRequest, type CryptoValue, type WorkerLimits } from '../crypto_graph'
import { compileLesson } from '../lesson_runtime'
import { RenderHost, visualizerCatalog, type RenderHostProps } from './index'

const realSchedule = (rightLimits: WorkerLimits = { traceEvents: 7 }, bit = 0): RenderHostProps => {
  const documents = keyAvalancheLesson({ lesson: aes128, locales: {} })
  const source = parse(documents.lesson)
  source.inputs['changed-key'].default = bit === 0
    ? '0x800102030405060708090a0b0c0d0e0f' : '0x400102030405060708090a0b0c0d0e0f'
  const compiled = compileLesson({ ...documents, lesson: stringify(source) }, visualizerCatalog)
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
  const lesson = compiled.value
  const graph = lesson.graphs.schedule
  const step = lesson.steps[1]
  const response = executeWorkerRequest({ requestId: 'standalone', kind: 'compare', payload: {
    left: { graph: graph.graph, inputs: { 'key.value': lesson.inputs.key.default }, limits: { traceEvents: 7 } },
    right: { graph: graph.graph, inputs: { 'key.value': lesson.inputs['changed-key'].default }, limits: rightLimits },
  } })
  if (response.kind !== 'comparison') throw new Error(JSON.stringify(response))
  return { comparison: response.comparison, compiledGraph: graph, presentation: step.presentation, invocation: step.visualizer,
    executionIdentity: 'standalone', dimensions: { width: 390, height: 844 }, reducedMotion: true }
}
afterEach(cleanup)

describe('Real standalone schedule rendering (#143)', () => {
  it('shows actual paired keys and full-width measurements at the retained original source', () => {
    const props = realSchedule()
    const before = structuredClone(props.comparison)
    const view = render(<I18nextProvider i18n={i18n.cloneInstance({ lng: 'en-US' })}><RenderHost {...props} /></I18nextProvider>)
    const row = (id: string) => view.container.querySelector(`[data-row-id="${id}.value"]`) as HTMLElement
    const buttons = (id: string) => [...row(id).querySelectorAll('button')]
    expect(view.getByRole('combobox')).toHaveValue('1')
    expect(buttons('key')[0]).toHaveAttribute('aria-pressed', 'true')
    expect(buttons('key')[0]).toHaveTextContent('0|1')
    expect(buttons('key')[0].querySelector('u')).not.toBeNull()
    expect(row('round-key-1')).toHaveTextContent('0xd6aa74fdd2af72fadaa678f1d6ab76fe | 0x56aa74fd52af72fa5aa678f156ab76fe')
    const summary = view.getByRole('table', { name: 'Comparison summary' })
    const measured = summary.querySelector('[data-row-id="round-key-1.value"]') as HTMLElement
    expect(within(measured).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      '0xd6aa74fdd2af72fadaa678f1d6ab76fe', '0x56aa74fd52af72fa5aa678f156ab76fe',
      '0x80000000800000008000000080000000', '4', '0.03125',
    ])
    expect(props.comparison).toEqual(before)
  })

  it('seeds exact grouped lineage without adding ancestor descendants or hiding unrelated differences', async () => {
    const props = realSchedule()
    const user = userEvent.setup()
    const view = render(<I18nextProvider i18n={i18n.cloneInstance({ lng: 'en-US' })}><RenderHost {...props} /></I18nextProvider>)
    const row = (id: string) => view.container.querySelector(`[data-row-id="${id}.value"]`) as HTMLElement
    const buttons = (id: string) => [...row(id).querySelectorAll('button')]
    await user.selectOptions(view.getByRole('combobox'), '8')
    expect(view.container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(0)
    const origin = buttons('round-key-1')[0]
    origin.focus()
    await user.keyboard('{Enter}')
    expect(origin).toHaveAttribute('aria-pressed', 'true')
    expect(origin.querySelector('u')).toHaveTextContent('0xd6|0x56')
    // A selected output byte depends on key bytes 0 and 13. Their other descendants are not origins.
    expect(buttons('key').flatMap((button, index) => button.dataset.state?.startsWith('related') ? [index] : [])).toEqual([0, 13])
    expect(buttons('round-key-1')[4]).toHaveAttribute('data-state', 'changed')
    expect(buttons('round-key-1')[4].querySelector('u')).not.toBeNull()
    expect(view.getByRole('table', { name: 'Comparison summary' }).querySelector('[data-row-id="round-key-1.value"]')).toHaveTextContent('0.03125')
    const unchanged = buttons('key')[2]
    await user.click(unchanged)
    expect(unchanged).toHaveAttribute('aria-pressed', 'true')
    expect(unchanged.querySelector('u')).toBeNull()
    expect(origin).toHaveAttribute('aria-pressed', 'false')
    expect(view.container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(1)
  })

  it('preserves inspection across locale, resize and active-size reselect, then resets replacement to the original key bit', async () => {
    const props = realSchedule()
    const language = i18n.cloneInstance({ lng: 'en-US' })
    const view = render(<I18nextProvider i18n={language}><RenderHost {...props} /></I18nextProvider>)
    const user = userEvent.setup()
    await user.selectOptions(view.getByRole('combobox'), '8')
    const origin = view.container.querySelector('[data-row-id="key.value"] button:nth-of-type(3)') as HTMLButtonElement
    origin.focus()
    await user.keyboard(' ')
    expect(origin).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(view.getByRole('combobox'), { target: { value: '8' } })
    expect(origin).toHaveAttribute('aria-pressed', 'true')
    await act(() => language.changeLanguage('zh-CN'))
    view.rerender(<I18nextProvider i18n={language}><RenderHost {...props} dimensions={{ width: 1200, height: 800 }} /></I18nextProvider>)
    expect(origin).toHaveAttribute('aria-pressed', 'true')
    expect(view.getByRole('table', { name: '比较摘要' })).toHaveTextContent('0.03125')
    const replacement = realSchedule({ traceEvents: 7 }, 1)
    view.rerender(<I18nextProvider i18n={language}><RenderHost {...replacement} executionIdentity="replacement-key" /></I18nextProvider>)
    expect(view.getByRole('combobox')).toHaveValue('1')
    const source = view.container.querySelector('[data-row-id="key.value"]') as HTMLElement
    expect(source.querySelectorAll('button')[1]).toHaveAttribute('aria-pressed', 'true')
    expect(view.container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(1)
  })

  it('retains raw gaps without measurements or endpoints and never substitutes a derived key for an absent source', async () => {
    const props = realSchedule({ traceEvents: 1 })
    const language = i18n.cloneInstance({ lng: 'en-US' })
    const view = render(<I18nextProvider i18n={language}><RenderHost {...props} /></I18nextProvider>)
    const gap = view.container.querySelector('[data-row-id="round-key-1.value"]') as HTMLElement
    expect(gap).toHaveTextContent('0xd6aa74fdd2af72fadaa678f1d6ab76fe | —; Trace gap')
    expect(gap.querySelector('button')).toBeNull()
    expect(view.container.querySelector('svg[data-lineage] path')).toBeNull()
    const summary = view.getByRole('table', { name: 'Comparison summary' })
    expect(within(summary.querySelector('[data-row-id="round-key-1.value"]') as HTMLElement).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      '0xd6aa74fdd2af72fadaa678f1d6ab76fe', '—', 'Trace gap', '—', '—',
    ])
    expect(summary.querySelector('[data-row-id="key.value"]')).toHaveTextContent('0.0078125')
    // Retention projection of a real pair: derived keys remain, but neither source row is available.
    const retained = realSchedule()
    const comparison = { ...retained.comparison!, checkpoints: retained.comparison!.checkpoints.filter(({ path }) => path !== 'key.value') }
    view.rerender(<I18nextProvider i18n={language}><RenderHost {...retained} comparison={comparison} executionIdentity="source-not-retained" /></I18nextProvider>)
    expect(view.container.querySelector('[data-row-id="key.value"]')).toBeNull()
    expect(view.container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(0)
    expect(view.container.querySelector('[data-row-id="round-key-1.value"] button[data-different="true"]')).not.toBeNull()
    const oneSided = realSchedule({ traceBytes: 1 })
    view.rerender(<I18nextProvider i18n={language}><RenderHost {...oneSided} executionIdentity="one-sided-source" /></I18nextProvider>)
    expect(view.container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(0)
    expect(view.container.querySelector('[data-row-id="key.value"]')).toHaveTextContent('Trace gap')
  })

  it('keeps separate data and key Step origins when only the key result is replaced', () => {
    const compiled = compileLesson(dataAvalancheDocuments, visualizerCatalog)
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
    const lesson = compiled.value
    const step = lesson.steps[1]
    const compare = step.visualizer!.compare!
    const graph = lesson.graphs[compare.graph]
    const inputs = (side: 'baseline' | 'changed'): Record<string, CryptoValue> => Object.fromEntries(Object.entries(compare.bindings).map(([node, binding]) => {
      const reference = binding[side]
      if ('step' in reference) throw new Error('Expected fixed input references')
      return [`${node}.value`, 'input' in reference ? lesson.inputs[reference.input].default : lesson.constants[reference.constant]]
    }))
    const response = executeWorkerRequest({ requestId: 'independent-data', kind: 'compare', payload: {
      left: { graph: graph.graph, inputs: inputs('baseline') }, right: { graph: graph.graph, inputs: inputs('changed') },
    } })
    if (response.kind !== 'comparison') throw new Error(JSON.stringify(response))
    const data: RenderHostProps = { comparison: response.comparison, compiledGraph: graph, invocation: step.visualizer,
      executionIdentity: 'data-step', dimensions: { width: 390, height: 844 }, reducedMotion: true }
    const language = i18n.cloneInstance({ lng: 'en-US' })
    const pair = (key: RenderHostProps) => <I18nextProvider i18n={language}>
      <div data-testid="data-step"><RenderHost {...data} /></div>
      <div data-testid="key-step"><RenderHost {...key} /></div>
    </I18nextProvider>
    const view = render(pair(realSchedule()))
    const dataView = view.getByTestId('data-step')
    const keyView = view.getByTestId('key-step')
    const origin = dataView.querySelectorAll('[data-row-id="other.value"] button')[7]
    fireEvent.click(origin)
    expect(origin).toHaveAttribute('aria-pressed', 'true')
    const keyOrigin = keyView.querySelectorAll('[data-row-id="key.value"] button')[2]
    fireEvent.click(keyOrigin)
    expect(keyOrigin).toHaveAttribute('aria-pressed', 'true')
    expect(origin).toHaveAttribute('aria-pressed', 'true')
    view.rerender(pair({ ...realSchedule({ traceEvents: 7 }, 1), executionIdentity: 'replacement-key-step' }))
    expect(origin).toHaveAttribute('aria-pressed', 'true')
    expect(keyView.querySelectorAll('[data-row-id="key.value"] button')[1]).toHaveAttribute('aria-pressed', 'true')
    expect(dataView.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(1)
    expect(keyView.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(1)
  })

})
