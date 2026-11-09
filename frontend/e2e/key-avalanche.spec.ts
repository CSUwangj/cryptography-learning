import { expect, test } from '@playwright/test'

test('inspects a real standalone original-key schedule in both locales and themes (#143)', async ({ page }, testInfo) => {
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
  await page.goto(new URL('/learning/key-avalanche', process.env.PLAYWRIGHT_DEMO_BASE_URL).href)
  await expect(page.getByRole('heading', { name: 'Inspect one original-key bit', exact: true })).toBeVisible({ timeout: 15000 })
  expect(await requests()).toBe(0)
  const next = page.getByRole('button', { name: 'Next', exact: true })
  await next.focus()
  await next.press('Enter')
  const comparison = () => page.getByRole('region', { name: /^(Execution comparison|执行比较)$/ })
  const row = (id: string) => comparison().locator(`[data-row-id="${id}.value"]`).first()
  await expect(comparison()).toBeVisible()
  await expect(comparison().getByRole('combobox')).toHaveValue('1')
  await expect(row('key').getByRole('button').first()).toHaveAttribute('aria-pressed', 'true')
  await expect(row('key')).toContainText('0x000102030405060708090a0b0c0d0e0f | 0x800102030405060708090a0b0c0d0e0f')
  await expect(page.getByRole('table', { name: 'Comparison summary', exact: true }).getByRole('row', { name: /round-key-1.value/ })).toContainText('0.03125')
  expect(await requests()).toBe(1)
  await comparison().getByRole('combobox').selectOption('8')
  await expect(comparison().locator('button[aria-pressed="true"]')).toHaveCount(0)
  const inspect = () => row('key').getByRole('button').nth(2)
  await inspect().focus()
  await inspect().press(' ')
  await expect(inspect()).toHaveAttribute('aria-pressed', 'true')
  await expect(inspect()).toBeFocused()
  await expect(inspect()).toHaveAccessibleName(/Baseline: 0x02; Changed: 0x02; Deliberately selected/)
  await expect(inspect().locator('u')).toHaveCount(0)
  const difference = () => row('round-key-1').getByRole('button').nth(4)
  await expect(difference()).toHaveAttribute('data-state', 'changed')
  await expect(difference().locator('u')).toHaveText('0xd2|0x52')

  for (const locale of ['en-US', 'zh-CN']) {
    if (locale === 'zh-CN') {
      await page.getByRole('button', { name: 'Language', exact: true }).click()
      await page.getByRole('option', { name: /zh-CN/ }).click()
      await expect(page.getByRole('table', { name: '比较摘要', exact: true })).toBeVisible()
      await expect(inspect()).toHaveAccessibleName(/基准执行: 0x02; 改变后执行: 0x02/)
    }
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 })
      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
        await expect(page.locator(`[data-theme="${theme}"]`)).toBeVisible()
        await expect(inspect()).toHaveAttribute('aria-pressed', 'true')
        await expect(comparison().getByRole('combobox')).toHaveValue('8')
        await inspect().scrollIntoViewIfNeeded()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        if (width === 390) {
          expect(await comparison().evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
          await comparison().evaluate((element) => { element.scrollLeft = element.scrollWidth })
          expect(await comparison().evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
          await inspect().scrollIntoViewIfNeeded()
        }
        await page.screenshot({ path: testInfo.outputPath(`key-avalanche-${locale}-${width}-${theme}.png`) })
      }
    }
  }
  expect(await requests()).toBe(1)
  await page.getByRole('button', { name: '上一步', exact: true }).click()
  await page.getByRole('textbox', { name: '原始密钥', exact: true }).fill('0x00000000000000000000000000000001')
  const bit = page.getByLabel('翻转位（从最高位 0 开始）', { exact: true })
  await bit.focus()
  await bit.press('Home')
  await bit.press('ArrowDown')
  await expect(bit).toHaveValue('1')
  await expect(page.locator('fieldset dd')).toHaveText('0x00000000000000000000000000000001 / 0x40000000000000000000000000000001')
  expect(await requests()).toBe(1)
  const replacement = page.getByRole('button', { name: '下一步', exact: true })
  await replacement.focus()
  await replacement.press('Enter')
  await expect(comparison().getByRole('combobox')).toHaveValue('1')
  await expect(row('key').getByRole('button').nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(comparison().locator('button[aria-pressed="true"]')).toHaveCount(1)
  expect(await requests()).toBe(2)
  expect(errors).toEqual([])
})
