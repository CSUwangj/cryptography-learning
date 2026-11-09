import { expect, test } from '@playwright/test'

test('constructs and executes a v2 data avalanche by keyboard in both locales (#142)', async ({ page }, testInfo) => {
  test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses the public synthetic demo document service')
  await page.addInitScript(() => {
    localStorage.setItem('i18nextLng', 'en-US')
    localStorage.removeItem('cryptography-learning-theme')
    const state = window as Window & { comparisonRequests: number }
    state.comparisonRequests = 0
    const send = Worker.prototype.postMessage
    Worker.prototype.postMessage = function (message: unknown) {
      if (typeof message === 'object' && message !== null && 'kind' in message && message.kind === 'compare') state.comparisonRequests += 1
      send.call(this, message)
    }
  })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const requests = () => page.evaluate(() => (window as Window & { comparisonRequests: number }).comparisonRequests)
  await page.goto(new URL('/learning/data-avalanche', process.env.PLAYWRIGHT_DEMO_BASE_URL).href)
  await expect(page.getByRole('heading', { name: 'Change one data bit', exact: true })).toBeVisible({ timeout: 15000 })

  for (const [index, copy] of [
    { locale: 'en-US', source: 'Change source', bit: 'Flip bit (MSB-first, starting at 0)', next: 'Next', region: 'Execution comparison', summary: 'Comparison summary', origin: 'other', position: 1 },
    { locale: 'zh-CN', source: '变化来源', bit: '翻转位（从最高位 0 开始）', next: '下一步', region: '执行比较', summary: '比较摘要', origin: 'data', position: 2 },
  ].entries()) {
    const source = page.getByLabel(copy.source, { exact: true })
    await source.focus()
    await expect(source).toBeFocused()
    await source.press(index === 0 ? 'End' : 'Home')
    await expect(source).toHaveValue(copy.origin)
    const bit = page.getByLabel(copy.bit, { exact: true })
    await bit.focus()
    await bit.press('Home')
    for (let position = 0; position < copy.position; position += 1) await bit.press('ArrowDown')
    await expect(bit).toHaveValue(String(copy.position))
    await expect(bit).toBeFocused()
    if (index === 1) await page.getByRole('textbox', { name: '第一组数据输入', exact: true }).fill('0x01')
    await expect(page.locator('fieldset dd').nth(index === 0 ? 1 : 0)).toHaveText(index === 0 ? '0x00 / 0x40' : '0x01 / 0x21')
    expect(await requests()).toBe(index)
    const next = page.getByRole('button', { name: copy.next, exact: true })
    await next.focus()
    await next.press('Enter')
    const comparison = page.getByRole('region', { name: copy.region, exact: true })
    await expect(comparison).toBeVisible()
    expect(await requests()).toBe(index + 1)
    const row = (id: string) => comparison.locator(`[data-row-id="${id}.value"]`).first()
    await expect(comparison.getByRole('combobox')).toHaveValue('1')
    await expect(row(copy.origin).getByRole('button').nth(copy.position)).toHaveAttribute('aria-pressed', 'true')
    const summary = page.getByRole('table', { name: copy.summary, exact: true })
    await expect(summary.getByRole('row', { name: new RegExp(`${copy.origin}.value`) })).toContainText(index === 0 ? '0x40' : '0x20')
    await expect(summary.getByRole('row', { name: /key.value/ }).getByRole('cell').nth(3)).toHaveText('0')
    const inspect = row(index === 0 ? 'data' : 'other').getByRole('button').nth(7)
    await inspect.focus()
    await inspect.press(' ')
    await expect(inspect).toHaveAttribute('aria-pressed', 'true')
    await expect(comparison.locator('button[aria-pressed="true"]')).toHaveCount(1)
    const difference = row('result').getByRole('button').nth(index === 0 ? 0 : 1)
    await expect(difference).toHaveAttribute('data-state', 'changed')
    await expect(difference.locator('u')).toBeVisible()
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 })
      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
        await expect(page.locator(`[data-theme="${theme}"]`)).toBeVisible()
        await expect(inspect).toHaveAttribute('aria-pressed', 'true')
        await inspect.scrollIntoViewIfNeeded()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        if (width === 390) expect(await comparison.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
        await page.screenshot({ path: testInfo.outputPath(`avalanche-${copy.locale}-${width}-${theme}.png`) })
      }
    }
    expect(await requests()).toBe(index + 1)
    if (index === 0) {
      await page.getByRole('button', { name: 'Language', exact: true }).click()
      await page.getByRole('option', { name: /zh-CN/ }).click()
      const translated = page.getByRole('region', { name: '执行比较', exact: true })
      await expect(translated).toBeVisible()
      await expect(translated.locator('[data-row-id="data.value"]').first().getByRole('button').nth(7)).toHaveAttribute('aria-pressed', 'true')
      expect(await requests()).toBe(1)
      await page.getByRole('button', { name: '上一步', exact: true }).click()
    }
  }
  expect(errors).toEqual([])
})
