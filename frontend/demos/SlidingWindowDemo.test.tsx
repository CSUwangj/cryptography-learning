import { I18nextProvider } from 'react-i18next'
import { cleanup, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'
import i18n from '../src/app/i18n'
import { executeWorkerRequest } from '../src/crypto_graph'
import { compileLesson } from '../src/lesson_runtime'
import { RenderHost } from '../src/visualizers'
import { slidingWindowDemoDocuments } from './slidingWindowLesson'

afterEach(cleanup)

const renderSchedule = (locale: string) => {
  const compiled = compileLesson(slidingWindowDemoDocuments)
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
  const result = executeWorkerRequest({ requestId: 'render', kind: 'execute', payload: {
    graph: compiled.value.graphs.schedule.graph, inputs: { 'key.value': compiled.value.inputs.key.default },
  } })
  if (result.kind !== 'snapshot') throw new Error(JSON.stringify(result))
  const user = userEvent.setup()
  const view = render(<I18nextProvider i18n={i18n.cloneInstance({ lng: locale })}><RenderHost
    execution={result.snapshot} compiledGraph={compiled.value.graphs.schedule} presentation={compiled.value.steps[0].presentation}
    lessonTexts={compiled.value.locales[locale].texts} executionIdentity="standalone"
    dimensions={{ width: 390, height: 844 }} reducedMotion
  /></I18nextProvider>)
  const row = (id: string) => within(view.container.querySelector(`[data-row-id="${id}.value"]`) as HTMLElement)
  const schedule = view.getByRole('region', { name: locale === 'zh-CN' ? '密钥编排' : 'Key schedule' })
  return { view, row, user, mode: within(schedule).getByRole('combobox') }
}

it.each(['en-US', 'zh-CN'])('shows the complete source and all four subkeys in %s', (locale) => {
  const { view, row, mode } = renderSchedule(locale)
  expect(within(mode).getAllByRole('option').map((option) => (option as HTMLOptionElement).value)).toEqual(['1', '2', '4', '8', '16'])
  expect(mode).toHaveValue('1')
  expect(row('key').getAllByRole('button')).toHaveLength(32)
  for (const [id, value] of [['rk1', '0x1234'], ['rk2', '0x2345'], ['rk3', '0x3456'], ['rk4', '0x4567']]) {
    expect(view.container.querySelector(`[data-row-id="${id}.value"]`)).toHaveTextContent(value)
    expect(row(id).getAllByRole('button')).toHaveLength(16)
  }
  expect(view.container.querySelector('details')).toBeNull()
})

for (const locale of ['en-US', 'zh-CN']) {
  it.each([
    ['1', [4]], ['4', [1]], ['8', [0, 1]],
  ] as const)(`keeps the selected %s-bit group's ancestors exact without reaching sibling subkeys in ${locale}`, async (size, expected) => {
    const { row, user, mode } = renderSchedule(locale)
    await user.selectOptions(mode, size)
    await user.click(row('rk2').getAllByRole('button')[0])
    expect(row('rk2').getAllByRole('button')[0]).toHaveAttribute('aria-pressed', 'true')
    expect(row('key').getAllByRole('button').flatMap((button, index) => button.dataset.state === 'related' ? [index] : [])).toEqual(expected)
    for (const id of ['rk1', 'rk3', 'rk4']) {
      expect(row(id).getAllByRole('button').filter((button) => button.dataset.state === 'related')).toHaveLength(0)
    }
    await user.selectOptions(mode, size)
    expect(row('rk2').getAllByRole('button')[0]).toHaveAttribute('aria-pressed', 'true')
  })
}

it('starts a new exact origin when deliberately selecting a related containing byte', async () => {
  const { row, user, mode } = renderSchedule('en-US')
  await user.selectOptions(mode, '8')
  await user.click(row('rk2').getAllByRole('button')[0])
  expect(row('rk2').getAllByRole('button').map((button) => button.textContent)).toEqual(['0x23', '0x45'])
  await user.click(row('key').getAllByRole('button')[0])
  for (const [id, expected] of [['rk1', [0]], ['rk2', [0]], ['rk3', []], ['rk4', []]] as const) {
    expect(row(id).getAllByRole('button').flatMap((button, index) => button.dataset.state === 'related' ? [index] : [])).toEqual(expected)
  }
})

it('clears selection on an actual size change and keeps unused trailing source bits selectable', async () => {
  const { view, row, user, mode } = renderSchedule('en-US')
  await user.selectOptions(mode, '8')
  await user.click(row('rk2').getAllByRole('button')[0])
  await user.selectOptions(mode, '1')
  expect(view.container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(0)
  await user.click(row('key').getAllByRole('button')[31])
  expect(row('key').getAllByRole('button')[31]).toHaveAttribute('aria-pressed', 'true')
  expect(view.container.querySelectorAll('button[data-state="related"]')).toHaveLength(0)
})
