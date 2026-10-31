import { I18nextProvider } from 'react-i18next'
import i18n from '../app/i18n'
import React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { executeWorkerRequest } from '../crypto_graph'
import { compileLesson } from '../lesson_runtime'
import aes192 from '../lesson_runtime/fixture/aes192-v2.yaml?raw'
import aes192En from '../lesson_runtime/fixture/aes192-v2-locales/en-US.yaml?raw'
import aes192Zh from '../lesson_runtime/fixture/aes192-v2-locales/zh-CN.yaml?raw'
import aes256 from '../lesson_runtime/fixture/aes256-v2.yaml?raw'
import aes256En from '../lesson_runtime/fixture/aes256-v2-locales/en-US.yaml?raw'
import aes256Zh from '../lesson_runtime/fixture/aes256-v2-locales/zh-CN.yaml?raw'
import { executionTracePresentation } from './ExecutionTrace'
import { RenderHost } from './index'
import { relatedBitIds } from '../ui/learning'

const fixtures = [
  { variant: 192, lesson: aes192, locales: { 'en-US': aes192En, 'zh-CN': aes192Zh }, finalBatch: 7, finalRound: 12, finalKey: '0xa4970a331a78dc09c418c271e3a41d5d', ciphertext: '0xdda97ca4864cdfe06eaf70a0ec0d7191' },
  { variant: 256, lesson: aes256, locales: { 'en-US': aes256En, 'zh-CN': aes256Zh }, finalBatch: 6, finalRound: 14, finalKey: '0x24fc79ccbf0979e9371ac23c6d68de36', ciphertext: '0x8ea2b7ca516745bfeafc49904b496089' },
] as const

describe('Authored AES v2 shared trace rendering (#105)', () => {
  it.each(fixtures)('renders AES-$variant full states and projected keys in both locales', (fixture) => {
    const compiled = compileLesson(fixture)
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
    const schedule = executeWorkerRequest({ requestId: 'schedule', kind: 'execute', payload: { graph: compiled.value.graphs.schedule.graph, inputs: { 'key.value': compiled.value.inputs.key.default } } })
    if (schedule.kind !== 'snapshot') throw new Error(JSON.stringify(schedule))
    const cipher = executeWorkerRequest({ requestId: 'cipher', kind: 'execute', payload: { graph: compiled.value.graphs.cipher.graph, inputs: { ...schedule.snapshot.outputs, 'plaintext.value': compiled.value.inputs.plaintext.default } } })
    if (cipher.kind !== 'snapshot') throw new Error(JSON.stringify(cipher))

    for (const locale of ['en-US', 'zh-CN'] as const) {
      const presentation = executionTracePresentation(schedule.snapshot, i18n.getFixedT(locale, 'visualizers'), 'schedule')
      expect(presentation.diagnostics).toBeUndefined()
      const rows = presentation.sections[0].rows
      const finalState = rows.find((row) => row.id === `batch-${fixture.finalBatch}.value`)!
      expect(finalState.cells[1].value).toHaveLength(fixture.variant / 4 + 2)
      expect(String(finalState.cells[1].value).startsWith(fixture.finalKey)).toBe(true)
      expect(rows.find((row) => row.id === `round-key-${fixture.finalRound}.value`)?.cells[1].value).toBe(fixture.finalKey)
      const labels = rows.map((row) => row.label)
      expect(labels).toContain(locale === 'en-US' ? 'Word rotation' : '字循环旋转')
      expect(labels).toContain(locale === 'en-US' ? 'Byte substitution' : '字节替换')
      expect(labels).toContain(locale === 'en-US' ? 'AES chained word XOR' : 'AES 链式字异或')
      if (fixture.variant === 192) expect(labels).toContain(locale === 'en-US' ? 'Concatenation 1' : '拼接 1')
      expect(labels.some((label) => /Unnamed operation|未命名操作/.test(label))).toBe(false)
      expect(compiled.value.locales[locale].title).toBe(locale === 'en-US' ? `AES-${fixture.variant} v2 calculation` : `AES-${fixture.variant} v2 计算`)
      expect(compiled.value.locales[locale].texts['schedule-description']).toBeTruthy()
      expect(compiled.value.locales[locale].texts['cipher-description']).toBeTruthy()

      const props = { executionIdentity: 'calculation', dimensions: { width: 1100, height: 700 }, reducedMotion: true }
      const view = render(React.createElement(I18nextProvider, { i18n: i18n.cloneInstance({ lng: locale }) }, React.createElement(RenderHost, { ...props, execution: schedule.snapshot })))
      expect(view.queryByRole('alert')).toBeNull()
      expect(view.getByRole('row', { name: new RegExp(`^${locale === 'en-US' ? 'Output' : '输出'} ${fixture.finalRound} ${fixture.finalRound} ${fixture.finalKey}$`) })).toBeVisible()
      view.rerender(React.createElement(I18nextProvider, { i18n: i18n.cloneInstance({ lng: locale }) }, React.createElement(RenderHost, { ...props, execution: cipher.snapshot })))
      expect(view.queryByRole('alert')).toBeNull()
      expect(view.getByRole('row', { name: new RegExp(`^${locale === 'en-US' ? 'XOR' : '异或'} ${fixture.finalRound} ${fixture.finalRound} ${fixture.ciphertext}$`) })).toBeVisible()
      cleanup()
    }
  })
})


describe('Independent compiled schedule inspection (#106)', () => {
  it('presents actual AES-192 full states and cross-batch exports without a cipher', () => {
    const fixture = fixtures[0]
    const compiled = compileLesson(fixture)
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
    const result = executeWorkerRequest({ requestId: 'independent', kind: 'execute', payload: { graph: compiled.value.graphs.schedule.graph, inputs: { 'key.value': compiled.value.inputs.key.default } } })
    if (result.kind !== 'snapshot') throw new Error(JSON.stringify(result))
    const view = render(React.createElement(I18nextProvider, { i18n: i18n.cloneInstance({ lng: 'en-US' }) }, React.createElement(RenderHost, {
      execution: result.snapshot, compiledGraph: compiled.value.graphs.schedule,
      presentation: compiled.value.steps.find((step) => step.id === 'schedule')!.presentation,
      executionIdentity: 'independent', dimensions: { width: 1100, height: 700 }, reducedMotion: true,
    })))
    expect(view.getByRole('heading', { name: 'AES-192 key expansion' })).toBeVisible()
    expect(view.container.querySelector('[data-row-id="batch-7.value"]')?.querySelectorAll('button')).toHaveLength(192)
    expect(view.container.querySelector('[data-row-id="round-key-1.value"]')).toHaveTextContent('0x10111213141516175846f2f95c43f4fe')
    expect(view.container.querySelector('[data-row-id="round-key-1.value"]')?.querySelectorAll('button')).toHaveLength(128)
    expect(view.queryByRole('region', { name: /^Key expansion$/ })).toBeNull()
    cleanup()
  }, 15000)
})


describe('Exact compiled unit selection (#106)', () => {
  it('marks related groups without widening exact traversal until deliberate whole-unit selection', async () => {
    const user = userEvent.setup()
    const compiled = compileLesson({
      lesson: `version: 2
id: narrow-schedule
default_locale: en-US
constants: {}
inputs:
  key: {type: {family: bits, size: 32}, encoding: hex, default: "0x12345678"}
graphs:
  schedule:
    nodes:
      - {id: origin, operation: core.source@1, parameters: {type: {family: bits, size: 32}}, role: state, unit: 32}
      - {id: substituted, operation: core.substitute-bytes@1, inputs: {value: {node: origin, port: value}}, parameters: {sBox: [${Array.from({ length: 256 }, (_, n) => n).join(',')}], start: 0, count: 1}, role: state, unit: 32}
      - {id: chosen, operation: core.output@1, inputs: {value: {node: substituted, port: value, bits: [4, 8]}}, role: round-key, round: 0}
      - {id: sibling, operation: core.output@1, inputs: {value: {node: origin, port: value, bits: [12, 8]}}, role: round-key, round: 1}
    outputs: [{node: chosen, port: value}, {node: sibling, port: value}]
steps:
  - id: inspect
    presentation: {kind: spn-cipher, mode: key-expansion}
    execute: {graph: schedule, bindings: {origin.value: {input: key}}}
`,
      locales: { 'en-US': 'title: Narrow\nsummary: Inspect\ntexts: {}' },
    })
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
    const result = executeWorkerRequest({ requestId: 'narrow', kind: 'execute', payload: { graph: compiled.value.graphs.schedule.graph, inputs: { 'origin.value': compiled.value.inputs.key.default } } })
    if (result.kind !== 'snapshot') throw new Error(JSON.stringify(result))
    const exact = relatedBitIds({ title: 'Compiled schedule', sections: [{ kind: 'trace', caption: 'Dependency graph', headers: [], rows: [{
      id: 'graph', label: 'Graph', cells: [], relationships: compiled.value.graphs.schedule.lineage!.map((edge) => ({ from: `${edge.source}#${edge.sourceBit}`, to: `${edge.target}#${edge.targetBit}` })),
    }] }] }, Array.from({ length: 8 }, (_, bit) => `chosen.value#${bit}`))
    expect([...exact].filter((id) => id.startsWith('origin.value#')).sort()).toEqual(Array.from({ length: 12 }, (_, bit) => `origin.value#${bit}`).sort())
    expect([...exact].filter((id) => id.startsWith('sibling.value#'))).toEqual([])
    const language = i18n.cloneInstance({ lng: 'en-US' })
    const props = {
      execution: result.snapshot, compiledGraph: compiled.value.graphs.schedule, presentation: compiled.value.steps[0].presentation,
      executionIdentity: 'narrow', dimensions: { width: 1100, height: 700 }, reducedMotion: true,
    }
    const view = render(React.createElement(I18nextProvider, { i18n: language }, React.createElement(RenderHost, props)))
    const origin = view.container.querySelector('[data-row-id="origin.value"]')!
    const mode = view.getByRole('combobox', { name: 'Key schedule: Selection unit' })
    expect(view.getAllByRole('combobox')).toHaveLength(1)
    expect([...mode.querySelectorAll('option')].map((option) => option.value)).toEqual(['1', '2', '4', '8'])
    await user.selectOptions(mode, '8')
    // The projection crosses a byte boundary: substitution contributes the first byte's
    // ancestors, while the pass-through half contributes only bits 8..11 of the next byte.
    await user.click(view.getByRole('button', { name: /Round key 0 \(chosen.value\), Bits 0–7: 0x23/ }))
    const partial = view.getByRole('button', { name: /Source \(origin.value\), Bits 8–15: 0x34; Related group/ })
    expect(partial).toHaveAttribute('aria-pressed', 'false')
    expect(partial).toHaveAttribute('data-state', 'related')
    expect(partial).toHaveTextContent(/^0x34$/)
    expect(view.container.querySelector('details')).toBeNull()
    expect(origin.querySelector('[data-bit-group="0"]')).not.toBeNull()
    expect(view.container.querySelector('[data-row-id="substituted.value"] button[data-state="related"]')).toHaveAccessibleName(/Bits 0–7: 0x12; Related group/)
    expect(view.container.querySelectorAll('[data-row-id="substituted.value"] button[data-state="related"]')).toHaveLength(2)
    expect(view.container.querySelectorAll('[data-row-id="sibling.value"] button[data-state="related"]')).toHaveLength(0)
    await user.click(partial)
    expect(partial).toHaveAttribute('aria-pressed', 'true')
    expect(view.container.querySelector('[data-row-id="sibling.value"] button[data-state="related"]')).toHaveAccessibleName(/Bits 0–7: 0x45; Related group/)
    await act(async () => { await language.changeLanguage('zh-CN') })
    expect(view.getByRole('status')).toHaveTextContent('位 8–15')
    expect(view.container.querySelectorAll('[data-row-id="origin.value"] button')[1]).toHaveAttribute('aria-pressed', 'true')
    cleanup()
  })
})
