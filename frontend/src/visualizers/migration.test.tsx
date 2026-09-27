import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { teachingSpnDemoDocuments } from '../../demos/teachingSpnLesson'
import { executeWorkerRequest } from '../crypto_graph'
import { createBrowserLessonSession, type LessonDocuments, type LessonSessionState } from '../lesson_runtime'
import { avalanchePresentation } from './Avalanche'
import { teachingSpnPresentation } from './TeachingSpn'
import { RenderHost, visualizerCatalog } from './index'

const avalancheDocuments: LessonDocuments = {
  lesson: `version: 1
id: avalanche
default_locale: en-US
inputs:
  plaintext: {type: {family: bits, size: 16}, encoding: hex, default: "0x0f0f"}
  changed_plaintext: {type: {family: bits, size: 16}, encoding: hex, default: "0x00ff"}
constants:
  key: {type: {family: bits, size: 16}, encoding: hex, value: "0x0f0f"}
graphs:
  teaching-spn:
    nodes:
      - {id: plaintext, operation: core.source@1, parameters: {type: {family: bits, size: 16}}}
      - {id: key, operation: core.source@1, parameters: {type: {family: bits, size: 16}}}
      - id: round
        repeat: {subgraph: round, count: 2}
        inputs:
          permute: {node: plaintext, port: value}
          key: {node: key, port: value}
    outputs: [{node: round, port: permute}]
    traceLevel: detail
    subgraphs:
      round:
        inputs:
          - {name: permute, type: {family: bits, size: 16}}
          - {name: key, type: {family: bits, size: 16}}
        outputs: [{name: permute, type: {family: bits, size: 16}}]
        nodes:
          - {id: key, operation: core.output@1, inputs: {value: {node: "@input", port: key}}}
          - {id: key-mix, operation: core.xor@1, inputs: {left: {node: "@previous", port: permute}, right: {node: key, port: value}}}
          - {id: substitute, operation: spn.substitute@1, inputs: {value: {node: key-mix, port: value}}, parameters: {sBox: [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7]}}
          - {id: permute, operation: spn.permute@1, inputs: {value: {node: substitute, port: value}}, parameters: {permutation: [0, 2, 1, 3]}}
steps:
  - id: compare
    visualizer:
      id: avalanche@1
      compare:
        kind: avalanche
        graph: teaching-spn
        bindings:
          plaintext:
            baseline: {input: plaintext}
            changed: {input: changed_plaintext}
          key: {constant: key}
        traceLevel: detail
`,
  locales: {
    'en-US': 'title: Avalanche\nsummary: Compare a plaintext change.\ntexts: {}',
    'zh-CN': 'title: 雪崩\nsummary: 比较明文变化。\ntexts: {}',
  },
}

const withLimits = (documents: LessonDocuments, traceEvents: number): LessonDocuments =>
  ({ ...documents, lesson: documents.lesson.replace('inputs:\n', `limits: {traceEvents: ${traceEvents}}\ninputs:\n`) })

const previousWorker = globalThis.Worker
beforeEach(() => {
  class WorkerStub {
    private listeners: Array<(event: MessageEvent<unknown>) => void> = []
    addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
      if (type === 'message') this.listeners.push(listener)
    }
    postMessage(request: Parameters<typeof executeWorkerRequest>[0]): void {
      queueMicrotask(() => this.listeners.forEach((listener) => listener({ data: executeWorkerRequest(request) } as MessageEvent<unknown>)))
    }
    terminate(): void {}
  }
  globalThis.Worker = WorkerStub as unknown as typeof Worker
})
afterEach(() => { globalThis.Worker = previousWorker })

const run = async (documents: LessonDocuments, locale: string): Promise<LessonSessionState> => {
  const session = createBrowserLessonSession(documents, locale, visualizerCatalog)
  if (!session.ok) throw new Error(session.diagnostics[0]?.message)
  const result = await session.value.enter()
  session.value.dispose()
  if (!result.ok) throw new Error(result.diagnostics[0]?.message)
  return result.value
}

const renderSpn = async (locale: string, documents = teachingSpnDemoDocuments) => {
  const state = await run(documents, locale)
  render(<RenderHost execution={state.snapshots.visualize} executionIdentity="spn" invocation={{ id: 'teaching-spn@1' }} locale={locale} dimensions={{ width: 1100, height: 700 }} reducedMotion />)
  return state
}

const renderAvalanche = async (locale: string, documents = avalancheDocuments) => {
  const state = await run(documents, locale)
  render(<RenderHost comparison={state.comparisons.compare} executionIdentity="avalanche" invocation={{ id: 'avalanche@1' }} locale={locale} dimensions={{ width: 1100, height: 700 }} reducedMotion />)
  return state
}

const spnLocales = [
  { locale: 'en-US', title: 'Teaching SPN execution', flow: 'State flow', input: 'Input state', keyMix: 'Key-mixing result', substitution: 'S-box result', bit: 'Bit', key: 'Round keys: 0x0f0f', selected: 'Selected lineage', xor: 'XOR', path: 'round.1/key-mix: 0x1d3b' },
  { locale: 'zh-CN', title: '教学 SPN 执行', flow: '状态流', input: '输入状态', keyMix: '密钥混合结果', substitution: 'S 盒结果', bit: '位', key: '轮密钥: 0x0f0f', selected: '所选谱系', xor: '异或', path: '轮.1/密钥混合: 0x1d3b' },
] as const

describe('Teaching SPN presentation adapter', () => {
  it('adapts the YAML trace into whole round keys, bit rows, lineage, and details', async () => {
    const state = await run(teachingSpnDemoDocuments, 'en-US')
    const presentation = teachingSpnPresentation(state.snapshots.visualize, 'en-US', 'spn')
    const rows = presentation.sections[0].rows
    expect(rows.map((row) => row.id)).toEqual([
      'plaintext', 'round.1/key', 'round.1/key-mix', 'round.1/substitute', 'round.1/permute', 'round.1/output',
      'round.2/key', 'round.2/key-mix', 'round.2/substitute', 'round.2/permute', 'round.2/output', 'output',
    ])
    const key = rows[1]
    expect(key.selectableKey).toMatchObject({ id: 'round.1/key', ariaLabel: 'Round keys: 0x0f0f' })
    expect(key.selectableBits).toBeUndefined()
    expect(key.relationships).toHaveLength(16)
    expect(key.relationships?.every((relationship) => relationship.to.startsWith('round.1/key-mix#'))).toBe(true)
    expect(rows[2].relationships?.[0]).toEqual({ from: 'plaintext#0', to: 'round.1/key-mix#0' })
    expect(rows[3].relationships?.filter((relationship) => relationship.from === 'round.1/key-mix#5').map((relationship) => relationship.to))
      .toEqual(['round.1/substitute#4', 'round.1/substitute#5', 'round.1/substitute#6', 'round.1/substitute#7'])
    expect(rows.every((row) => row.cells.length === 2)).toBe(true)
    expect(presentation.initialSelection).toBe('plaintext#0')
  })

  it.each(spnLocales)('renders $locale copy through shared components', async (text) => {
    await renderSpn(text.locale)
    expect(screen.getByRole('heading', { name: text.title })).toBeVisible()
    const flow = screen.getByRole('table', { name: text.flow })
    expect(within(flow).getAllByRole('rowheader', { name: text.keyMix })).toHaveLength(2)
    expect(within(flow).getByText(text.path)).toBeVisible()
    expect(flow).toHaveTextContent(`${text.xor}0x419c ⊕ 0xf0f0 = 0xb16c`)
    expect(screen.getByLabelText(text.key, { selector: 'button' })).toBeVisible()
    expect(screen.getByLabelText(`${text.input}, ${text.bit} 0: 0`, { selector: 'button' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('status')).toHaveTextContent(`${text.selected}: ${text.input}, ${text.bit} 0.`)
    expect(document.querySelector('svg[data-lineage]')).toHaveAttribute('aria-hidden', 'true')
    expect(document.querySelector('svg[data-lineage]')?.querySelector('[role="button"]')).toBeNull()
  })

  it('follows directed structural lineage from the selected bit', async () => {
    const user = userEvent.setup()
    await renderSpn('en-US')
    const state = (name: string) => screen.getByLabelText(name, { selector: 'button' }).getAttribute('data-state')
    expect(state('Key-mixing result, Bit 0: 0')).toBe('related')
    expect(screen.getAllByLabelText(/^S-box result, Bit [0-3]:/, { selector: 'button' })[0]).toHaveAttribute('data-state', 'related')
    expect(state('Input state, Bit 1: 0')).toBe('default')
    expect(state('Round keys: 0x0f0f')).toBe('default')
    await user.click(screen.getByLabelText('S-box result, Bit 5: 0', { selector: 'button' }))
    expect(state('Round keys: 0x0f0f')).toBe('related')
    expect(state('Input state, Bit 5: 0')).toBe('related')
    expect(state('Input state, Bit 0: 0')).toBe('default')
    expect(state('Round keys: 0xf0f0')).toBe('default')
  })

  it('keeps bit and whole-key selection exclusive with Enter and Space', async () => {
    const user = userEvent.setup()
    await renderSpn('en-US')
    const key = screen.getByLabelText('Round keys: 0xf0f0', { selector: 'button' })
    key.focus()
    await user.keyboard(' ')
    expect(key).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Input state, Bit 0: 0', { selector: 'button' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('status')).toHaveTextContent('Selected lineage: Round keys: 0xf0f0')
    const bit = screen.getByLabelText('S-box result, Bit 5: 0', { selector: 'button' })
    bit.focus()
    await user.keyboard('{Enter}')
    expect(bit).toHaveAttribute('aria-pressed', 'true')
    expect(key).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('status')).toHaveTextContent('Selected lineage: S-box result, Bit 5.')
  })

  it('marks truncated traces and keeps retained values without lineage past the gap', async () => {
    const state = await renderSpn('zh-CN', withLimits(teachingSpnDemoDocuments, 2))
    expect(state.snapshots.visualize.traceStatus.truncated).toBe(true)
    expect(screen.getAllByRole('status').map((status) => status.textContent)).toContain('轨迹不完整。保留的原始值仍可见；谱系会在缺失阶段停止。')
    expect(screen.getByRole('rowheader', { name: '轨迹缺口' }).closest('tr')).toHaveAttribute('data-state', 'incomplete')
    expect(screen.getByText('明文: 0x1234')).toBeVisible()
    expect(document.querySelectorAll('svg[data-lineage] line')).toHaveLength(0)
  })
})

describe('Avalanche presentation adapter', () => {
  it('adapts paired checkpoints into changed bits, whole keys, and summary rows', async () => {
    const state = await run(avalancheDocuments, 'en-US')
    const presentation = avalanchePresentation(state.comparisons.compare, 'en-US', 'avalanche')
    const [flow, summary] = presentation.sections
    const plaintext = flow.rows[0]
    expect(plaintext.cells.map((cell) => cell.value)).toEqual(['0x0f0f | 0x00ff'])
    expect(plaintext.selectableBits?.filter((bit) => bit.state === 'changed').map((bit) => bit.bit)).toEqual([4, 5, 6, 7, 8, 9, 10, 11])
    expect(presentation.initialSelection).toBe('plaintext#4')
    expect(flow.rows.filter((row) => row.selectableKey).map((row) => row.selectableKey?.ariaLabel)).toEqual(['Round keys: 0x0f0f', 'Round keys: 0x0f0f'])
    expect(summary).toMatchObject({ kind: 'comparison', caption: 'Comparison summary' })
    expect(summary.rows).toHaveLength(state.comparisons.compare.checkpoints.length)
  })

  it.each([
    { locale: 'en-US', title: 'Continuous avalanche comparison', summary: 'Comparison summary', bit: 'plaintext, Bit 4: 1|0, different', status: 'Selected bit lineage: plaintext, Bit 4.', traced: 'XOR operands and result, Bit 4: 0|1, different', key: 'Round keys: 0x0f0f' },
    { locale: 'zh-CN', title: '连续雪崩比较', summary: '比较摘要', bit: '明文, 位 4: 1|0, 不同', status: '所选位的谱系: 明文, 位 4.', traced: '异或操作数与结果, 位 4: 0|1, 不同', key: '轮密钥: 0x0f0f' },
  ])('renders $locale comparison through shared components', async (text) => {
    await renderAvalanche(text.locale)
    expect(screen.getByRole('heading', { name: text.title })).toBeVisible()
    const summary = screen.getByRole('table', { name: text.summary })
    expect(summary).toHaveTextContent('0.5')
    expect(screen.queryByRole('columnheader', { name: /Difference mask|差异掩码/ })).toBeNull()
    expect(screen.getAllByLabelText(text.traced, { selector: 'button' })[0]).toHaveAttribute('data-state', 'related-changed')
    const bit = screen.getByLabelText(text.bit, { selector: 'button' })
    expect(bit).toHaveAttribute('aria-pressed', 'true')
    expect(bit.querySelector('u')).toHaveTextContent('1|0')
    expect(screen.getByRole('status')).toHaveTextContent(text.status)
    expect(screen.getAllByLabelText(text.key, { selector: 'button' })).toHaveLength(2)
  })

  it('shows retained raw values and the gap for truncated comparisons', async () => {
    const state = await renderAvalanche('en-US', withLimits(avalancheDocuments, 14))
    expect(state.comparisons.compare.truncated).toBe(true)
    const incomplete = 'Trace is incomplete. Raw retained values remain visible; paired differences and lineage stop at the gap.'
    expect(screen.getAllByRole('status').map((status) => status.textContent)).toContain(incomplete)
    const raw = screen.getByRole('table', { name: incomplete })
    expect(within(raw).getAllByRole('rowheader', { name: 'Baseline' }).length).toBeGreaterThan(0)
    expect(within(raw).getByRole('rowheader', { name: 'Trace gap' }).closest('tr')).toHaveAttribute('data-state', 'incomplete')
    expect(screen.getByRole('table', { name: 'Comparison summary' })).toHaveTextContent('Trace gap')
  })
})
