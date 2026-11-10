import { expect, test } from '@playwright/test'

for (const locale of ['en-US', 'zh-CN']) {
  test(`opens the Caesar Lesson from the demo catalog in ${locale}`, async ({ page }, testInfo) => {
    test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses the local demo document service and actual Worker')
    const zh = locale === 'zh-CN'
    const title = zh ? '凯撒滚筒' : 'Caesar reels'
    const errors: string[] = []
    const workers: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('worker', (worker) => workers.push(worker.url()))
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.goto(new URL(`/?lang=${locale}`, process.env.PLAYWRIGHT_DEMO_BASE_URL).href)
    await page.getByRole('link', { name: zh ? '学习演示' : 'Learning demos', exact: true }).click()
    await expect(page).toHaveURL(/\/learning$/)
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme })
      await expect(page.locator(`[data-theme="${theme}"]`)).toBeVisible({ timeout: 15_000 })
      await expect(page.getByRole('heading', { level: 3 })).toHaveText(zh ? ['AES', '古典密码', '比较演示'] : ['AES', 'Classical ciphers', 'Comparisons'])
      const classicalCategory = page.locator('section').filter({ has: page.getByRole('heading', { name: zh ? '古典密码' : 'Classical ciphers', exact: true }) })
      await expect(classicalCategory.getByRole('link', { name: title, exact: true })).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath(`learning-catalog-${locale}-${theme}.png`), fullPage: true })
    }
    await page.getByRole('link', { name: title, exact: true }).click()
    await expect(page).toHaveURL(/\/learning\/caesar-v2$/)
    await page.reload()
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: zh ? '下一步' : 'Next', exact: true }).click()
    const outputs = page.getByRole('table', { name: zh ? '图输出' : 'Graph outputs', exact: true })
    await expect(outputs).toContainText('βγ😀 ?')
    expect(workers.some((url) => url.includes('worker'))).toBe(true)
    const control = page.getByRole('slider', { name: zh ? '凯撒位移' : 'Caesar shift', exact: true })
    await control.press('ArrowDown')
    await expect(outputs).toContainText('αβδ ?')
    await expect(control).toBeFocused()
    for (const [width, theme] of [[1280, 'light'], [390, 'dark']] as const) {
      await page.setViewportSize({ width, height: 844 })
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await expect(page.locator(`[data-theme="${theme}"]`)).toBeVisible()
      await expect(control).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`caesar-demo-${locale}-${width}-${theme}.png`), fullPage: true })
    }
    expect(errors).toEqual([])
  })
}
