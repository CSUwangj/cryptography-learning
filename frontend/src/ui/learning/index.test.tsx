import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { ComparisonRow, TraceTable, ValueCell } from '.'

const fixtures = [
  {
    locale: 'en-US',
    caption: 'Cipher trace',
    stage: 'Stage',
    baseline: 'Baseline',
    changedHeader: 'Changed',
    changed: 'B',
    selected: 'C',
    selectedName: 'Inspect C',
  },
  {
    locale: 'zh-CN',
    caption: '密码轨迹',
    stage: '阶段',
    baseline: '基准',
    changedHeader: '改变后',
    changed: '乙',
    selected: '丙',
    selectedName: '检查丙',
  },
] as const

describe('Learning presentation primitives', () => {
  it.each(fixtures)('renders $locale caller-provided trace content and states', ({ caption, stage, baseline, changedHeader, changed, selected, selectedName }) => {
    render(
      <TraceTable caption={caption} headers={[stage, baseline, changedHeader]}>
        <ComparisonRow label={stage}>
          <ValueCell state="changed">{changed}</ValueCell>
          <ValueCell ariaLabel={selectedName} onSelect={() => undefined} state="selected">
            {selected}
          </ValueCell>
        </ComparisonRow>
      </TraceTable>,
    )

    expect(screen.getByRole('table', { name: caption })).toHaveAccessibleName(caption)
    expect(screen.getByRole('columnheader', { name: stage })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: baseline })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: changedHeader })).toBeVisible()
    expect(screen.getByText(changed)).toBeVisible()
    expect(screen.getByText(changed).closest('td')).toHaveAttribute('data-state', 'changed')
    expect(screen.getByText(selected)).toBeVisible()
    expect(screen.getByRole('button', { name: selectedName })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: selectedName })).toHaveAttribute('data-state', 'selected')
  })
})
