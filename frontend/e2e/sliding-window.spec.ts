import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const demo = process.env.PLAYWRIGHT_DEMO_BASE_URL

test.beforeEach(async ({ page }) => {
  test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses the local demo and real Worker')
  // Reuse the existing warmup to exclude dev-server module transformation from the execution budget.
  await page.goto(`${demo}/`)
  await page.evaluate(async (path) => {
    const fixture = await import(/* @vite-ignore */ `/@fs${path}`)
    await fixture.warmDefaultTraceBrowserWorker()
  }, fileURLToPath(new URL('./v2-default-trace-browser.tsx', import.meta.url)))
})

test('publishes all four actual sliding windows at the existing demo destination (#112)', async ({ page }) => {
  test.setTimeout(120000)
  test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses the local demo and real Worker')
  const workers: string[] = []
  page.on('worker', (worker) => workers.push(worker.url()))
  await page.goto(`${demo}/testkeyexpansion?lang=en-US`, { waitUntil: 'networkidle' })
  await page.getByLabel('Master key', { exact: true }).fill('0x12345678')
  await page.getByRole('button', { name: /^Run/ }).click()
  const schedule = page.getByRole('region', { name: 'Key schedule', exact: true })
  await expect(schedule).toBeVisible()
  expect(workers.some((url) => url.includes('worker'))).toBe(true)
  await expect(schedule.locator('[data-row-id]')).toHaveCount(5)
  for (const [id, value] of [['key', '0x12345678'], ['rk1', '0x1234'], ['rk2', '0x2345'], ['rk3', '0x3456'], ['rk4', '0x4567']]) {
    await expect(schedule.locator(`[data-row-id="${id}.value"]`)).toContainText(value)
  }
  await expect(schedule.getByRole('combobox')).toHaveCount(1)
})

for (const locale of ['en-US', 'zh-CN']) {
  test(`inspects real standalone groups, controls and narrow light/dark layout in ${locale} (#112)`, async ({ page }, testInfo) => {
    const zh = locale === 'zh-CN'
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${demo}/testkeyexpansion?lang=${locale}`, { waitUntil: 'networkidle' })
    await page.getByRole('textbox', { name: zh ? '主密钥' : 'Master key', exact: true }).fill('0x12345678')
    await page.getByRole('button', { name: zh ? '运行密钥调度' : 'Run key schedule', exact: true }).click()
    await expect(page.getByRole('heading', { name: zh ? '滑动窗口密钥调度' : 'Sliding-window key schedule', exact: true })).toBeVisible()
    const schedule = page.locator('.learning-trace').getByRole('region')
    await expect(schedule).toHaveAccessibleName(zh ? '密钥编排' : 'Key schedule')
    const row = (id: string) => schedule.locator(`[data-row-id="${id}.value"]`)
    const mode = schedule.getByRole('combobox')
    await expect(mode).toHaveValue('1')
    await expect(row('key').getByRole('button')).toHaveCount(32)
    const heights = () => schedule.locator('[data-row-id]').evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height))
    const bitHeights = await heights()
    await mode.selectOption('4')
    await expect(mode.locator('option[value="4"]')).toHaveText(zh ? '4 位（半字节）' : '4 bits (nibble)')
    await expect(row('rk2').getByRole('button')).toHaveText(['0x2', '0x3', '0x4', '0x5'])
    await mode.selectOption('8')
    await expect(mode.locator('option[value="8"]')).toHaveText(zh ? '8 位（字节）' : '8 bits (byte)')
    await expect(row('rk2').getByRole('button')).toHaveText(['0x23', '0x45'])
    const selected = row('rk2').getByRole('button').first()
    await selected.focus()
    await selected.press('Enter')
    await expect(selected).toHaveAttribute('aria-pressed', 'true')
    await expect(row('key').locator('button[data-state="related"]')).toHaveCount(2)
    await expect(row('rk1').locator('button[data-state="related"]')).toHaveCount(0)
    await expect(row('rk3').locator('button[data-state="related"]')).toHaveCount(0)
    await expect(row('rk4').locator('button[data-state="related"]')).toHaveCount(0)
    expect(await heights()).toEqual(bitHeights)
    await expect.poll(() => schedule.locator('svg[data-lineage] path').evaluateAll((paths) => {
      const segments = paths.flatMap((path) => path.getAttribute('d')?.match(/M[^M]+/g) ?? [])
      return { total: segments.length, unique: new Set(segments).size }
    })).toEqual({ total: 12, unique: 12 })
    await expect(schedule.locator('details')).toHaveCount(0)
    const desktop = await page.locator('.learning-prose').boundingBox()
    expect(desktop!.width).toBeCloseTo(960, 0)
    expect(desktop!.x).toBeCloseTo(240, 0)
    await page.screenshot({ path: testInfo.outputPath(`${locale}-light-desktop.png`), fullPage: true })

    await page.setViewportSize({ width: 320, height: 844 })
    const narrow = await page.locator('.learning-trace').boundingBox()
    expect(narrow!.x).toBeCloseTo(16, 0)
    expect(narrow!.width).toBeCloseTo(288, 0)
    await expect(selected).toHaveAttribute('aria-pressed', 'true')
    const light = await selected.evaluate((element) => getComputedStyle(element).backgroundColor)
    await page.screenshot({ path: testInfo.outputPath(`${locale}-light-narrow.png`), fullPage: true })
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await expect(page.locator('body')).toHaveClass(/bp6-dark/)
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(32, 43, 51)')
    expect(await selected.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(light)
    await expect(selected).toHaveAttribute('aria-pressed', 'true')
    await page.screenshot({ path: testInfo.outputPath(`${locale}-dark-narrow.png`), fullPage: true })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.screenshot({ path: testInfo.outputPath(`${locale}-dark-desktop.png`), fullPage: true })
    await page.setViewportSize({ width: 320, height: 844 })

    await page.getByRole('combobox', { name: zh ? '语言' : 'Language', exact: true }).selectOption(zh ? 'en-US' : 'zh-CN')
    await expect(page.getByRole('heading', { name: zh ? 'Sliding-window key schedule' : '滑动窗口密钥调度', exact: true })).toBeVisible()
    await expect(mode).toHaveValue('8')
    await expect(selected).toHaveAttribute('aria-pressed', 'true')
    await expect(schedule.getByRole('status')).toContainText('0x23')
    await mode.selectOption('1')
    await expect(schedule.locator('button[aria-pressed="true"]')).toHaveCount(0)
    const last = row('key').getByRole('button').nth(31)
    await last.focus()
    await last.press(' ')
    await expect(last).toBeFocused()
    await expect(last).toHaveAttribute('aria-pressed', 'true')
    expect(await schedule.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.getByRole('textbox').fill('0x01234567')
    await page.getByRole('button', { name: zh ? 'Run key schedule' : '运行密钥调度', exact: true }).click()
    for (const [id, value] of [['key', '0x01234567'], ['rk1', '0x0123'], ['rk2', '0x1234'], ['rk3', '0x2345'], ['rk4', '0x3456']]) {
      await expect(row(id)).toContainText(value)
    }
    await expect(schedule.locator('button[aria-pressed="true"]')).toHaveCount(0)
    await mode.selectOption('8')
    await expect(row('rk1').getByRole('button')).toHaveText(['0x01', '0x23'])
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
}
