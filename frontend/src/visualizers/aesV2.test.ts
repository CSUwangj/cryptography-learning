import { I18nextProvider } from 'react-i18next'
import i18n from '../app/i18n'
import React from 'react'
import { cleanup, render } from '@testing-library/react'
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
