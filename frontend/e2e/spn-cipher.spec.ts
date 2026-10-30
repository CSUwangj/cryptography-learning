import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { parse, stringify } from 'yaml'
import type { AuthoredNode } from '../src/crypto_graph'

const teachingLesson = readFileSync(new URL('../src/lesson_runtime/fixture/teaching-spn-v2.yaml', import.meta.url), 'utf8')
const teachingLocales = {
  'en-US': readFileSync(new URL('../src/lesson_runtime/fixture/teaching-spn-v2-locales/en-US.yaml', import.meta.url), 'utf8'),
  'zh-CN': readFileSync(new URL('../src/lesson_runtime/fixture/teaching-spn-v2-locales/zh-CN.yaml', import.meta.url), 'utf8'),
}
const aesLesson = readFileSync(new URL('../src/lesson_runtime/fixture/aes192-v2.yaml', import.meta.url), 'utf8')
const aesLocales = {
  'en-US': readFileSync(new URL('../src/lesson_runtime/fixture/aes192-v2-locales/en-US.yaml', import.meta.url), 'utf8'),
  'zh-CN': readFileSync(new URL('../src/lesson_runtime/fixture/aes192-v2-locales/zh-CN.yaml', import.meta.url), 'utf8'),
}

// Only the document/catalog boundary is substituted; the Learning session and Worker remain real.
const documents = async (page: Page, lesson: string, locales: typeof teachingLocales) => {
  await page.route('**/query', async (route) => {
    const request = route.request().postDataJSON()
    if (request.operationName === 'LearningCatalog') return route.fulfill({ json: { data: { learning: { lessonCategories: [] } } } })
    if (request.operationName !== 'LessonDocuments') throw new Error(`Unexpected operation: ${request.operationName}`)
    const language = request.variables.language === 'zh-CN' ? 'zh-CN' : 'en-US'
    return route.fulfill({ json: { data: { lessonDocuments: { lesson, locale: locales[language] } } } })
  })
}

const cipherTest = test.extend({ trace: 'off' })
cipherTest('preserves real cipher selection across locale changes on the Learning route (#107)', async ({ page }) => {
  test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses public synthetic documents through the real Worker')
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en-US'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await documents(page, teachingLesson, teachingLocales)
  const workers: string[] = []
  page.on('worker', (worker) => workers.push(worker.url()))
  await page.goto('/learning/teaching-spn-render')
  const section = page.getByRole('region', { name: 'SPN cipher', exact: true })
  await expect(section).toBeVisible({ timeout: 15000 })
  expect(workers.some((url) => url.includes('worker'))).toBe(true)
  await expect(section.locator('[data-row-id="result.value"]')).toContainText('0xc491')
  const source = section.locator('[data-row-id="state.value"]')
  await source.getByRole('combobox').selectOption('16')
  const selected = source.getByRole('button')
  await selected.focus()
  await selected.press('Enter')
  await expect(selected).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Language', exact: true }).click()
  await page.getByRole('option', { name: /zh-CN/ }).click()
  const switched = page.getByRole('region', { name: 'SPN 密码', exact: true })
  await expect(switched).toBeVisible()
  await expect(switched.locator('[data-row-id="state.value"]').getByRole('combobox')).toHaveValue('16')
  await expect(switched.locator('[data-row-id="state.value"] button[aria-pressed="true"]')).toHaveCount(1)
  await expect(switched.getByRole('status')).toContainText('位 0–15')
})

cipherTest('retains real Worker trace values and draws no edges to absent cipher rows (#107)', async ({ page }) => {
  test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses public synthetic documents through the real Worker')
  const lesson = parse(teachingLesson)
  lesson.limits = { traceEvents: 4 }
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh-CN'))
  await documents(page, stringify(lesson), teachingLocales)
  await page.goto('/learning/teaching-spn-render')
  const section = page.getByRole('region', { name: 'SPN 密码', exact: true })
  await expect(section).toBeVisible({ timeout: 15000 })
  await expect(section.locator('[data-row-id]')).toHaveCount(4)
  await expect(section.locator('[data-row-id="mix.value"]')).toContainText('0x1d3b')
  await expect(section.locator('[data-row-id="substitute.value"]')).toContainText('0x491c')
  await expect(section.locator('[data-row-id="permute.value"], [data-row-id="result.value"]')).toHaveCount(0)
  await expect(section.locator('[data-diagnostic-code="trace.incomplete"]')).toContainText('轨迹不完整')
  await expect.poll(() => section.locator('svg[data-lineage] path').evaluateAll((paths) => paths.reduce((count, path) => count + (path.getAttribute('d')?.match(/M/g)?.length ?? 0), 0))).toBe(96)
})

for (const locale of ['en-US', 'zh-CN'] as const) {
  cipherTest(`inspects renamed alternate SPN lineage in ${locale} on narrow light/dark Learning (#107)`, async ({ page }, testInfo) => {
    test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses public synthetic documents through the real Worker')
    const zh = locale === 'zh-CN'
    const lesson = parse(teachingLesson)
    const nodes: AuthoredNode[] = lesson.graphs.cipher.nodes
    const names = Object.fromEntries(nodes.map((node, index) => [node.id, `node-${nodes.length - index}`]))
    for (const node of nodes) {
      node.id = names[node.id]
      for (const input of Object.values(node.inputs ?? {})) input.node = names[input.node]
    }
    lesson.graphs.cipher.nodes.reverse()
    lesson.graphs.cipher.outputs[0].node = names.result
    lesson.steps[0].execute.bindings = { [`${names.state}.value`]: { input: 'state' }, [`${names.key}.value`]: { constant: 'key' } }
    lesson.steps[0].presentation.algorithm = 'Tiny network'
    lesson.steps[0].presentation.variant = 16
    await page.addInitScript((language) => localStorage.setItem('i18nextLng', language), locale)
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await documents(page, stringify(lesson), teachingLocales)
    const workers: string[] = []
    page.on('worker', (worker) => workers.push(worker.url()))
    await page.goto('/learning/teaching-spn-render')
    const section = page.getByRole('region', { name: zh ? 'Tiny network-16 密码' : 'Tiny network-16 cipher', exact: true })
    await expect(section).toBeVisible({ timeout: 15000 })
    expect(workers.some((url) => url.includes('worker'))).toBe(true)
    const row = (id: string) => section.locator(`[data-row-id="${names[id]}.value"]`)
    expect(await section.locator('[data-row-id]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-row-id')))).toEqual(
      ['state', 'key', 'mix', 'substitute', 'permute', 'result'].map((id) => `${names[id]}.value`),
    )
    await expect(row('result')).toContainText('0xc491')
    await expect(row('substitute').getByRole('rowheader')).toHaveText(zh ? '半字节替换 1' : 'Nibble substitution 1')
    await row('state').getByRole('combobox').selectOption('16')
    const bit = row('permute').getByRole('button').nth(5)
    await bit.focus()
    await bit.press(' ')
    await expect(bit).toBeFocused()
    await expect(bit).toHaveAttribute('aria-pressed', 'true')
    const partial = row('state').getByRole('button')
    await expect(partial).toHaveText(/4\/16/)
    await expect(partial).toHaveAttribute('aria-pressed', 'false')
    await expect(partial).toHaveAccessibleName(zh ? /关联位 4\/16：0, 1, 2, 3/ : /Related bits 4\/16: 0, 1, 2, 3/)
    await expect(partial).toHaveAttribute('title', /0, 1, 2, 3/)
    await expect(row('substitute').locator('button[data-state="related"]')).toHaveCount(1)
    await expect(row('substitute').locator('button[data-state="related"]')).toHaveAccessibleName(zh ? /位 1: 1/ : /Bit 1: 1/)
    await row('state').locator('summary').focus()
    await row('state').locator('summary').press('Enter')
    await expect(row('state').locator('details')).toContainText('0, 1, 2, 3')
    await partial.focus()
    await partial.press('Enter')
    await expect(partial).toHaveAttribute('aria-pressed', 'true')
    await expect(partial).toHaveText(/16\/16/)
    await expect(row('substitute').locator('button[data-state="related"]')).toHaveCount(16)
    await row('state').getByRole('combobox').selectOption('16')
    await expect(partial).toHaveAttribute('aria-pressed', 'true')
    await row('state').getByRole('combobox').selectOption('1')
    await expect(section.locator('button[aria-pressed="true"]')).toHaveCount(0)
    await expect(row('state').locator('[data-bit-group]')).toHaveCount(4)
    await page.setViewportSize({ width: 320, height: 844 })
    const last = row('result').getByRole('button').nth(15)
    await last.focus()
    await last.press('Enter')
    await expect(last).toHaveAccessibleName(zh ? /位 15: 1.*主动选择/ : /Bit 15: 1.*Deliberately selected/)
    await expect(last).toBeFocused()
    expect(await section.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`spn-${locale}-light-narrow.png`) })
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await expect(page.locator('[data-theme="dark"]')).toBeVisible()
    await expect(last).toHaveAttribute('aria-pressed', 'true')
    await expect(last).toBeFocused()
    await page.screenshot({ path: testInfo.outputPath(`spn-${locale}-dark-narrow.png`) })
    await page.reload()
    await expect(section).toBeVisible({ timeout: 15000 })
    await expect(section.locator('button[aria-pressed="true"]')).toHaveCount(0)
  })

  cipherTest(`renders real AES-192 Worker results and exact unit selection in ${locale} (#107)`, async ({ page }, testInfo) => {
    test.setTimeout(180000)
    test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses public synthetic documents through the real Worker')
    const zh = locale === 'zh-CN'
    await page.addInitScript((language) => localStorage.setItem('i18nextLng', language), locale)
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await documents(page, aesLesson, aesLocales)
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.evaluate(async () => {
      const fixture = await import('/e2e/v2-default-trace-browser.tsx')
      await fixture.warmDefaultTraceBrowserWorker()
    })
    const workers: string[] = []
    page.on('worker', (worker) => workers.push(worker.url()))
    await page.goto('/learning/aes192-v2-kat')
    await expect(page.getByRole('heading', { name: zh ? 'AES-192 密钥扩展' : 'AES-192 key expansion', exact: true })).toBeVisible({ timeout: 30000 })
    await page.getByRole('button', { name: zh ? '下一步' : 'Next', exact: true }).click()
    const section = page.getByRole('region', { name: zh ? 'AES-192 加密' : 'AES-192 encryption', exact: true })
    await expect(section).toBeVisible({ timeout: 30000 })
    expect(workers.some((url) => url.includes('worker'))).toBe(true)
    const row = (id: string) => section.locator(`[data-row-id="${id}.value"]`)
    await expect(row('add-round-key-12')).toContainText('0xdda97ca4864cdfe06eaf70a0ec0d7191')
    await expect(row('plaintext')).toContainText('0x00112233445566778899aabbccddeeff')
    await expect(row('sub-bytes-1')).toContainText('0x63cab7040953d051cd60e0e7ba70e18c')
    await expect(row('add-round-key-12').getByRole('button')).toHaveCount(128)
    expect(await section.locator('[data-row-id]').evaluateAll((rows) => rows.slice(0, 8).map((row) => row.getAttribute('data-row-id')))).toEqual([
      'plaintext.value', 'round-key-0.value', 'add-round-key-0.value', 'sub-bytes-1.value',
      'shift-rows-1.value', 'mix-columns-1.value', 'round-key-1.value', 'add-round-key-1.value',
    ])
    await expect(section.locator('[data-lane-row]')).toHaveCount(0)
    const sourceMode = row('round-key-0').getByRole('combobox')
    await expect(sourceMode.locator('option')).toHaveText((zh ? ['1', '2', '4', '8', '16', '32', '64', '128'].map((size) => `${size} 位`) : ['1', '2', '4', '8', '16', '32', '64', '128'].map((size) => `${size} bits`)))
    await sourceMode.selectOption('32')
    const selected = row('sub-bytes-1').getByRole('button').first()
    await selected.focus()
    await selected.press('Enter')
    await expect(selected).toHaveAttribute('aria-pressed', 'true')
    await expect(row('add-round-key-0').locator('button[data-state="related"]')).toHaveCount(8)
    const partial = row('round-key-0').getByRole('button').first()
    await expect(partial).toHaveText(/8\/32/)
    await expect(partial).toHaveAttribute('aria-pressed', 'false')
    await expect(partial).toHaveAccessibleName(zh ? /关联位 8\/32：0, 1, 2, 3, 4, 5, 6, 7/ : /Related bits 8\/32: 0, 1, 2, 3, 4, 5, 6, 7/)
    await expect(partial).toHaveAttribute('title', /0, 1, 2, 3, 4, 5, 6, 7/)
    await row('round-key-0').locator('summary').click()
    await expect(row('round-key-0').locator('details')).toContainText('0, 1, 2, 3, 4, 5, 6, 7')
    await partial.focus()
    await partial.press(' ')
    await expect(partial).toHaveAttribute('aria-pressed', 'true')
    await expect(partial).toHaveText(/32\/32/)
    await expect(row('sub-bytes-1').locator('button[data-state="related"]')).toHaveCount(32)
    await expect(row('round-key-0').locator('[data-bit-group]')).toHaveCount(4)
    await sourceMode.selectOption('1')
    await expect(section.locator('button[aria-pressed="true"]')).toHaveCount(0)
    await page.setViewportSize({ width: 390, height: 844 })
    const last = row('plaintext').getByRole('button').nth(127)
    await last.focus()
    await last.press('Enter')
    await expect(last).toHaveAccessibleName(zh ? /位 127: 1.*主动选择/ : /Bit 127: 1.*Deliberately selected/)
    expect(await section.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`aes192-${locale}-light-narrow.png`) })
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await expect(page.locator('[data-theme="dark"]')).toBeVisible()
    await expect(last).toHaveAttribute('aria-pressed', 'true')
    await expect(last).toBeFocused()
    await page.screenshot({ path: testInfo.outputPath(`aes192-${locale}-dark-narrow.png`) })
  })
}
