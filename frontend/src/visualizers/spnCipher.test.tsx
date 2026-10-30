import React from 'react'
import { I18nextProvider } from 'react-i18next'
import { act, cleanup, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../app/i18n'
import { bits, executeWorkerRequest } from '../crypto_graph'
import { compileLesson } from '../lesson_runtime'
import lesson from '../lesson_runtime/fixture/teaching-spn-v2.yaml?raw'
import en from '../lesson_runtime/fixture/teaching-spn-v2-locales/en-US.yaml?raw'
import zh from '../lesson_runtime/fixture/teaching-spn-v2-locales/zh-CN.yaml?raw'
import aes192 from '../lesson_runtime/fixture/aes192-v2.yaml?raw'
import aes192En from '../lesson_runtime/fixture/aes192-v2-locales/en-US.yaml?raw'
import aes192Zh from '../lesson_runtime/fixture/aes192-v2-locales/zh-CN.yaml?raw'
import { RenderHost } from './index'

const teaching = (limits?: { traceEvents: number }) => {
  const compiled = compileLesson({ lesson, locales: { 'en-US': en, 'zh-CN': zh } })
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
  const result = executeWorkerRequest({ requestId: 'cipher', kind: 'execute', payload: {
    graph: compiled.value.graphs.cipher.graph,
    inputs: { 'state.value': compiled.value.inputs.state.default, 'key.value': compiled.value.constants.key },
    ...(limits ? { limits } : {}),
  } })
  if (result.kind !== 'snapshot') throw new Error(JSON.stringify(result))
  return {
    execution: result.snapshot, compiledGraph: compiled.value.graphs.cipher,
    presentation: compiled.value.steps[0].presentation, lessonTexts: compiled.value.locales['en-US'].texts,
    executionIdentity: 'cipher', dimensions: { width: 390, height: 844 }, reducedMotion: true,
  }
}

afterEach(cleanup)

describe('Compiled SPN cipher presentation (#107)', () => {
  it('renders actual Teaching SPN states in structural teaching order with exact bit controls', () => {
    const props = teaching()
    const before = JSON.stringify(props.execution)
    const view = render(<I18nextProvider i18n={i18n.cloneInstance({ lng: 'en-US' })}><RenderHost {...props} /></I18nextProvider>)
    expect(view.getByRole('heading', { name: 'SPN cipher' })).toBeVisible()
    expect([...view.container.querySelectorAll('[data-row-id]')].map((row) => row.getAttribute('data-row-id'))).toEqual([
      'state.value', 'key.value', 'mix.value', 'substitute.value', 'permute.value', 'result.value',
    ])
    expect([...view.container.querySelectorAll('[data-row-id]')].map((row) => row.querySelectorAll('td')[1].textContent)).toEqual([
      '0x1234', '0x0f0f', '0x1d3b', '0x491c', '0xc491', '0xc491',
    ])
    expect(view.container.querySelector('[data-row-id="result.value"]')?.querySelectorAll('button')).toHaveLength(16)
    expect(view.getByRole('rowheader', { name: 'Nibble substitution 1' })).toBeVisible()
    expect(JSON.stringify(props.execution)).toBe(before)
  })

  it.each(['en-US', 'zh-CN'] as const)('renders the real AES-192 cipher Step with FIPS-197 values and full-state controls in %s', (locale) => {
    const compiled = compileLesson({ lesson: aes192, locales: { 'en-US': aes192En, 'zh-CN': aes192Zh } })
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
    const schedule = executeWorkerRequest({ requestId: 'schedule', kind: 'execute', payload: {
      graph: compiled.value.graphs.schedule.graph, inputs: { 'key.value': compiled.value.inputs.key.default },
    } })
    if (schedule.kind !== 'snapshot') throw new Error(JSON.stringify(schedule))
    const cipher = executeWorkerRequest({ requestId: 'cipher', kind: 'execute', payload: {
      graph: compiled.value.graphs.cipher.graph, inputs: { ...schedule.snapshot.outputs, 'plaintext.value': compiled.value.inputs.plaintext.default },
    } })
    if (cipher.kind !== 'snapshot') throw new Error(JSON.stringify(cipher))
    const view = render(<I18nextProvider i18n={i18n.cloneInstance({ lng: locale })}><RenderHost
      execution={cipher.snapshot} compiledGraph={compiled.value.graphs.cipher}
      presentation={compiled.value.steps[1].presentation} executionIdentity="aes192"
      dimensions={{ width: 390, height: 844 }} reducedMotion
    /></I18nextProvider>)
    expect(view.getByRole('heading', { name: locale === 'en-US' ? 'AES-192 encryption' : 'AES-192 加密' })).toBeVisible()
    expect([...view.container.querySelectorAll('[data-row-id]')].slice(0, 8).map((row) => row.getAttribute('data-row-id'))).toEqual([
      'plaintext.value', 'round-key-0.value', 'add-round-key-0.value', 'sub-bytes-1.value',
      'shift-rows-1.value', 'mix-columns-1.value', 'round-key-1.value', 'add-round-key-1.value',
    ])
    const output = view.container.querySelector('[data-row-id="add-round-key-12.value"]')!
    expect(output).toHaveTextContent('0xdda97ca4864cdfe06eaf70a0ec0d7191')
    expect(output.querySelectorAll('button')).toHaveLength(128)
    expect(view.container.querySelectorAll('[data-lane-row]')).toHaveLength(0)
    cleanup()
  }, 60000)

  it('keeps partial cipher lineage exact until a whole unit is deliberately selected, independently of grouping', async () => {
    const user = userEvent.setup()
    const props = teaching()
    const language = i18n.cloneInstance({ lng: 'en-US' })
    const view = render(<I18nextProvider i18n={language}><RenderHost {...props} /></I18nextProvider>)
    const source = view.container.querySelector('[data-row-id="state.value"]') as HTMLElement
    const originMode = within(source).getByRole('combobox')
    expect(within(originMode).getAllByRole('option').map((option) => (option as HTMLOptionElement).value)).toEqual(['1', '2', '4', '8', '16'])
    await user.selectOptions(originMode, '16')
    await user.click(view.getByRole('button', { name: /^Nibble gather 1 \(permute.value\), Bit 5: 1/ }))
    const partial = within(source).getByRole('button')
    expect(partial).toHaveAttribute('aria-pressed', 'false')
    expect(partial).toHaveAttribute('data-state', 'related')
    expect(partial).toHaveTextContent('4/16')
    expect(partial).toHaveAttribute('title', expect.stringContaining('Related bits 4/16: 0, 1, 2, 3'))
    expect(source.querySelectorAll('[data-bit-group]')).toHaveLength(4)
    expect(view.container.querySelectorAll('[data-row-id="substitute.value"] button[data-state="related"]')).toHaveLength(1)
    expect(view.container.querySelector('[data-row-id="substitute.value"] button[data-state="related"]')).toHaveAccessibleName(/Bit 1: 1/)
    expect(view.container.querySelectorAll('[data-row-id="result.value"] button[data-state="related"]')).toHaveLength(1)
    await user.click(within(source).getByText('Lineage details'))
    expect(source.querySelector('details')).toHaveTextContent('Related bits 4/16: 0, 1, 2, 3')
    await user.click(partial)
    expect(partial).toHaveAttribute('aria-pressed', 'true')
    expect(partial).toHaveTextContent('16/16')
    expect(view.container.querySelectorAll('[data-row-id="substitute.value"] button[data-state="related"]')).toHaveLength(16)
    await act(async () => { await language.changeLanguage('zh-CN') })
    expect(view.getByRole('heading', { name: 'SPN 密码' })).toBeVisible()
    expect(view.getByRole('status')).toHaveTextContent('位 0–15')
    expect(within(source).getByRole('button')).toHaveAttribute('aria-pressed', 'true')
    await user.selectOptions(originMode, '2')
    expect(view.container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(0)
    expect(source.querySelectorAll('[data-bit-group]')).toHaveLength(4)
  })

  it('retains immutable actual values and omits lineage with missing endpoints after trace truncation', () => {
    const props = teaching({ traceEvents: 4 })
    const before = JSON.stringify(props.execution)
    expect(props.execution.traceStatus).toMatchObject({ truncated: true, retained: 4, dropped: 2 })
    const view = render(<I18nextProvider i18n={i18n.cloneInstance({ lng: 'en-US' })}><RenderHost {...props} /></I18nextProvider>)
    expect([...view.container.querySelectorAll('[data-row-id]')].map((row) => row.getAttribute('data-row-id'))).toEqual([
      'state.value', 'key.value', 'mix.value', 'substitute.value',
    ])
    expect(view.container.querySelector('[data-row-id="mix.value"]')).toHaveTextContent('0x1d3b')
    expect(view.container.querySelector('[data-row-id="substitute.value"]')).toHaveTextContent('0x491c')
    expect(view.container.querySelector('[data-diagnostic-code="trace.incomplete"]')).toBeVisible()
    // Sixteen two-input XOR bits and sixteen four-input substitution bits remain; gather/output endpoints are absent.
    expect([...view.container.querySelectorAll('svg[data-lineage] path')].flatMap((path) => path.getAttribute('d')?.match(/M/g) ?? [])).toHaveLength(96)
    expect(JSON.stringify(props.execution)).toBe(before)
  })

  it('clears selection and unit modes when a different actual execution replaces the cipher snapshot', async () => {
    const user = userEvent.setup()
    const props = teaching()
    const before = JSON.stringify(props.execution)
    const language = i18n.cloneInstance({ lng: 'en-US' })
    const view = render(<I18nextProvider i18n={language}><RenderHost {...props} /></I18nextProvider>)
    await user.selectOptions(view.getByRole('combobox', { name: 'Source 0 (state.value): Selection unit' }), '16')
    await user.click(view.getByRole('button', { name: /Source 0 \(state.value\), Bits 0–15/ }))
    expect(view.container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(1)
    const replacement = executeWorkerRequest({ requestId: 'replacement', kind: 'execute', payload: {
      graph: props.compiledGraph.graph,
      inputs: { 'state.value': bits(16, Uint8Array.of(0, 0)), 'key.value': bits(16, Uint8Array.of(15, 15)) },
    } })
    if (replacement.kind !== 'snapshot') throw new Error(JSON.stringify(replacement))
    view.rerender(<I18nextProvider i18n={language}><RenderHost {...props} execution={replacement.snapshot} executionIdentity="replacement" /></I18nextProvider>)
    expect(view.container.querySelector('[data-row-id="result.value"]')).toHaveTextContent('0x7e7e')
    expect(view.container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(0)
    expect(view.getByRole('combobox', { name: 'Source 0 (state.value): Selection unit' })).toHaveValue('1')
    expect(JSON.stringify(props.execution)).toBe(before)
  })
})
