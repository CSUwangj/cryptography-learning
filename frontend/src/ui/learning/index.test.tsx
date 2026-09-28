import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { describe, expect, it } from 'vitest'
import {
  ComparisonRow,
  LineageDiagram,
  LearningPresentationView,
  TraceTable,
  ValueCell,
  relatedBitIds,
  type LearningPresentation,
  type LearningRow,
  type LearningSelection,
} from '.'

const locales = [
  { locale: 'en-US', caption: 'Cipher trace', stage: 'Stage', baseline: 'Baseline', changed: 'Changed', value: 'B', selected: 'C', selection: 'Inspect C', status: 'Selected: Input bit 0', outputStatus: 'Selected: Output bit 0' },
  { locale: 'zh-CN', caption: '密码轨迹', stage: '阶段', baseline: '基准', changed: '改变后', value: '乙', selected: '丙', selection: '检查丙', status: '已选择：输入位 0', outputStatus: '已选择：输出位 0' },
] as const

const presentation = (executionIdentity = 'run-1', selectionStatus?: LearningPresentation['selectionStatus']): LearningPresentation => ({
  title: 'Trace',
  instructions: 'Inspect relationships.',
  executionIdentity,
  initialSelection: 'input-0',
  selectionStatus,
  sections: [{
    kind: 'trace',
    caption: 'Trace',
    headers: ['Stage', 'Value', 'Bits'],
    rows: [
      {
        id: 'input',
        label: 'Input',
        state: 'warning',
        cells: [{ value: '0x1', ariaLabel: 'Input state' }],
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
        selectableKey: { id: 'round-key-1', value: 'K1', ariaLabel: 'Round key 1' },
      },
    ],
  }],
})

const laneFixture = (): LearningPresentation => ({
  ...presentation(),
  sections: [{
    ...presentation().sections[0],
    rows: [
      ...presentation().sections[0].rows,
      { id: 'key-2', label: 'Round key 2', cells: [{ value: '0xe' }], selectableKey: { id: 'round-key-2', value: 'K2', ariaLabel: 'Round key 2' } },
    ],
  }],
  keyExpansionLane: {
    caption: 'Key expansion',
    closeLabel: 'Close key expansion',
    rowsById: {
      input: { selectableBits: [{ id: 'master-0', bit: 0, value: '1', ariaLabel: 'Master key bit 0' }] },
      key: { selectableBits: [{ id: 'round-key-1-bit-0', bit: 0, value: '1', ariaLabel: 'Round key 1 bit 0' }] },
      'key-2': { selectableBits: [{ id: 'round-key-2-bit-0', bit: 0, value: '1', ariaLabel: 'Round key 2 bit 0' }] },
    },
  },
})

describe('Key expansion lane (#83)', () => {
  it('hides the key-expansion lane until a round-key chip is selected', () => {
    render(<LearningPresentationView presentation={laneFixture()} />)
    expect(screen.queryByRole('region', { name: 'Key expansion' })).toBeNull()
  })

  it('opens the lane on round-key selection, aligns its rows to the trace via stable row ids, and closes on reselect', async () => {
    const user = userEvent.setup()
    render(<LearningPresentationView presentation={laneFixture()} />)
    await user.click(screen.getByRole('button', { name: 'Round key 1' }))
    const region = screen.getByRole('region', { name: 'Key expansion' })
    expect(region).toBeVisible()
    expect(screen.getByRole('button', { name: 'Master key bit 0' })).toBeVisible()
    expect([...region.querySelectorAll('tr[data-row-id]')].map((row) => row.getAttribute('data-row-id')))
      .toEqual(['input', 'output', 'key', 'key-2'])

    await user.click(screen.getByRole('button', { name: 'Round key 1' }))
    expect(screen.queryByRole('region', { name: 'Key expansion' })).toBeNull()
  })

  it('moves the lane highlight to another round key without closing', async () => {
    const user = userEvent.setup()
    render(<LearningPresentationView presentation={laneFixture()} />)
    await user.click(screen.getByRole('button', { name: 'Round key 1' }))
    expect(screen.getByRole('button', { name: 'Round key 1' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Round key 1 bit 0' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Round key 2' }))
    expect(screen.getByRole('region', { name: 'Key expansion' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Round key 1' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Round key 2' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Round key 2 bit 0' })).toBeVisible()
  })

  it('closes the lane through its explicit close control', async () => {
    const user = userEvent.setup()
    render(<LearningPresentationView presentation={laneFixture()} />)
    await user.click(screen.getByRole('button', { name: 'Round key 1' }))
    await user.click(screen.getByRole('button', { name: 'Close key expansion' }))
    expect(screen.queryByRole('region', { name: 'Key expansion' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Round key 1' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('opens the lane via native keyboard activation of a round-key chip', async () => {
    const user = userEvent.setup()
    render(<LearningPresentationView presentation={laneFixture()} />)
    screen.getByRole('button', { name: 'Round key 1' }).focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('region', { name: 'Key expansion' })).toBeVisible()
  })

  it('selects a lane bit to highlight its structural lineage to the source master-key bit', async () => {
    const user = userEvent.setup()
    const withLineage: LearningPresentation = {
      ...laneFixture(),
      sections: [{
        ...laneFixture().sections[0],
        rows: laneFixture().sections[0].rows.map((row) => row.id === 'key'
          ? { ...row, relationships: [{ from: 'master-0', to: 'round-key-1-bit-0' }] }
          : row),
      }],
    }
    render(<LearningPresentationView presentation={withLineage} />)
    await user.click(screen.getByRole('button', { name: 'Round key 1' }))
    await user.click(screen.getByRole('button', { name: 'Round key 1 bit 0' }))
    expect(screen.getByRole('button', { name: 'Round key 1 bit 0' })).toHaveAttribute('data-state', 'selected')
    expect(screen.getByRole('button', { name: 'Master key bit 0' })).toHaveAttribute('data-state', 'related')
  })
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
    expect(output).toHaveAttribute('aria-pressed', 'false')
  })

  it('resets selection when execution identity changes', async () => {
    const user = userEvent.setup()
    const view = render(<LearningPresentationView presentation={presentation()} />)
    await user.click(screen.getByRole('button', { name: 'Round key 1' }))
    expect(screen.getByRole('button', { name: 'Round key 1' })).toHaveAttribute('aria-pressed', 'true')
    view.rerender(<LearningPresentationView presentation={presentation('run-2')} />)
    expect(screen.getByRole('button', { name: 'Input bit 0' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('preserves row state and caller-provided cell labels', () => {
    render(<LearningPresentationView presentation={presentation()} />)
    expect(screen.getByRole('cell', { name: 'Input state' }).closest('tr')).toHaveAttribute('data-state', 'warning')
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

  it('renders readable sections without selectable targets', () => {
    render(<LearningPresentationView presentation={{
      title: 'Raw trace',
      sections: [{ kind: 'raw', caption: 'Retained values', headers: ['Value'], rows: [{ id: 'raw', label: 'Retained', cells: [{ value: '0x1' }] }] }],
    }} />)
    expect(screen.getByText('Retained values')).toBeVisible()
    expect(screen.getByRole('rowheader', { name: 'Retained' })).toBeVisible()
  })

  it('connects relationships across presentation sections', () => {
    const multiSection: LearningPresentation = {
      ...presentation(),
      sections: [
        {
          ...presentation().sections[0],
          rows: presentation().sections[0].rows.map((row) => row.id === 'input'
            ? { ...row, relationships: [...(row.relationships ?? []), { from: 'input-0', to: 'retained-0' }] }
            : row),
        },
        {
          kind: 'raw',
          caption: 'Retained values',
          headers: ['Stage', 'Bits'],
          rows: [{ id: 'retained', label: 'Retained', cells: [{ value: '0x1' }], selectableBits: [{ id: 'retained-0', bit: 0, value: '1', ariaLabel: 'Retained bit 0' }] }],
        },
      ],
    }
    render(<LearningPresentationView presentation={multiSection} />)
    expect(document.querySelector('svg[data-lineage]')?.querySelectorAll('line')).toHaveLength(2)
  })

  it('connects whole round keys to bits', () => {
    const keyLineage: LearningPresentation = {
      ...presentation(),
      sections: [{
        ...presentation().sections[0],
        rows: presentation().sections[0].rows.map((row) => row.id === 'key'
          ? { ...row, relationships: [{ from: 'round-key-1', to: 'input-0' }] }
          : row),
      }],
    }
    render(<LearningPresentationView presentation={keyLineage} />)
    expect(document.querySelector('svg[data-lineage]')?.querySelectorAll('line')).toHaveLength(2)
  })

  it.each([
    { expected: 'default', related: new Set<string>(), selected: undefined, state: undefined },
    { expected: 'related', related: new Set(['input-0', 'output-0']), selected: undefined, state: undefined },
    { expected: 'selected', related: new Set<string>(), selected: { kind: 'bit', id: 'input-0' } satisfies LearningSelection, state: undefined },
    { expected: 'changed', related: new Set<string>(), selected: undefined, state: 'changed' },
    { expected: 'warning', related: new Set<string>(), selected: undefined, state: 'warning' },
    { expected: 'incomplete', related: new Set<string>(), selected: undefined, state: 'incomplete' },
  ] as const)('renders $expected lineage state', ({ expected, related, selected, state }) => {
    const rows: readonly LearningRow[] = [{
      id: 'trace',
      label: 'Trace',
      cells: [],
      selectableBits: [
        { id: 'input-0', bit: 0, value: '0', ariaLabel: 'Input bit 0' },
        { id: 'output-0', bit: 1, value: '1', ariaLabel: 'Output bit 0' },
      ],
      relationships: [{ from: 'input-0', to: 'output-0', state }],
    }]
    render(<div style={{ position: 'relative' }}>
      <LineageDiagram
        height={80}
        locations={new Map([['input-0', { x: 20, y: 20 }], ['output-0', { x: 60, y: 60 }]])}
        relationships={rows[0].relationships ?? []}
        related={related}
        selected={selected}
        width={80}
      />
    </div>)
    expect(document.querySelector('svg[data-lineage] line')).toHaveAttribute('data-state', expected)
  })

  it.each(locales)('renders decorative lineage and keyboard-updated $locale selection status', async ({ status, outputStatus }) => {
    const user = userEvent.setup()
    render(<LearningPresentationView presentation={presentation('run-1', (bit) => bit?.id === 'output-0' ? outputStatus : status)} />)
    const lineage = document.querySelector('svg[data-lineage]')
    expect(lineage).toHaveAttribute('aria-hidden', 'true')
    expect(lineage?.querySelectorAll('line')).toHaveLength(1)
    expect(lineage?.querySelector('[role="button"]')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent(status)
    const output = screen.getByRole('button', { name: 'Output bit 0' })
    expect(lineage?.parentElement).toContainElement(output)
    output.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('status')).toHaveTextContent(outputStatus)
  })
})
