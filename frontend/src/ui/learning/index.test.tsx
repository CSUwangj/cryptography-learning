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
    rows: [
      { id: 'lane-input', anchor: 'input', selectableBits: [{ id: 'master-0', bit: 0, value: '1', ariaLabel: 'Master key bit 0' }] },
      { id: 'lane-key', anchor: 'key', selectableBits: [{ id: 'round-key-1-bit-0', bit: 0, value: '1', ariaLabel: 'Round key 1 bit 0' }] },
      { id: 'lane-key-2', anchor: 'key-2', selectableBits: [{ id: 'round-key-2-bit-0', bit: 0, value: '1', ariaLabel: 'Round key 2 bit 0' }] },
    ],
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

  it('aligns lane rows by anchor and pads the shorter side with temporary empty rows (#92)', async () => {
    const user = userEvent.setup()
    const anchored: LearningPresentation = {
      ...presentation(),
      keyExpansionLane: {
        caption: 'Key expansion',
        closeLabel: 'Close key expansion',
        rows: [
          { id: 'lane-input', anchor: 'input', label: 'Schedule input', selectableBits: [{ id: 'schedule-0', bit: 0, value: '1', ariaLabel: 'Schedule input bit 0' }] },
          { id: 'lane-rot', label: 'RotWord 1', selectableBits: [{ id: 'rot-0', bit: 0, value: '0', ariaLabel: 'RotWord 1 bit 0' }] },
          { id: 'lane-sub', label: 'SubWord 1', selectableBits: [{ id: 'sub-0', bit: 0, value: '1', ariaLabel: 'SubWord 1 bit 0' }] },
          { id: 'lane-key', anchor: 'key' },
        ],
      },
    }
    render(<LearningPresentationView presentation={anchored} />)
    const bodyRows = () => [...document.querySelectorAll('tbody tr')]
    expect(bodyRows()).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: 'Round key 1' }))
    const region = screen.getByRole('region', { name: 'Key expansion' })
    const rows = [...region.querySelectorAll('tbody tr')]
    expect(rows.map((row) => row.getAttribute('data-row-id'))).toEqual(['input', 'output', null, 'key'])
    expect(rows.map((row) => row.querySelector('[data-lane-row]')?.getAttribute('data-lane-row'))).toEqual(['lane-input', 'lane-rot', 'lane-sub', 'lane-key'])
    expect(rows[1]).toHaveTextContent('RotWord 1')
    const laneCells = rows.map((row) => row.querySelector<HTMLElement>('[data-lane-row]')!)
    expect(laneCells.every((cell) => cell.dataset.lane === 'true' && cell.style.backgroundColor)).toBe(true)
    expect(laneCells[0].style.borderTop).toContain('solid')
    expect(laneCells[3].style.borderBottom).toContain('solid')
    expect(laneCells[1].style.borderTop).toBe('')
    expect(rows[3].querySelector('[data-lane-row]')).not.toContainElement(screen.getByRole('button', { name: 'Round key 1' }))
    expect(screen.queryByRole('button', { name: 'Input bit 0' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Round key 1' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Close key expansion' }))
    expect(bodyRows().map((row) => row.getAttribute('data-row-id'))).toEqual(['input', 'output', 'key'])
    expect(screen.getByRole('button', { name: 'Input bit 0' })).toBeVisible()
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

  it('keeps single-bit lineage narrow and expands only on explicit nibble selection', () => {
    const nibbleLineage: LearningPresentation = {
      title: 'Nibble lineage',
      sections: [{
        kind: 'trace',
        caption: 'Nibble lineage',
        headers: [],
        rows: [{
          id: 'trace',
          label: 'Trace',
          cells: [],
          relationships: Array.from({ length: 8 }, (_, bit) => ({ from: `input-${bit}`, to: `output-${bit}` })),
        }],
      }],
    }

    expect([...relatedBitIds(nibbleLineage, 'input-5')].sort()).toEqual(['input-5', 'output-5'])

    const explicitNibbleSeeds = [4, 5, 6, 7].map((bit) => `input-${bit}`)
    const explicitNibbleLineage = new Set(explicitNibbleSeeds.flatMap((seed) => [...relatedBitIds(nibbleLineage, seed)]))
    expect([...explicitNibbleLineage].sort()).toEqual([
      'input-4', 'input-5', 'input-6', 'input-7', 'output-4', 'output-5', 'output-6', 'output-7',
    ])
    expect(explicitNibbleLineage.has('input-3')).toBe(false)
    expect(explicitNibbleLineage.has('output-3')).toBe(false)
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

  it('draws each visible group pair once and emphasizes every deliberately selected source bit (#109)', () => {
    render(<LineageDiagram aggregate height={80} width={120}
      locations={new Map([
        ['input-0', { x: 20, y: 20 }], ['input-1', { x: 20, y: 20 }], ['input-2', { x: 40, y: 20 }],
        ['output-0', { x: 60, y: 60 }], ['output-1', { x: 60, y: 60 }], ['output-2', { x: 100, y: 60 }],
      ])}
      relationships={[
        { from: 'input-0', to: 'output-0' }, { from: 'input-1', to: 'output-1' },
        { from: 'input-1', to: 'output-2' }, { from: 'input-2', to: 'output-1' },
      ]}
      related={new Set(['input-0', 'input-1', 'output-0', 'output-1', 'output-2'])}
      selected={{ kind: 'bit', id: 'input-0', bitIds: ['input-0', 'input-1'] }}
    />)
    const svg = document.querySelector('svg[data-lineage]')!
    const segments = [...svg.querySelectorAll('path')].flatMap((path) => path.getAttribute('d')!.match(/M[^M]+/g)!.map((segment) => segment.trim()))
    expect(segments.sort()).toEqual(['M20,20L100,60', 'M20,20L60,60', 'M40,20L60,60'])
    expect(svg.querySelector('path[data-state="selected"]')).toHaveAttribute('d', 'M20,20L60,60 M20,20L100,60')
    expect(svg.querySelector('path[data-state="default"]')).toHaveAttribute('d', 'M40,20L60,60')
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


describe('Hexadecimal value display', () => {
  it.each([
    { value: '0x00010203', bytes: ['00', '01', '02', '03'] },
    { value: '0x00a', bytes: ['0', '0a'] },
  ])('separates bytes visually while preserving $value and its accessible label', ({ value, bytes }) => {
    const view = render(<table><tbody><tr><ValueCell ariaLabel="Round key value">{value}</ValueCell></tr></tbody></table>)
    const cell = view.getByRole('cell', { name: 'Round key value' })
    expect([...cell.querySelectorAll('.learning-hex-byte')].map((byte) => byte.textContent)).toEqual(bytes)
    expect(cell.textContent).toBe(value)
  })
})
