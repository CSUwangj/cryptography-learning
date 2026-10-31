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
import { relatedBitIds } from '../ui/learning'

const teaching = (limits?: { traceEvents: number }, source = lesson) => {
  const compiled = compileLesson({ lesson: source, locales: { 'en-US': en, 'zh-CN': zh } })
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
  it('retains authored two-bit boundaries across binary and hexadecimal selection units (PRE-SPEC-R1)', async () => {
    const props = teaching(undefined, lesson.replaceAll('unit: 4', 'unit: 2'))
    const user = userEvent.setup()
    const view = render(<I18nextProvider i18n={i18n.cloneInstance({ lng: 'en-US' })}><RenderHost {...props} /></I18nextProvider>)
    const source = view.container.querySelector('[data-row-id="state.value"]') as HTMLElement
    for (const size of ['1', '2', '4', '8', '16']) {
      await user.selectOptions(view.getByRole('combobox'), size)
      expect([...source.querySelectorAll('[data-bit-group]')].map((marker) => Number(marker.getAttribute('data-bit-group')))).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    }
  })

  it.each([{ group: 2, count: 36 }, { group: 3, count: 24 }])('retains authored $group-bit boundaries inside padded non-nibble units (PRE-SPEC-R1)', async ({ group, count }) => {
    const compiled = compileLesson({ lesson: `version: 2
id: boundary-padding
default_locale: en-US
inputs:
  key: {type: {family: bits, size: 72}, encoding: hex, default: '0x00000000000000000a'}
constants: {}
graphs:
  schedule:
    nodes:
      - {id: origin, operation: core.source@1, parameters: {type: {family: bits, size: 72}}, role: state, unit: ${group}}
      - {id: out, operation: core.output@1, inputs: {value: {node: origin, port: value}}, role: round-key, round: 0, unit: ${group}}
    outputs: [{node: out, port: value}]
steps:
  - id: inspect
    presentation: {kind: spn-cipher, mode: key-expansion}
    execute: {graph: schedule, bindings: {origin.value: {input: key}}}
`, locales: { 'en-US': en, 'zh-CN': zh } })
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
    const result = executeWorkerRequest({ requestId: 'boundaries', kind: 'execute', payload: {
      graph: compiled.value.graphs.schedule.graph, inputs: { 'origin.value': compiled.value.inputs.key.default },
    } })
    if (result.kind !== 'snapshot') throw new Error(JSON.stringify(result))
    const before = JSON.stringify(result.snapshot)
    const user = userEvent.setup()
    const view = render(<I18nextProvider i18n={i18n.cloneInstance({ lng: 'en-US' })}><RenderHost
      execution={result.snapshot} compiledGraph={compiled.value.graphs.schedule} presentation={compiled.value.steps[0].presentation}
      executionIdentity="boundaries" dimensions={{ width: 390, height: 844 }} reducedMotion
    /></I18nextProvider>)
    const source = view.container.querySelector('[data-row-id="origin.value"]') as HTMLElement
    for (const [size, value] of [['1', '0'], ['3', '010'], ['6', '0x0a'], ['9', '0x00a'], ['72', '0x00000000000000000a']] as const) {
      await user.selectOptions(view.getByRole('combobox'), size)
      expect([...source.querySelectorAll('[data-bit-group]')].map((marker) => Number(marker.getAttribute('data-bit-group')))).toEqual(Array.from({ length: count }, (_, index) => index))
      const unit = within(source).getAllByRole('button').at(-1)!
      expect(unit).toHaveTextContent(new RegExp(`^${value}$`))
      expect(unit).toHaveAccessibleName(`Source (origin.value), ${size === '1' ? 'Bit 71' : `Bits ${72 - Number(size)}–71`}: ${value}`)
      expect(unit.getAttribute('title')).toBe(unit.getAttribute('aria-label'))
      await user.click(unit)
      expect(view.getByRole('status')).toHaveTextContent(`: ${value}`)
      expect(view.container.querySelector('details')).toBeNull()
    }
    expect(JSON.stringify(result.snapshot)).toBe(before)
  })

  it('shows full-width hexadecimal unit values consistently while small units stay binary (#109)', async () => {
    const props = teaching()
    const result = executeWorkerRequest({ requestId: 'hex', kind: 'execute', payload: {
      graph: props.compiledGraph.graph,
      inputs: { 'state.value': bits(16, Uint8Array.of(0, 10)), 'key.value': bits(16, Uint8Array.of(15, 15)) },
    } })
    if (result.kind !== 'snapshot') throw new Error(JSON.stringify(result))
    const user = userEvent.setup()
    const view = render(<I18nextProvider i18n={i18n.cloneInstance({ lng: 'en-US' })}><RenderHost {...props} execution={result.snapshot} /></I18nextProvider>)
    const mode = view.getByRole('combobox', { name: 'SPN cipher: Selection unit' })
    const source = within(view.container.querySelector('[data-row-id="state.value"]') as HTMLElement)
    for (const [size, index, expected, range] of [
      ['8', 1, '0x0a', 'Bits 8–15'], ['16', 0, '0x000a', 'Bits 0–15'],
      ['4', 3, '0xa', 'Bits 12–15'], ['2', 7, '10', 'Bits 14–15'],
    ] as const) {
      await user.selectOptions(mode, size)
      const unit = source.getAllByRole('button')[index]
      expect(unit).toHaveTextContent(new RegExp(`^${expected}$`))
      expect(unit).toHaveAccessibleName(`Source 0 (state.value), ${range}: ${expected}`)
      expect(unit).toHaveAttribute('title', `Source 0 (state.value), ${range}: ${expected}`)
      await user.click(unit)
      expect(view.getByRole('status')).toHaveTextContent(`${range}: ${expected}`)
    }
  })

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

  it('inspects complete groups without bit details while traversal remains exact (#109)', async () => {
    const user = userEvent.setup()
    const props = teaching()
    const language = i18n.cloneInstance({ lng: 'en-US' })
    const view = render(<I18nextProvider i18n={language}><RenderHost {...props} /></I18nextProvider>)
    const source = view.container.querySelector('[data-row-id="state.value"]') as HTMLElement
    const exact = relatedBitIds({ title: 'Compiled Teaching SPN', sections: [{ kind: 'trace', caption: 'Dependency graph', headers: [], rows: [{
      id: 'graph', label: 'Graph', cells: [], relationships: props.compiledGraph.lineage!.map((edge) => ({ from: `${edge.source}#${edge.sourceBit}`, to: `${edge.target}#${edge.targetBit}` })),
    }] }] }, Array.from({ length: 8 }, (_, bit) => `permute.value#${bit}`))
    expect([...exact].filter((id) => id.startsWith('state.value#')).sort()).toEqual([
      'state.value#0', 'state.value#1', 'state.value#12', 'state.value#13', 'state.value#14', 'state.value#15', 'state.value#2', 'state.value#3',
    ])
    expect([...exact].filter((id) => id.startsWith('result.value#')).sort()).toEqual(Array.from({ length: 8 }, (_, bit) => `result.value#${bit}`))
    const originMode = view.getByRole('combobox', { name: 'SPN cipher: Selection unit' })
    expect(within(originMode).getAllByRole('option').map((option) => (option as HTMLOptionElement).value)).toEqual(['1', '2', '4', '8', '16'])
    // Gather [3,0,1,2] maps the first output byte to source nibbles 3 and 0.
    await user.selectOptions(originMode, '8')
    await user.click(view.getByRole('button', { name: /^Nibble gather 1 \(permute.value\), Bits 0–7: 0xc4/ }))
    const partial = within(source).getAllByRole('button')[0]
    expect(partial).toHaveAttribute('aria-pressed', 'false')
    expect(partial).toHaveAttribute('data-state', 'related')
    expect(partial).toHaveTextContent(/^0x12$/)
    expect(partial).toHaveAttribute('title', 'Source 0 (state.value), Bits 0–7: 0x12; Related group')
    expect(view.container.querySelector('details')).toBeNull()
    expect(source.textContent).not.toMatch(/\d+\/\d+|0, 1, 2, 3/)
    expect(within(source).getAllByRole('button')[1]).toHaveAccessibleName('Source 0 (state.value), Bits 8–15: 0x34; Related group')
    expect(source.querySelectorAll('[data-bit-group]')).toHaveLength(4)
    expect(view.container.querySelectorAll('[data-row-id="substitute.value"] button[data-state="related"]')).toHaveLength(2)
    expect(view.container.querySelector('[data-row-id="substitute.value"] button[data-state="related"]')).toHaveAccessibleName(/Bits 0–7: 0x49; Related group$/)
    expect(view.container.querySelectorAll('[data-row-id="result.value"] button[data-state="related"]')).toHaveLength(1)
    await user.click(partial)
    expect(partial).toHaveAttribute('aria-pressed', 'true')
    expect(partial).toHaveTextContent(/^0x12$/)
    expect(view.container.querySelectorAll('[data-row-id="substitute.value"] button[data-state="related"]')).toHaveLength(1)
    expect(view.container.querySelector('[data-row-id="substitute.value"] button[data-state="related"]')).toHaveTextContent(/^0x49$/)
    expect(view.container.querySelectorAll('[data-row-id="result.value"] button[data-state="related"]')).toHaveLength(2)
    await act(async () => { await language.changeLanguage('zh-CN') })
    expect(view.getByRole('heading', { name: 'SPN 密码' })).toBeVisible()
    expect(view.getByRole('status')).toHaveTextContent('位 0–7')
    expect(within(source).getAllByRole('button')[0]).toHaveAttribute('aria-pressed', 'true')
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
    await user.selectOptions(view.getByRole('combobox', { name: 'SPN cipher: Selection unit' }), '16')
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
    expect(view.getByRole('combobox', { name: 'SPN cipher: Selection unit' })).toHaveValue('1')
    expect(JSON.stringify(props.execution)).toBe(before)
  })
})
