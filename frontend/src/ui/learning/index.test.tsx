import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { describe, expect, it } from 'vitest'
import {
  ComparisonRow,
  LearningPresentationView,
  TraceTable,
  ValueCell,
  relatedBitIds,
  type LearningPresentation,
} from '.'

const locales = [
  { locale: 'en-US', caption: 'Cipher trace', stage: 'Stage', baseline: 'Baseline', changed: 'Changed', value: 'B', selected: 'C', selection: 'Inspect C' },
  { locale: 'zh-CN', caption: '密码轨迹', stage: '阶段', baseline: '基准', changed: '改变后', value: '乙', selected: '丙', selection: '检查丙' },
] as const

const presentation = (executionIdentity = 'run-1'): LearningPresentation => ({
  title: 'Trace',
  instructions: 'Inspect relationships.',
  executionIdentity,
  initialSelection: 'input-0',
  sections: [{
    kind: 'trace',
    caption: 'Trace',
    headers: ['Stage', 'Value', 'Bits'],
    rows: [
      {
        id: 'input',
        label: 'Input',
        cells: [{ value: '0x1' }],
        selectableBits: [{ id: 'input-0', bit: 0, value: '1', ariaLabel: 'Input bit 0' }],
        relationships: [{ from: 'input-0', to: 'output-0' }],
      },
      {
        id: 'output',
        label: 'Output',
        cells: [{ value: '0x1' }],
        selectableBits: [{ id: 'output-0', bit: 0, value: '1', ariaLabel: 'Output bit 0' }],
      },
      {
        id: 'key',
        label: 'Round key',
        cells: [{ value: '0xf' }],
        selectableBits: [{ id: 'round-key-1', bit: 0, value: 'K1', ariaLabel: 'Round key 1' }],
      },
    ],
  }],
})

describe('Learning presentation primitives', () => {
  it.each(locales)('renders $locale caller-provided content and states', ({ caption, stage, baseline, changed, value, selected, selection }) => {
    render(<TraceTable caption={caption} headers={[stage, baseline, changed]}>
      <ComparisonRow label={stage}>
        <ValueCell state="changed">{value}</ValueCell>
        <ValueCell ariaLabel={selection} onSelect={() => undefined} state="selected">{selected}</ValueCell>
      </ComparisonRow>
    </TraceTable>)

    expect(screen.getByRole('table', { name: caption })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: stage })).toBeVisible()
    expect(screen.getByText(value).closest('td')).toHaveAttribute('data-state', 'changed')
    expect(screen.getByRole('button', { name: selection })).toHaveAttribute('aria-pressed', 'true')
  })

  it('selects bits and round keys with native keyboard controls', async () => {
    const user = userEvent.setup()
    render(<LearningPresentationView presentation={presentation()} />)
    const output = screen.getByRole('button', { name: 'Output bit 0' })
    expect(output).toHaveAttribute('data-state', 'related')
    output.focus()
    await user.keyboard('{Enter}')
    expect(output).toHaveAttribute('aria-pressed', 'true')
    const key = screen.getByRole('button', { name: 'Round key 1' })
    key.focus()
    await user.keyboard(' ')
    expect(key).toHaveAttribute('aria-pressed', 'true')
  })

  it('resets selection when execution identity changes', async () => {
    const user = userEvent.setup()
    const view = render(<LearningPresentationView presentation={presentation()} />)
    await user.click(screen.getByRole('button', { name: 'Round key 1' }))
    expect(screen.getByRole('button', { name: 'Round key 1' })).toHaveAttribute('aria-pressed', 'true')
    view.rerender(<LearningPresentationView presentation={presentation('run-2')} />)
    expect(screen.getByRole('button', { name: 'Input bit 0' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders incomplete trace status and relationship closure', () => {
    const incomplete: LearningPresentation = {
      ...presentation(),
      sections: [...presentation().sections, {
        kind: 'raw',
        caption: 'Trace is incomplete.',
        headers: ['Stage', 'Value'],
        rows: [{ id: 'gap', label: 'Trace gap', state: 'incomplete', cells: [{ value: 'Retained value' }] }],
      }],
    }
    expect([...relatedBitIds(presentation(), 'input-0')]).toEqual(['input-0', 'output-0'])
    render(<LearningPresentationView presentation={incomplete} />)
    expect(screen.getByRole('status')).toHaveTextContent('Trace is incomplete.')
    expect(screen.getByRole('rowheader', { name: 'Trace gap' })).toBeVisible()
  })
})
