import { expect, test } from '@playwright/test'

// Full traces use the existing dense-demo approach: screenshots without per-action DOM recording.
test.use({ trace: 'off' })

for (const direction of ['encrypt', 'decrypt'] as const) {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    test(`explains ${locale} ${direction} key change and opens its complete overlay from the real demo (#144)`, async ({ page }, testInfo) => {
      test.setTimeout(180000)
      test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses the local demo document service and actual Worker')
      const zh = locale === 'zh-CN'
      const encrypt = direction === 'encrypt'
      const title = zh ? `AES-128 密钥变化与${encrypt ? '加密' : '解密'}叠加` : `AES-128 key-change ${encrypt ? 'encryption' : 'decryption'} overlay`
      const next = zh ? '下一步' : 'Next'
      const show = zh ? '显示密钥编排' : 'Show key schedule'
      const close = zh ? '关闭密钥编排' : 'Close key schedule'
      const fixed = encrypt ? '0x00112233445566778899aabbccddeeff' : '0x69c4e0d86a7b0430d8cdb78070b4c55a'
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
      await page.goto(new URL(`/learning?lang=${locale}`, process.env.PLAYWRIGHT_DEMO_BASE_URL).href, { waitUntil: 'networkidle' })
      const entry = page.getByRole('link', { name: title, exact: true })
      await expect(entry).toBeVisible({ timeout: 60000 })
      await entry.click()
      await expect(page).toHaveURL(new RegExp(`/learning/aes128-key-change-${direction}$`))
      await page.reload()
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
      const prose = page.locator('[data-learning-page] > .learning-prose').last()
      await expect(prose).toContainText(zh ? '数据位雪崩示例改变消息' : 'The data-bit avalanche example changes the message')
      await expect(prose).toContainText(fixed)
      await expect(page.getByRole('textbox', { name: zh ? '原始密钥' : 'Original key', exact: true })).toHaveValue('0x000102030405060708090a0b0c0d0e0f')
      await page.getByRole('button', { name: next, exact: true }).click()
      await expect(prose).toContainText(zh ? '点击下一步进入' : 'Choose Next to reach', { timeout: 60000 })
      await expect(prose).toContainText(zh ? '派生轮密钥可以有多个位不同' : 'Derived round keys may differ in many bits')
      const comparison = page.getByRole('region', { name: zh ? '执行比较' : 'Execution comparison', exact: true })
      const summary = page.getByRole('table', { name: zh ? '比较摘要' : 'Comparison summary', exact: true })
      await expect(summary.locator('[data-row-id="round-key-10.value"]')).toContainText('0x13111d7fe3944a17f307a78b4d2b30c5')
      await page.getByRole('button', { name: next, exact: true }).click()
      await expect(prose).toContainText(show, { timeout: 60000 })
      await expect(prose).toContainText(zh ? '工具栏' : 'toolbar')
      const output = encrypt ? 'add-round-key-10.value' : 'add-round-key-0.value'
      expect((await summary.locator(`[data-row-id="${output}"]`).getByRole('cell').allTextContents()).slice(0, 2)).toEqual(encrypt
        ? ['0x69c4e0d86a7b0430d8cdb78070b4c55a', '0xae175e68d1e005092e0bf7a4d354c485']
        : ['0x00112233445566778899aabbccddeeff', '0x60b007735cc26f1cb38807c28ff08acd'])
      expect((await summary.locator(`[data-row-id="${encrypt ? 'plaintext' : 'ciphertext'}.value"]`).getByRole('cell').allTextContents()).slice(0, 2)).toEqual([fixed, fixed])
      await expect(comparison.locator('[data-lane-row]')).toHaveCount(0)
      await expect(comparison.getByRole('combobox')).toHaveValue('1')
      await comparison.getByRole('combobox').selectOption('32')
      await comparison.getByRole('toolbar').getByRole('button', { name: show, exact: true }).click()
      await expect(comparison.getByRole('combobox').nth(1)).toHaveValue('1')
      await comparison.getByRole('combobox').nth(1).selectOption('32')
      const keys = comparison.locator('[data-lane-row^="schedule:round-key-"]')
      await expect(keys).toHaveCount(11)
      expect(await keys.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-lane-row')))).toEqual(
        Array.from({ length: 11 }, (_, index) => `schedule:round-key-${encrypt ? index : 10 - index}.value`),
      )
      await expect(comparison.locator('[data-lane-row]')).toHaveCount(52)
      await expect(comparison.locator('[data-lane-row="schedule:round-key-10.value"]').getByRole('button').first()).toHaveAccessibleName(/0x13111d7fe3944a17f307a78b4d2b30c5 \| 0x865f8873e3da4a1b6607a7874d2b30c9/)
      for (const [width, theme] of [[1440, 'light'], [390, 'dark']] as const) {
        await page.setViewportSize({ width, height: 900 })
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
        await expect(page.locator(`[data-theme="${theme}"]`)).toBeVisible()
        await prose.scrollIntoViewIfNeeded()
        await page.screenshot({ path: testInfo.outputPath(`key-change-${direction}-${locale}-${width}-${theme}-explanation.png`) })
        await comparison.locator('[data-lane-row]').first().scrollIntoViewIfNeeded()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: testInfo.outputPath(`key-change-${direction}-${locale}-${width}-${theme}-overlay.png`) })
      }
      await comparison.getByRole('toolbar').getByRole('button', { name: close, exact: true }).click()
      await expect(comparison.locator('[data-lane-row]')).toHaveCount(0)
      await comparison.locator(`[data-row-id="round-key-${encrypt ? 0 : 10}.value"]`).getByRole('button', { name: show, exact: true }).click()
      await expect(keys).toHaveCount(11)
      expect(errors).toEqual([])
    })
  }
}
