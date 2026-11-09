import { readFileSync } from 'node:fs'
import { I18nextProvider } from 'react-i18next'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parse, stringify } from 'yaml'
import { dataAvalancheDocuments } from '../../demos/dataAvalancheLesson'
import { keyAvalancheLesson } from '../../demos/keyAvalancheLesson'
import aes128 from '../lesson_runtime/fixture/aes128-v2.yaml?raw'
import { aesKeyChangeLesson, firstAes192KeyChangeLesson } from '../../demos/keyChangeLesson'
import { i18n } from '../app'
import { executeWorkerRequest, type CryptoValue, type WorkerLimits, type WorkerRequest } from '../crypto_graph'
import { compileLesson, createBrowserLessonSession, type LessonDocuments } from '../lesson_runtime'
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
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const aes192 = readFileSync('src/lesson_runtime/fixture/aes192-v2.yaml', 'utf8')
const cipherDocuments = (): LessonDocuments => firstAes192KeyChangeLesson(aes192, 'encrypt')

const realCipher = async (documents = cipherDocuments()): Promise<RenderHostProps> => {
  class LocalWorker extends EventTarget {
    postMessage(request: WorkerRequest): void {
      queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: executeWorkerRequest(request) })))
    }
    terminate(): void {}
  }
  vi.stubGlobal('Worker', LocalWorker)
  const created = createBrowserLessonSession(documents, 'en-US', i18n.getFixedT('en-US', 'translations'), visualizerCatalog)
  if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
  const session = created.value
  try {
    expect((await session.next()).ok).toBe(true)
    expect((await session.next()).ok).toBe(true)
    const step = session.lesson.steps[2]
    const schedule = session.lesson.steps[1]
    const comparison = session.state().comparisons['compare-cipher']
    const pairedSchedule = session.state().comparisons['compare-key']
    return {
      comparison, invocation: step.visualizer, compiledGraph: session.lesson.graphs[step.visualizer!.compare!.graph],
      presentation: step.presentation, executionIdentity: 'paired-cipher', dimensions: { width: 1200, height: 800 }, reducedMotion: true,
      overlay: step.overlay ? {
        anchors: step.overlay!.anchors, graph: session.lesson.graphs.schedule,
        execution: pairedSchedule.executions.baseline, comparison: pairedSchedule, presentation: schedule.presentation,
        avalancheSources: schedule.visualizer!.compare!.sources,
      } : undefined,
    }
  } finally { session.dispose() }
}

// Retain two real inverse rounds and the complete shared first-generation schedule.
const reversedCipherDocuments = (): LessonDocuments => {
  const documents = firstAes192KeyChangeLesson(aes192, 'decrypt')
  const lesson = parse(documents.lesson)
  const graph = lesson.graphs.decrypt
  const retained = new Set(['ciphertext', 'round-key-2', 'cipher-2-add-round-key', 'cipher-2-inv-mix-columns', 'cipher-1-inv-shift-rows', 'cipher-1-inv-sub-bytes', 'round-key-1', 'cipher-1-add-round-key'])
  graph.nodes = graph.nodes.filter((node: { id: string }) => retained.has(node.id))
  graph.nodes.find((node: { id: string }) => node.id === 'ciphertext').round = 2
  graph.nodes.find((node: { id: string }) => node.id === 'cipher-2-add-round-key').inputs.left = { node: 'ciphertext', port: 'value' }
  graph.outputs = [{ node: 'cipher-1-add-round-key', port: 'value' }]
  lesson.steps[2].visualizer.compare.bindings = Object.fromEntries(Object.entries(lesson.steps[2].visualizer.compare.bindings).filter(([id]) => retained.has(id)))
  return { ...documents, lesson: stringify(lesson) }
}

describe('Real key-change cipher overlays (#144)', () => {
  it.each([true, false, undefined])('initializes only a retained visible original-key identity with overlay %s, never a derived substitute', async (overlay) => {
    const base = parse(aes128)
    base.graphs.schedule.nodes = base.graphs.schedule.nodes.slice(0, 7)
    base.graphs.schedule.outputs = base.graphs.schedule.outputs.slice(0, 2)
    base.graphs.cipher.nodes = base.graphs.cipher.nodes.slice(0, 8)
    base.graphs.cipher.outputs = [{ node: 'add-round-key-1', port: 'value' }]
    const documents = aesKeyChangeLesson({ lesson: stringify(base), locales: {} }, 128, 'encrypt')
    const lesson = parse(documents.lesson)
    const schedule = lesson.graphs.schedule
    schedule.nodes = schedule.nodes.filter((node: { id: string }) => node.id !== 'round-key-0')
    schedule.nodes[0].role = 'round-key'
    schedule.nodes[0].round = 0
    for (const node of schedule.nodes) for (const input of Object.values(node.inputs ?? {}) as { node: string }[]) {
      if (input.node === 'round-key-0') input.node = 'key'
    }
    schedule.outputs[0].node = 'key'
    lesson.steps[2].visualizer.compare.bindings['round-key-0'].output = 'key.value'
    if (overlay === undefined) delete lesson.steps[2].presentation.overlay
    else lesson.steps[2].presentation.overlay = overlay
    const props = await realCipher({ ...documents, lesson: stringify(lesson) })
    const language = i18n.cloneInstance({ lng: 'en-US' })
    const view = render(<I18nextProvider i18n={language}><RenderHost {...props} /></I18nextProvider>)
    expect(view.container.querySelector('[data-row-id="round-key-0.value"] button[data-different]')).toHaveAttribute('aria-pressed', 'true')
    expect(view.container.querySelector('[data-lane-row]')).toBeNull()
    if (!overlay) expect(view.queryByRole('button', { name: 'Show key schedule' })).toBeNull()
    const comparison = { ...props.comparison!, checkpoints: props.comparison!.checkpoints.filter(({ path }) => path !== 'round-key-0.value') }
    view.rerender(<I18nextProvider i18n={language}><RenderHost {...props} comparison={comparison} executionIdentity="original-not-retained" /></I18nextProvider>)
    expect(view.container.querySelectorAll('button[data-different][aria-pressed="true"]')).toHaveLength(0)
    expect(view.container.querySelector('[data-row-id="round-key-1.value"] button[data-different]')).not.toBeNull()
  }, 15_000)

  it('opens the complete paired schedule through the shared overlay controls', async () => {
    const props = await realCipher()
    const before = structuredClone(props.comparison)
    const view = render(<I18nextProvider i18n={i18n.cloneInstance({ lng: 'en-US' })}><RenderHost {...props} /></I18nextProvider>)
    expect(view.getByRole('combobox')).toHaveValue('1')
    expect(view.container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(0)
    expect(view.container.querySelector('[data-lane-row]')).toBeNull()
    await userEvent.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Show key schedule' }))
    expect([...view.container.querySelectorAll('[data-lane-row]')].map((row) => row.getAttribute('data-lane-row'))).toEqual([
      'schedule:key.value', 'schedule:round-key-0.value', 'schedule:rot-0.value', 'schedule:sub-0.value',
      'schedule:rcon-0.value', 'schedule:batch-0.value', 'schedule:round-key-1.value', 'schedule:round-key-2.value',
    ])
    expect(view.container.querySelector('[data-lane-row="schedule:key.value"] button')).toHaveTextContent('0|1')
    expect(props.comparison).toEqual(before)
  })

  it('reverses AES-192 consumption blocks without duplicating a shared batch or changing source metadata', async () => {
    const props = await realCipher(reversedCipherDocuments())
    const before = structuredClone(props.overlay!.comparison)
    const view = render(<I18nextProvider i18n={i18n.cloneInstance({ lng: 'en-US' })}><RenderHost {...props} /></I18nextProvider>)
    await userEvent.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Show key schedule' }))
    expect([...view.container.querySelectorAll('[data-lane-row]')].map((row) => row.getAttribute('data-lane-row'))).toEqual([
      'schedule:round-key-2.value', 'schedule:rot-0.value', 'schedule:sub-0.value', 'schedule:rcon-0.value',
      'schedule:batch-0.value', 'schedule:round-key-1.value', 'schedule:key.value', 'schedule:round-key-0.value',
    ])
    for (const round of [2, 1]) expect(view.container.querySelector(`[data-row-id="cipher-${round}-add-round-key.value"] [data-lane-row="schedule:round-key-${round}.value"]`)).not.toBeNull()
    expect(props.overlay!.comparison!.checkpoints.find(({ path }) => path === 'batch-0.value')).toMatchObject({ iteration: 0, unit: 32 })
    await userEvent.click(view.container.querySelector('details summary')!)
    const original = view.getByRole('table', { name: 'Original generation order' })
    expect([...original.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-row-id'))).toEqual([
      'key.value', 'round-key-0.value', 'rot-0.value', 'sub-0.value', 'rcon-0.value', 'batch-0.value', 'round-key-1.value', 'round-key-2.value',
    ])
    expect(original.querySelector('[data-row-id="key.value"]')).toHaveTextContent('0.005208333333333333')
    expect(props.overlay!.comparison).toEqual(before)
  })

  it('keeps grouped inspection view-local through both toggles, locale, resize and replacement', async () => {
    const props = await realCipher()
    const language = i18n.cloneInstance({ lng: 'en-US' })
    const view = render(<I18nextProvider i18n={language}><RenderHost {...props} /></I18nextProvider>)
    const user = userEvent.setup()
    const units = (selector: string) => [...view.container.querySelectorAll<HTMLButtonElement>(`${selector} button[data-different]`)]
    const row = (id: string) => `[data-row-id="${id}.value"]`
    const lane = (id: string) => `[data-lane-row="schedule:${id}.value"]`
    const selected = () => view.container.querySelectorAll('button[data-different][aria-pressed="true"]')
    const toolbar = within(view.getByRole('toolbar'))
    const cipherSize = view.getByRole('combobox')
    await user.selectOptions(cipherSize, '8')
    const unchanged = units(row('round-key-1'))[0]
    unchanged.focus()
    await user.keyboard('{Enter}')
    expect(unchanged).toHaveAttribute('aria-pressed', 'true')
    expect(unchanged).toHaveAccessibleName(/Baseline result: 0x10; Changed result: 0x10; Deliberately selected/)
    expect(units(row('add-round-key-1')).filter((button) => button.dataset.state?.startsWith('related'))).toHaveLength(1)
    expect(units(row('add-round-key-0'))[0]).toHaveAttribute('data-state', 'changed')
    expect(units(row('add-round-key-0'))[0].querySelector('u')).not.toBeNull()
    await user.click(toolbar.getByRole('button', { name: 'Show key schedule' }))
    expect(selected()).toHaveLength(0)
    const scheduleSize = view.getByRole('combobox', { name: 'Key schedule overlay: Selection unit' })
    await user.selectOptions(scheduleSize, '32')
    await user.click(units(lane('key'))[0])
    expect(selected()).toHaveLength(1)
    const bound = () => within(view.container.querySelector(row('round-key-0')) as HTMLElement)
    await user.click(bound().getByRole('button', { name: 'Close key schedule' }))
    expect(selected()).toHaveLength(0)
    expect(cipherSize).toHaveValue('8')
    await user.click(bound().getByRole('button', { name: 'Show key schedule' }))
    expect(selected()).toHaveLength(0)
    expect(view.getByRole('combobox', { name: 'Key schedule overlay: Selection unit' })).toHaveValue('32')
    await user.selectOptions(view.getAllByRole('combobox')[1], '8')
    const origin = units(lane('round-key-1'))[8]
    origin.focus()
    await user.keyboard(' ')
    expect(origin).toHaveAttribute('aria-pressed', 'true')
    // The selected derived byte depends on original bytes 0 and 21, not their other descendants.
    expect(units(lane('key')).flatMap((button, index) => button.dataset.state?.startsWith('related') ? [index] : [])).toEqual([0, 21])
    expect(units(lane('round-key-1'))[12]).toHaveAttribute('data-state', 'changed')
    expect(units(lane('round-key-1'))[12].querySelector('u')).not.toBeNull()
    expect(view.container.querySelector('[data-row-id="add-round-key-1.value"] > td:not([data-lane-cell]) button[data-different]')).toBeNull()
    fireEvent.change(view.getAllByRole('combobox')[1], { target: { value: '8' } })
    await act(() => language.changeLanguage('zh-CN'))
    view.rerender(<I18nextProvider i18n={language}><RenderHost {...props} dimensions={{ width: 390, height: 844 }} /></I18nextProvider>)
    expect(origin).toHaveAttribute('aria-pressed', 'true')
    expect(origin).toHaveAccessibleName(/基准结果: 0x58; 改变后结果: 0xd8/)
    expect(view.getByRole('table', { name: '比较摘要' })).toBeVisible()
    await user.selectOptions(view.getAllByRole('combobox')[1], '32')
    expect(selected()).toHaveLength(0)
    await user.click(within(view.getByRole('toolbar')).getByRole('button', { name: '关闭密钥编排' }))
    await user.click(units(row('round-key-1'))[0])
    expect(selected()).toHaveLength(1)
    view.rerender(<I18nextProvider i18n={language}><RenderHost {...props} executionIdentity="replacement-cipher" /></I18nextProvider>)
    expect(view.getByRole('combobox')).toHaveValue('1')
    expect(view.container.querySelector('[data-lane-row]')).toBeNull()
    expect(selected()).toHaveLength(0)
    await user.click(within(view.getByRole('toolbar')).getByRole('button', { name: '显示密钥编排' }))
    expect(view.getAllByRole('combobox')[1]).toHaveValue('1')
    expect(selected()).toHaveLength(0)
  }, 30000)

  it('retains honest one-sided schedule gaps and complete measurements without lineage through missing rows', async () => {
    const props = await realCipher()
    const original = props.overlay!.comparison!.checkpoints.find(({ path }) => path === 'key.value')!
    if (!original.complete) throw new Error('Expected original-key pair')
    const response = executeWorkerRequest({ requestId: 'incomplete-overlay', kind: 'compare', payload: {
      left: { graph: props.overlay!.graph.graph, inputs: { 'key.value': original.left } },
      right: { graph: props.overlay!.graph.graph, inputs: { 'key.value': original.right }, limits: { traceEvents: 1 } },
    } })
    if (response.kind !== 'comparison') throw new Error(JSON.stringify(response))
    const overlay = { ...props.overlay!, execution: response.comparison.executions.baseline, comparison: response.comparison }
    const view = render(<I18nextProvider i18n={i18n.cloneInstance({ lng: 'en-US' })}><RenderHost {...props} overlay={overlay} /></I18nextProvider>)
    await userEvent.click(within(view.getByRole('toolbar')).getByRole('button', { name: 'Show key schedule' }))
    const gap = view.container.querySelector('[data-lane-row="schedule:round-key-1.value"]') as HTMLElement
    expect(gap.querySelector('button')).toBeNull()
    expect(gap.closest('tr')).toHaveTextContent('Trace gap')
    expect(view.container.querySelector('svg[data-lineage] path')).toBeNull()
    await userEvent.click(view.container.querySelector('details summary')!)
    const originalOrder = view.getByRole('table', { name: 'Original generation order' })
    const cells = (id: string) => within(originalOrder.querySelector(`[data-row-id="${id}.value"]`) as HTMLElement).getAllByRole('cell').map((cell) => cell.textContent)
    expect(cells('key').slice(-2)).toEqual(['1', '0.005208333333333333'])
    expect(cells('round-key-1').slice(-2)).toEqual(['Trace gap', '—'])
    expect(cells('round-key-1')[1]).toContain('0x10111213141516175846f2f95c43f4fe | —')
  })

})

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
      '4', '0.03125',
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
      '0xd6aa74fdd2af72fadaa678f1d6ab76fe', '—', 'Trace gap', '—',
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
