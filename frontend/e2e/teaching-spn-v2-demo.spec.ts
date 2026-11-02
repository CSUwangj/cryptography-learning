import { expect, test } from '@playwright/test'
import { parse, stringify } from 'yaml'
import type { AuthoredNode } from '../src/crypto_graph'
import { teachingSpnV2DemoDocuments } from '../demos/teachingSpnV2Lesson'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`publishes four-round v2 Learning with exact selection in ${locale} (#111)`, async ({ page }, testInfo) => {
    test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses the local demo application')
    const zh = locale === 'zh-CN'
    await page.addInitScript((language) => {
      localStorage.setItem('i18nextLng', language)
      localStorage.removeItem('cryptography-learning-theme')
    }, locale)
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    const demoUrl = new URL('/testspn', process.env.PLAYWRIGHT_DEMO_BASE_URL)
    await page.goto(demoUrl.href)
    await expect(page.getByRole('heading', { name: zh ? '教学 SPN 演示' : 'Teaching SPN demo', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: zh ? '教学 SPN 执行' : 'Teaching SPN execution', exact: true })).toContainText('0xcb45')
    const workers: string[] = []
    page.on('worker', (worker) => workers.push(worker.url()))
    await page.getByRole('link', { name: zh ? '教学型 SPN v2' : 'Teaching SPN v2', exact: true }).click()
    await expect(page).toHaveURL(new URL('/testspnv2', demoUrl).href)
    const heading = page.getByRole('heading', { name: zh ? '教学型 SPN v2' : 'Teaching SPN v2', exact: true })
    await expect(heading).toBeVisible({ timeout: 15000 })
    const cipher = page.getByRole('region').filter({ has: page.locator('[data-row-id="result.value"]') })
    await expect(cipher).toHaveAccessibleName(zh ? 'SPN 密码' : 'SPN cipher')
    await expect(cipher.locator('[data-row-id]')).toHaveCount(18)
    expect(workers.some((url) => url.includes('worker'))).toBe(true)
    const row = (id: string) => cipher.locator(`[data-row-id="${id}.value"]`)
    for (const [index, value] of ['0xc491', '0x05ca', '0xfe65', '0x674b'].entries()) {
      await expect(row(`permute-${index + 1}`)).toContainText(value)
    }
    await expect(row('result')).toContainText('0x674b')
    await expect(row('substitute-2').getByRole('rowheader')).toHaveText(zh ? '半字节替换 2' : 'Nibble substitution 2')
    await expect(row('permute-2').getByRole('rowheader')).toHaveText(zh ? '半字节聚集 2' : 'Nibble gather 2')
    const mode = cipher.getByRole('combobox')
    await expect(mode).toHaveValue('1')
    expect(await mode.locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual(['1', '2', '4', '8', '16'])
    for (const [size, value] of [['1', '0'], ['2', '00'], ['4', '0x0'], ['8', '0x05'], ['16', '0x05ca']]) {
      await mode.selectOption(size)
      await expect(row('permute-2').getByRole('button')).toHaveCount(16 / Number(size))
      await expect(row('permute-2').getByRole('button').first()).toHaveText(value)
    }
    await mode.selectOption('1')
    const bit = row('permute-2').getByRole('button').nth(5)
    await bit.focus()
    await bit.press('Enter')
    await expect(bit).toHaveAttribute('aria-pressed', 'true')
    await expect(row('substitute-2').locator('button[data-state="related"]')).toHaveCount(1)
    await expect(row('substitute-2').getByRole('button').nth(1)).toHaveAttribute('data-state', 'related')
    await mode.selectOption('8')
    await expect(cipher.locator('button[aria-pressed="true"]')).toHaveCount(0)
    const selected = row('permute-2').getByRole('button').first()
    await selected.focus()
    await selected.press(' ')
    await expect(selected).toHaveAttribute('aria-pressed', 'true')
    await expect(cipher.getByRole('status')).toContainText(zh ? '位 0–7：0x05' : 'Bits 0–7: 0x05')
    // Two containing source bytes are related, but traversal must retain only the selected bits.
    await expect(row('substitute-2').locator('button[data-state="related"]')).toHaveCount(2)
    await expect(row('state').locator('button[data-state="related"]')).toHaveCount(1)
    await expect(row('result').locator('button[data-state="related"]')).toHaveCount(1)
    const containing = row('substitute-2').getByRole('button').first()
    await expect(containing).toHaveAttribute('aria-pressed', 'false')
    await expect(containing).toHaveAccessibleName(zh ? /位 0–7：0x5c; 关联组$/ : /Bits 0–7: 0x5c; Related group$/)
    await containing.click()
    await expect(containing).toHaveAttribute('aria-pressed', 'true')
    await expect(row('result').locator('button[data-state="related"]')).toHaveCount(2)
    await mode.selectOption('8')
    await expect(containing).toHaveAttribute('aria-pressed', 'true')
    await expect(cipher.locator('[data-row-id] details')).toHaveCount(0)
    expect(await cipher.locator('button[title]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('title')).join(' '))).not.toMatch(/\d+\/\d+|Related bits|关联位/)
    for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: 844 })
      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
        await expect(page.locator(`[data-theme="${theme}"]`)).toBeVisible()
        await expect(containing).toHaveAttribute('aria-pressed', 'true')
        await containing.scrollIntoViewIfNeeded()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        if (width === 320) expect(await cipher.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
        await page.screenshot({ path: testInfo.outputPath(`teaching-spn-v2-${locale}-${width}-${theme}.png`) })
      }
    }
    await page.getByRole('button', { name: zh ? '语言' : 'Language', exact: true }).click()
    await page.getByRole('option', { name: zh ? /en-US/ : /zh-CN/ }).click()
    await expect(heading).toHaveCount(0)
    await expect(mode).toHaveValue('8')
    await expect(containing).toHaveAttribute('aria-pressed', 'true')
  })
}

test('keeps published SPN structure and gather selection after node and label renaming (#111)', async ({ page }) => {
  test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses public demo documents through the real Learning route')
  const lesson = parse(teachingSpnV2DemoDocuments.lesson)
  const nodes: AuthoredNode[] = lesson.graphs.cipher.nodes
  const names = Object.fromEntries(nodes.map((node, index) => [node.id, `renamed-${nodes.length - index}`]))
  for (const node of nodes) {
    node.id = names[node.id]
    for (const input of Object.values(node.inputs ?? {})) input.node = names[input.node]
  }
  nodes.reverse()
  lesson.graphs.cipher.outputs[0].node = names.result
  const step = lesson.steps[0]
  step.execute.bindings = Object.fromEntries(Object.entries(step.execute.bindings).map(([port, binding]) => [
    `${names[port.replace(/\.value$/, '')]}.value`, binding,
  ]))
  step.check.actual.output = `${names.result}.value`
  step.presentation.algorithm = 'Small network'
  step.presentation.variant = 16
  const locales = {
    'en-US': teachingSpnV2DemoDocuments.locales['en-US'].replace('Nibble substitution', 'Table lookup').replace('Nibble gather', 'Reordered nibbles'),
    'zh-CN': teachingSpnV2DemoDocuments.locales['zh-CN'].replace('半字节替换', '表查找').replace('半字节聚集', '半字节重排'),
  }
  // Only the external document/catalog boundary changes; production Learning and Worker execute it.
  await page.route('**/query', async (route) => {
    const request = route.request().postDataJSON()
    if (request.operationName === 'LearningCatalog') return route.fulfill({ json: { data: { learning: { lessonCategories: [] } } } })
    if (request.operationName !== 'LessonDocuments') throw new Error(`Unexpected operation: ${request.operationName}`)
    const language = request.variables.language === 'zh-CN' ? 'zh-CN' : 'en-US'
    return route.fulfill({ json: { data: { lessonDocuments: { lesson: stringify(lesson), locale: locales[language] } } } })
  })
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en-US'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const workers: string[] = []
  page.on('worker', (worker) => workers.push(worker.url()))
  await page.goto('/learning/teaching-spn-v2')
  const cipher = page.getByRole('region', { name: 'Small network-16 cipher', exact: true })
  await expect(cipher).toBeVisible({ timeout: 15000 })
  expect(workers.some((url) => url.includes('worker'))).toBe(true)
  const row = (id: string) => cipher.locator(`[data-row-id="${names[id]}.value"]`)
  const order = ['state', ...[1, 2, 3, 4].flatMap((round) => [`key-${round}`, `key-mix-${round}`, `substitute-${round}`, `permute-${round}`]), 'result']
  expect(await cipher.locator('[data-row-id]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-row-id')))).toEqual(order.map((id) => `${names[id]}.value`))
  await expect(row('substitute-2').getByRole('rowheader')).toHaveText('Table lookup 2')
  await expect(row('permute-2').getByRole('rowheader')).toHaveText('Reordered nibbles 2')
  await expect(row('result')).toContainText('0x674b')
  await row('permute-2').getByRole('button').nth(5).click()
  await expect(row('substitute-2').locator('button[data-state="related"]')).toHaveCount(1)
  await expect(row('substitute-2').getByRole('button').nth(1)).toHaveAttribute('data-state', 'related')
})
