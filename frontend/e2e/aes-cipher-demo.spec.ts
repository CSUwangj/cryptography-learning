import { expect, test } from '@playwright/test'

test('renders independently specified AES-width rows with scrollable, aligned lineage', async ({ page }) => {
  test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses the synthetic renderer fixture')
  await page.setViewportSize({ width: 900, height: 700 })
  await page.goto('/')

  for (const width of [128, 192, 256] as const) {
    await page.evaluate(async (width) => {
      const current = (window as Window & { __aesFixture?: { unmount: () => void } }).__aesFixture
      current?.unmount()
      const fixture = await import('/e2e/aes-learning-fixture.tsx')
      const root = fixture.mountAesFixture(fixture.aesFixturePresentation(width))
      ;(window as Window & { __aesFixture?: { unmount: () => void } }).__aesFixture = root
    }, width)

    const region = page.getByRole('region', { name: `AES-${width} fixture` })
    await expect(region).toBeVisible()
    const rows = ['input', 'mixed', 'output', 'unrelated'] as const
    const expected = Array.from({ length: width }, (_, bit) => bit % 2 ? '1' : '0').join('')
    for (const id of rows) {
      const row = region.locator(`tr[data-row-id="${id}"]`)
      const rowLabels = {
        input: `AES-${width} input`,
        mixed: 'Fan-in and fan-out',
        output: 'Output',
        unrelated: 'Unrelated path',
      } as const
      await expect(row.locator('button')).toHaveCount(width)
      expect(await row.locator('button').evaluateAll((buttons) => buttons.map((button) => button.textContent).join(''))).toBe(expected)
      await expect(row.locator('[data-bit-group]')).toHaveCount(width / 8)
      expect(await row.locator('[data-bit-group]').evaluateAll((groups) => groups.map((group) => [
        ...group.querySelectorAll('button'),
      ].map((button) => button.textContent).join('')))).toEqual(
        Array.from({ length: width / 8 }, (_, group) => expected.slice(group * 8, group * 8 + 8)),
      )
      expect(await row.locator('button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))).toEqual(
        Array.from({ length: width }, (_, bit) => `${rowLabels[id]}, Bit ${bit}: ${expected[bit]}`),
      )
    }
    expect(await region.locator('button[aria-pressed="true"]').count()).toBe(0)
    await expect(region.locator('svg[data-lineage] line')).toHaveCount(6)

    const geometry = await region.evaluate((root) => {
      const container = root.querySelector('div[style*="position: relative"]')!
      const bounds = container.getBoundingClientRect()
      const rows = ['input', 'mixed', 'output', 'unrelated']
      const columns = rows.map((id) => [...root.querySelectorAll<HTMLButtonElement>(`tr[data-row-id="${id}"] button`)]
        .map((button) => button.getBoundingClientRect().left - bounds.left + button.getBoundingClientRect().width / 2))
      const svg = root.querySelector('svg[data-lineage]')!
      const lines = [...svg.querySelectorAll('line')].map((line) => [
        Number(line.getAttribute('x1')), Number(line.getAttribute('y1')),
        Number(line.getAttribute('x2')), Number(line.getAttribute('y2')),
      ])
      return { columns, lines }
    })
    for (const columns of geometry.columns.slice(1)) expect(columns).toEqual(geometry.columns[0])

    const endpoint = async (row: string, bit: number) => region.locator(`tr[data-row-id="${row}"] button`).nth(bit).boundingBox()
    const expectedEdges = [['input', 0, 'mixed', 0], ['input', 1, 'mixed', 0], ['mixed', 0, 'output', 0], ['input', 2, 'unrelated', 2], ['input', 3, 'mixed', 1], ['input', 3, 'output', 1]] as const
    for (const [index, [fromRow, fromBit, toRow, toBit]] of expectedEdges.entries()) {
      const from = await endpoint(fromRow, fromBit)
      const to = await endpoint(toRow, toBit)
      expect(geometry.lines[index]).toEqual([
        expect.closeTo((from?.x ?? 0) - ((await region.locator('svg').boundingBox())?.x ?? 0) + (from?.width ?? 0) / 2, 0),
        expect.closeTo((from?.y ?? 0) - ((await region.locator('svg').boundingBox())?.y ?? 0) + (from?.height ?? 0) / 2, 0),
        expect.closeTo((to?.x ?? 0) - ((await region.locator('svg').boundingBox())?.x ?? 0) + (to?.width ?? 0) / 2, 0),
        expect.closeTo((to?.y ?? 0) - ((await region.locator('svg').boundingBox())?.y ?? 0) + (to?.height ?? 0) / 2, 0),
      ])
    }

    const selected = region.locator(`tr[data-row-id="input"] button`).nth(0)
    await selected.focus()
    await page.keyboard.press('Enter')
    await expect(selected).toHaveAttribute('aria-pressed', 'true')
    const assertStates = async (expected: Record<string, { readonly selected?: readonly number[]; readonly related?: readonly number[] }>) => {
      for (const row of rows) {
        const states = Array.from({ length: width }, () => 'default')
        for (const bit of expected[row]?.related ?? []) states[bit] = 'related'
        for (const bit of expected[row]?.selected ?? []) states[bit] = 'selected'
        expect(await region.locator(`tr[data-row-id="${row}"] button`).evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-state')))).toEqual(states)
      }
    }
    const assertEdgeStates = async (expected: readonly (readonly [string, number, string, number, string])[]) => {
      const actual = await region.evaluate((root, expectedEdges) => {
        const container = root.querySelector('div[style*="position: relative"]')!
        const bounds = container.getBoundingClientRect()
        const point = (row: string, bit: number): readonly [number, number] => {
          const button = root.querySelectorAll<HTMLButtonElement>(`tr[data-row-id="${row}"] button`)[bit]!
          const box = button.getBoundingClientRect()
          return [box.left - bounds.left + box.width / 2, box.top - bounds.top + box.height / 2]
        }
        const lines = [...root.querySelectorAll<SVGLineElement>('svg[data-lineage] line')]
        return expectedEdges.map(([fromRow, fromBit, toRow, toBit]) => {
          const [fromX, fromY] = point(fromRow, fromBit)
          const [toX, toY] = point(toRow, toBit)
          return lines.find((line) => (
            Math.abs(Number(line.getAttribute('x1')) - fromX) < 0.5
            && Math.abs(Number(line.getAttribute('y1')) - fromY) < 0.5
            && Math.abs(Number(line.getAttribute('x2')) - toX) < 0.5
            && Math.abs(Number(line.getAttribute('y2')) - toY) < 0.5
          ))?.getAttribute('data-state')
        })
      }, expected)
      expect(actual).toEqual(expected.map(([, , , , state]) => state))
    }
    await assertStates({ input: { selected: [0] }, mixed: { related: [0] }, output: { related: [0] }, unrelated: {} })
    await assertEdgeStates([
      ['input', 0, 'mixed', 0, 'selected'],
      ['input', 1, 'mixed', 0, 'default'],
      ['mixed', 0, 'output', 0, 'related'],
      ['input', 2, 'unrelated', 2, 'default'],
      ['input', 3, 'mixed', 1, 'default'],
      ['input', 3, 'output', 1, 'default'],
    ])
    await expect(region.locator('svg[data-lineage] line[data-state="selected"]')).toHaveCount(1)
    await expect(region.locator('svg[data-lineage] line[data-state="related"]')).toHaveCount(1)
    await expect(region.locator('svg[data-lineage] line[data-state="default"]')).toHaveCount(4)
    await expect(region.locator('tr[data-row-id="unrelated"] button').nth(2)).toHaveAttribute('data-state', 'default')

    const fanIn = region.locator('tr[data-row-id="output"] button').nth(0)
    await fanIn.focus()
    await page.keyboard.press('Enter')
    await expect(fanIn).toHaveAttribute('aria-pressed', 'true')
    await assertStates({ input: { related: [0, 1] }, mixed: { related: [0] }, output: { selected: [0] }, unrelated: {} })
    await assertEdgeStates([
      ['input', 0, 'mixed', 0, 'related'],
      ['input', 1, 'mixed', 0, 'related'],
      ['mixed', 0, 'output', 0, 'selected'],
      ['input', 2, 'unrelated', 2, 'default'],
      ['input', 3, 'mixed', 1, 'default'],
      ['input', 3, 'output', 1, 'default'],
    ])

    const fanout = region.locator('tr[data-row-id="input"] button').nth(3)
    await fanout.focus()
    await page.keyboard.press('Enter')
    await expect(fanout).toHaveAttribute('aria-pressed', 'true')
    await assertStates({ input: { selected: [3] }, mixed: { related: [1] }, output: { related: [1] }, unrelated: {} })
    await assertEdgeStates([
      ['input', 0, 'mixed', 0, 'default'],
      ['input', 1, 'mixed', 0, 'default'],
      ['mixed', 0, 'output', 0, 'default'],
      ['input', 2, 'unrelated', 2, 'default'],
      ['input', 3, 'mixed', 1, 'selected'],
      ['input', 3, 'output', 1, 'selected'],
    ])
    await expect(region.locator('svg[data-lineage] line[data-state="selected"]')).toHaveCount(2)
    await expect(region.locator('tr[data-row-id="mixed"] button').nth(1)).toHaveAttribute('data-state', 'related')
    await expect(region.locator('tr[data-row-id="output"] button').nth(1)).toHaveAttribute('data-state', 'related')
    await expect(region.locator('tr[data-row-id="unrelated"] button').nth(2)).toHaveAttribute('data-state', 'default')

    const lastBit = region.locator(`tr[data-row-id="input"] button`).nth(width - 1)
    await lastBit.scrollIntoViewIfNeeded()
    const scrolledGeometry = await region.evaluate((root) => {
      const container = root.querySelector('div[style*="position: relative"]')!
      const bounds = container.getBoundingClientRect()
      const svg = root.querySelector('svg[data-lineage]')!
      const lines = [...svg.querySelectorAll('line')].map((line) => [
        Number(line.getAttribute('x1')), Number(line.getAttribute('y1')),
        Number(line.getAttribute('x2')), Number(line.getAttribute('y2')),
      ])
      const endpoints = [['input', 0], ['mixed', 0], ['input', 1], ['mixed', 0], ['mixed', 0], ['output', 0], ['input', 2], ['unrelated', 2], ['input', 3], ['mixed', 1], ['input', 3], ['output', 1]] as const
      const points = endpoints.map(([row, bit]) => {
        const button = root.querySelectorAll<HTMLButtonElement>(`tr[data-row-id="${row}"] button`)[bit]!
        const box = button.getBoundingClientRect()
        return [box.left - bounds.left + box.width / 2, box.top - bounds.top + box.height / 2]
      })
      const expected = []
      for (let edge = 0; edge < endpoints.length; edge += 2) expected.push([points[edge][0], points[edge][1], points[edge + 1][0], points[edge + 1][1]])
      const byCoordinates = (a: number[], b: number[]) => {
        for (let coordinate = 0; coordinate < a.length; coordinate++) {
          const difference = a[coordinate] - b[coordinate]
          if (difference !== 0) return difference
        }
        return 0
      }
      return { lines: lines.sort(byCoordinates), expected: expected.sort(byCoordinates) }
    })
    const initialLines = [...geometry.lines].sort((a, b) => {
      for (let coordinate = 0; coordinate < a.length; coordinate++) {
        const difference = a[coordinate] - b[coordinate]
        if (difference !== 0) return difference
      }
      return 0
    })
    expect(scrolledGeometry.lines).toEqual(initialLines)
    for (const [index, line] of scrolledGeometry.lines.entries()) expect(line.every((value, coordinate) => Math.abs(value - scrolledGeometry.expected[index][coordinate]) < 1)).toBe(true)
    await lastBit.focus()
    await page.keyboard.press('Enter')
    await expect(lastBit).toHaveAttribute('aria-pressed', 'true')
    expect(await region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
  }
})
