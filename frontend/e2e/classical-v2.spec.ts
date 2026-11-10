import { expect, test } from '@playwright/test'
import { classicalV2Documents } from '../demos/classicalV2Lessons'

for (const locale of ['en-US', 'zh-CN']) {
  test(`runs all four classical Lessons from the real demo catalog in ${locale} (#146)`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses the local demo document service and actual Worker')
    const zh = locale === 'zh-CN'
    const theme = zh ? 'dark' : 'light'
    const errors: string[] = []
    const workers: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('worker', (worker) => workers.push(worker.url()))
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.setViewportSize({ width: zh ? 390 : 1280, height: 844 })
    for (const example of [
      { kind: 'vigenere', title: zh ? '维吉尼亚密码 v2' : 'vigenere v2', message: 'α?β', encrypted: 'β?δ' },
      { kind: 'affine', title: zh ? '仿射密码 v2' : 'affine v2', message: 'α?β', encrypted: '😀?β' },
      { kind: 'substitution', title: zh ? '替换密码 v2' : 'substitution v2', message: 'α?β', encrypted: '😀?γ' },
      { kind: 'transposition', title: zh ? '列置换密码 v2' : 'transposition v2', message: 'ABCDE', encrypted: 'ADBEC' },
    ]) {
      await page.goto(new URL(`/learning?lang=${locale}`, process.env.PLAYWRIGHT_DEMO_BASE_URL).href)
      await expect(page.getByRole('heading', { name: zh ? '古典密码' : 'Classical ciphers', exact: true })).toBeVisible({ timeout: 15_000 })
      const entry = page.getByRole('link', { name: example.title, exact: true })
      await expect(entry).toBeVisible()
      await entry.click()
      await expect(page).toHaveURL(new RegExp(`/learning/${example.kind}-v2$`))
      await page.reload()
      await expect(page.getByRole('heading', { name: example.title, exact: true })).toBeVisible({ timeout: 15_000 })
      await page.getByRole('textbox', { name: zh ? '消息' : 'Message', exact: true }).fill(example.message)
      const next = page.getByRole('button', { name: zh ? '下一步' : 'Next', exact: true })
      await next.click()
      const outputs = page.getByRole('table', { name: zh ? '图输出' : 'Graph outputs', exact: true })
      await expect(outputs).toContainText(example.encrypted)
      const presentation = page.getByRole('region', { name: example.kind === 'transposition'
        ? (zh ? '转置网格' : 'Transposition grid')
        : (zh ? '古典密码位置映射' : 'Classical cipher position mapping'), exact: true })
      await expect(presentation).toBeVisible()
      if (example.kind === 'vigenere') await expect(presentation.getByText(zh ? '密钥：β' : 'Key: β', { exact: true })).toBeVisible()
      if (example.kind === 'affine') await expect(page.getByLabel(zh ? '仿射公式' : 'Affine formula', { exact: true })).toContainText('a = 2, b = -1')
      if (example.kind === 'substitution') await expect(presentation.getByText('α → 😀', { exact: true })).toBeVisible()
      if (example.kind === 'transposition') await expect(presentation.getByRole('cell', { name: zh ? '空单元格' : 'Empty cell', exact: true })).toBeVisible()
      await expect(page.locator(`[data-theme="${theme}"]`)).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`demo-${example.kind}-${locale}-${theme}.png`), fullPage: true })
      if (example.kind !== 'affine') {
        await next.click()
        await expect(outputs).toContainText(example.message)
        await expect(presentation).toBeVisible()
      }
    }
    expect(workers.some((url) => url.includes('worker'))).toBe(true)
    expect(errors).toEqual([])
  })
}

for (const copy of [
  { locale: 'en-US', message: 'Message', key: 'Key', next: 'Next', previous: 'Previous', region: 'Classical cipher position mapping', outputs: 'Graph outputs', keySymbol: 'Key: β', unmapped: 'Unmapped', noKey: 'No key consumed' },
  { locale: 'zh-CN', message: '消息', key: '密钥', next: '下一步', previous: '上一步', region: '古典密码位置映射', outputs: '图输出', keySymbol: '密钥：β', unmapped: '未映射', noKey: '不消耗密钥' },
]) {
  test(`wraps real v2 classical mappings with accessible key alignment in ${copy.locale} (#146)`, async ({ page }, testInfo) => {
    const documents = classicalV2Documents('vigenere')
    const reducedMotion = copy.locale === 'zh-CN' ? 'reduce' : 'no-preference'
    await page.emulateMedia({ colorScheme: 'light', reducedMotion })
    await page.addInitScript((locale) => {
      localStorage.setItem('i18nextLng', locale)
      localStorage.removeItem('cryptography-learning-theme')
    }, copy.locale)
    await page.route('**/query', async (route) => {
      const operation = route.request().postDataJSON()
      if (operation.operationName === 'LearningCatalog') {
        return route.fulfill({ json: { data: { learning: { lessonCategories: [] } } } })
      }
      if (operation.operationName !== 'LessonDocuments') throw new Error(`Unexpected operation: ${operation.operationName}`)
      await route.fulfill({ json: { data: { lessonDocuments: {
        lesson: documents.lesson, locale: documents.locales[operation.variables.language] ?? null,
      } } } })
    })
    const errors: string[] = []
    const workers: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('worker', (worker) => workers.push(worker.url()))
    await page.goto('/learning/vigenere-v2')
    await page.getByRole('textbox', { name: copy.message, exact: true }).fill('αβ'.repeat(12) + ' ?')
    await expect(page.getByRole('textbox', { name: copy.key, exact: true })).toHaveValue('βγ')
    const next = page.getByRole('button', { name: copy.next, exact: true })
    await next.focus()
    await next.press('Enter')
    await expect(page.getByRole('table', { name: copy.outputs, exact: true })).toContainText('βδ'.repeat(12) + ' ?')
    expect(workers.some((url) => url.includes('worker'))).toBe(true)
    const region = page.getByRole('region', { name: copy.region, exact: true })
    await expect(region.getByText(copy.keySymbol, { exact: true }).first()).toBeVisible()
    await expect(region.getByText(copy.unmapped, { exact: true })).toHaveCount(2)
    await expect(region.getByText(copy.noKey, { exact: true })).toHaveCount(2)
    await expect(region.getByRole('slider')).toHaveCount(0)
    await expect(region.locator('[aria-current]')).toHaveCount(0)
    await expect(region.getByRole('group', { name: copy.locale === 'en-US' ? 'α at 0 maps to β at 1' : 'α 在位置 0 映射到位置 1 的 β' }).first()).toBeVisible()

    const colors: string[] = []
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 })
      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme, reducedMotion })
        await expect(page.locator(`[data-theme="${theme}"]`)).toBeVisible()
        const cells = await region.locator('[data-mapped]').evaluateAll((elements) => elements.map((element) => {
          const box = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          return { x: box.x, right: box.right, y: box.y, animations: element.getAnimations({ subtree: true }).length, colors: `${style.color}/${style.backgroundColor}` }
        }))
        expect(Math.abs(cells[0].y - cells[1].y)).toBeLessThan(1)
        expect(cells[1].x).toBeGreaterThan(cells[0].right)
        if (width === 390) expect(cells.some((cell) => cell.y > cells[0].y + 1)).toBe(true)
        expect(cells.every((cell) => cell.animations === 0)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        colors.push(cells[0].colors)
        await page.screenshot({ path: testInfo.outputPath(`classical-${copy.locale}-${width}-${theme}.png`), fullPage: true })
      }
    }
    expect(colors[0]).not.toBe(colors[1])
    expect(colors[2]).not.toBe(colors[3])
    const previous = page.getByRole('button', { name: copy.previous, exact: true })
    await previous.focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')
    await expect(previous).toBeFocused()
    expect(await previous.evaluate((element) => {
      const style = getComputedStyle(element)
      return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0
    })).toBe(true)
    await previous.press('Enter')
    await expect(page.getByRole('textbox', { name: copy.key, exact: true })).toHaveValue('βγ')
    expect(errors).toEqual([])
  })
}
