import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { parse, stringify } from 'yaml'

const fixture = (name: string) => ({
  lesson: readFileSync(new URL(`../src/lesson_runtime/fixture/${name}.yaml`, import.meta.url), 'utf8'),
  locales: Object.fromEntries(['en-US', 'zh-CN'].map((language) => [language, readFileSync(new URL(`../src/lesson_runtime/fixture/${name}-locales/${language}.yaml`, import.meta.url), 'utf8')])),
})
const small = fixture('overlay-three-anchor-v2')
const aes = fixture('aes192-v2')

// Substitute only authored documents/catalog; all compilation, session execution and Workers are real.
const documents = async (page: Page, source: () => typeof small) => {
  await page.route('**/query', async (route) => {
    const request = route.request().postDataJSON()
    const current = source()
    const language = request.variables.language === 'zh-CN' ? 'zh-CN' : 'en-US'
    if (request.operationName === 'LearningCatalog') return route.fulfill({ json: { data: { learning: { lessonCategories: [{
      id: 'networks', name: [{ lang: 'en-US', text: 'Substitution and permutation networks' }, { lang: 'zh-CN', text: '替换与置换网络' }],
      lessons: [{ id: 'overlay', title: parse(current.locales[language]).title }],
    }] } } } })
    if (request.operationName !== 'LessonDocuments') throw new Error(`Unexpected operation: ${request.operationName}`)
    return route.fulfill({ json: { data: { lessonDocuments: { lesson: current.lesson, locale: current.locales[language] } } } })
  })
}
const overlayTest = test.extend({ trace: 'off' })
overlayTest.beforeEach(async ({ page }) => {
  test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses public authored fixtures through the local Learning Worker')
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en-US'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

overlayTest('opens the full reversed schedule on real Learning Worker results (#108)', async ({ page }) => {
  await documents(page, () => small)
  const workers: string[] = []
  page.on('worker', (worker) => workers.push(worker.url()))
  await page.goto('/learning/overlay')
  await expect(page.getByRole('region', { name: 'Key schedule', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  const cipher = page.getByRole('region', { name: 'SPN decryption', exact: true })
  await expect(cipher).toBeVisible()
  expect(workers.some((url) => url.includes('worker'))).toBe(true)
  await expect(cipher.locator('[data-lane-row]')).toHaveCount(0)
  const opener = cipher.getByRole('toolbar').getByRole('button', { name: 'Show key schedule', exact: true })
  await expect(opener).toBeVisible()
  await opener.click()
  await expect(cipher.locator('[data-lane-row]')).toHaveCount(8)
  expect(await cipher.locator('[data-lane-row]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-lane-row')))).toEqual([
    'schedule:rk2.value', 'schedule:rot.value', 'schedule:sub.value', 'schedule:rcon.value', 'schedule:xor.value', 'schedule:rk1.value', 'schedule:input.value', 'schedule:rk0.value',
  ])
})

overlayTest('keeps readable row spacing stable through grouping and selection in both views (#109)', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await documents(page, () => small)
  await page.goto('/learning/overlay')
  const measurements: unknown[] = []
  const checkSpacing = async (scope: Locator, mode: Locator, source: Locator) => {
    const rows = scope.locator('table').first().locator('tbody tr')
    const measure = () => rows.evaluateAll((rows) => rows.map((row) => ({
      height: row.getBoundingClientRect().height,
      fits: [...row.querySelectorAll('button')].every((button) => {
        const bounds = button.getBoundingClientRect()
        return bounds.top >= row.getBoundingClientRect().top && bounds.bottom <= row.getBoundingClientRect().bottom
      }),
    })))
    const baseline = await measure()
    for (const size of ['1', '4', '8', '32']) {
      await mode.selectOption(size)
      for (const selected of [false, true]) {
        if (selected) await source.getByRole('button').first().click()
        const actual = await measure()
        measurements.push({ scope: await scope.getAttribute('aria-label'), size, selected, rows: actual })
        writeFileSync(testInfo.outputPath('spacing.json'), JSON.stringify(measurements, null, 2))
        expect(actual.map((row) => row.fits)).toEqual(baseline.map(() => true))
        expect(actual).toHaveLength(baseline.length)
        for (const [index, row] of actual.entries()) expect(Math.abs(row.height - baseline[index].height), `unit ${size}, selected ${selected}, row ${index}`).toBeLessThanOrEqual(1)
      }
    }
  }
  const standalone = page.getByRole('region', { name: 'Key schedule', exact: true })
  await expect(standalone).toBeVisible()
  await checkSpacing(standalone, standalone.getByRole('combobox'), standalone.locator('[data-row-id="input.value"]'))
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  const cipher = page.getByRole('region', { name: 'SPN decryption', exact: true })
  const cipherMode = cipher.getByRole('combobox', { name: 'SPN decryption: Selection unit', exact: true })
  await checkSpacing(cipher, cipherMode, cipher.locator('[data-row-id="state.value"]'))
  const compactCount = await cipher.locator('table').first().locator('tbody tr').count()
  await cipher.getByRole('toolbar').getByRole('button', { name: 'Show key schedule', exact: true }).click()
  const scheduleMode = cipher.getByRole('combobox', { name: 'Key schedule overlay: Selection unit', exact: true })
  await checkSpacing(cipher, scheduleMode, cipher.locator('[data-lane-row="schedule:input.value"]'))
  for (const round of [0, 1, 2]) {
    await expect(cipher.locator(`[data-row-id="mix${round}.value"] [data-lane-row="schedule:rk${round}.value"]`)).toHaveCount(1)
  }
  await cipher.getByRole('button', { name: 'Clear selection', exact: true }).click()
  await cipher.getByRole('toolbar').getByRole('button', { name: 'Close key schedule', exact: true }).click()
  expect(await cipher.locator('table').first().locator('tbody tr').count()).toBe(compactCount)
  await expect(cipherMode).toHaveValue('32')
})

overlayTest('keeps cipher and covering schedule unit controls independent on real Worker results (#109)', async ({ page }) => {
  await documents(page, () => small)
  await page.goto('/learning/overlay')
  const standalone = page.getByRole('region', { name: 'Key schedule', exact: true })
  await expect(standalone.getByRole('combobox')).toHaveCount(1)
  await standalone.getByRole('combobox').selectOption('32')
  await expect(standalone.locator('[data-row-id="input.value"]').getByRole('button')).toHaveCount(2)
  await expect(standalone.locator('[data-row-id="rk0.value"]').getByRole('button')).toHaveCount(1)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  const cipher = page.getByRole('region', { name: 'SPN decryption', exact: true })
  const cipherMode = cipher.getByRole('combobox', { name: 'SPN decryption: Selection unit', exact: true })
  const scheduleMode = cipher.getByRole('combobox', { name: 'Key schedule overlay: Selection unit', exact: true })
  await expect(cipher.getByRole('combobox')).toHaveCount(1)
  await expect(cipherMode).toHaveValue('1')
  await cipherMode.selectOption('8')
  expect(await cipher.locator('tbody tr').evaluateAll((rows) => rows.every((row) => row.querySelectorAll('button[title]').length === 4))).toBe(true)
  await cipher.locator('[data-row-id="key1.value"]').getByRole('button').first().click()
  await cipher.getByRole('toolbar').getByRole('button', { name: 'Show key schedule', exact: true }).click()
  await expect(cipher.getByRole('combobox')).toHaveCount(2)
  await expect(scheduleMode).toHaveValue('1')
  await scheduleMode.selectOption('16')
  await expect(cipherMode).toHaveValue('8')
  await expect(cipher.getByRole('status')).toHaveText('No bit selected.')
  await expect(cipher.locator('[data-lane-row="schedule:input.value"]').getByRole('button')).toHaveCount(4)
  await expect(cipher.locator('[data-lane-row="schedule:rk1.value"]').getByRole('button')).toHaveCount(2)
  await cipher.locator('[data-lane-row="schedule:rk1.value"]').getByRole('button').first().click()
  const status = await cipher.getByRole('status').textContent()
  await cipherMode.selectOption('8')
  await scheduleMode.selectOption('16')
  await expect(cipher.getByRole('status')).toHaveText(status!)
  await cipher.getByRole('toolbar').getByRole('button', { name: 'Close key schedule', exact: true }).click()
  await expect(cipher.locator('[data-lane-row]')).toHaveCount(0)
  await expect(cipherMode).toHaveValue('8')
  await expect(cipher.getByRole('status')).toHaveText(status!)
  await cipher.getByRole('toolbar').getByRole('button', { name: 'Show key schedule', exact: true }).click()
  await expect(cipher.locator('[data-lane-row]')).toHaveCount(8)
  await expect(scheduleMode).toHaveValue('16')
  await expect(cipher.getByRole('status')).toHaveText(status!)
  await cipherMode.selectOption('4')
  await expect(cipher.getByRole('status')).toHaveText('No bit selected.')
  await expect(scheduleMode).toHaveValue('16')
  await expect(cipher.locator('[data-lane-row]')).toHaveCount(8)
  await cipher.getByRole('toolbar').getByRole('button', { name: 'Close key schedule', exact: true }).click()
  await expect(cipherMode).toHaveValue('4')
  await cipher.getByRole('toolbar').getByRole('button', { name: 'Show key schedule', exact: true }).click()
  await expect(scheduleMode).toHaveValue('16')
})

for (const [name, source, scheduleName, cipherName] of [
  ['three-anchor', small, 'Key schedule', 'SPN decryption'],
  ['AES-192', aes, 'AES-192 key expansion', 'AES-192 encryption'],
] as const) overlayTest(`restores ${name} closed geometry to the opt-out baseline while retaining origin (#108)`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const authored = parse(source.lesson)
  authored.steps[1].presentation.overlay = false
  let current = { ...source, lesson: stringify(authored) }
  await documents(page, () => current)
  const enterCipher = async () => {
    await page.goto('/learning/overlay')
    await expect(page.getByRole('region', { name: scheduleName, exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await cipher.waitFor({ state: 'visible', timeout: 30000 })
    await expect(page.getByRole('region', { name: cipherName, exact: true })).toBeVisible()
  }
  const cipher = page.getByRole('region', { name: cipherName, exact: true })
  const measure = () => cipher.locator('table').first().evaluate((table) => ({
    height: table.getBoundingClientRect().height,
    rows: [...table.querySelectorAll('tbody tr')].map((row) => ({
      id: row.getAttribute('data-row-id'), height: row.getBoundingClientRect().height,
      values: [...row.children].slice(1, 3).map((cell) => cell.textContent),
      padding: [getComputedStyle(row.lastElementChild!).paddingTop, getComputedStyle(row.lastElementChild!).paddingBottom],
    })),
  }))
  const selectOrigin = () => cipher.locator('[data-row-id]').first().getByRole('button').first().click()
  await enterCipher()
  const baseline = await measure()
  await selectOrigin()
  const selectedBaseline = await measure()
  authored.steps[1].presentation.overlay = true
  current = { ...source, lesson: stringify(authored) }
  await enterCipher()
  await expect(cipher.locator('[data-lane-row]')).toHaveCount(0)
  expect(await measure()).toEqual(baseline)
  await selectOrigin()
  const status = await cipher.getByRole('status').textContent()
  await cipher.getByRole('toolbar').getByRole('button', { name: 'Show key schedule', exact: true }).click()
  expect(await cipher.locator('[data-lane-row]').count()).toBeGreaterThan(0)
  await cipher.getByRole('toolbar').getByRole('button', { name: 'Close key schedule', exact: true }).click()
  await expect(cipher.locator('[data-lane-row]')).toHaveCount(0)
  await expect(cipher.getByRole('status')).toHaveText(status!)
  await expect(cipher.locator('[data-row-id]').first().locator('button[aria-pressed="true"]')).toHaveCount(1)
  expect(await measure()).toEqual(selectedBaseline)
})

overlayTest('uses accepted full-width trace gutters and centered prose on the production Learning page (#108)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await documents(page, () => small)
  await page.goto('/learning/overlay')
  await expect(page.getByRole('region', { name: 'Key schedule', exact: true })).toBeVisible()
  const geometry = await page.locator('[data-learning-page]').evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const trace = element.querySelector('.learning-trace')!.getBoundingClientRect()
    const prose = element.querySelector('.learning-prose')!.getBoundingClientRect()
    return { width: bounds.width, left: bounds.left, traceLeft: trace.left - bounds.left, traceRight: bounds.right - trace.right, proseWidth: prose.width, proseCenter: prose.left + prose.width / 2, center: bounds.left + bounds.width / 2 }
  })
  expect(geometry.width).toBe(1440)
  expect(geometry.traceLeft).toBe(24)
  expect(geometry.traceRight).toBe(24)
  expect(geometry.proseWidth).toBeLessThanOrEqual(960)
  expect(geometry.proseCenter).toBeCloseTo(geometry.center, 0)
  await page.setViewportSize({ width: 320, height: 844 })
  const narrow = await page.locator('.learning-trace').evaluate((element) => ({ left: element.getBoundingClientRect().left, width: element.getBoundingClientRect().width, border: getComputedStyle(element).borderLeftWidth, padding: getComputedStyle(element).paddingLeft }))
  expect(narrow).toEqual({ left: 16, width: 288, border: '1px', padding: '12px' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
})

overlayTest('shows the stable overlay diagnostic in Chinese without creating a Worker result (#108)', async ({ page }) => {
  const lesson = parse(small.lesson)
  lesson.steps[1].presentation.kind = 'unsupported'
  await documents(page, () => ({ ...small, lesson: stringify(lesson) }))
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh-CN'))
  const workers: string[] = []
  page.on('worker', (worker) => workers.push(worker.url()))
  await page.goto('/learning/overlay')
  const diagnostic = page.getByText(/lesson.invalid-overlay-kind:/)
  await expect(diagnostic).toContainText('只有 v2 spn-cipher 密码视图支持覆盖层。')
  expect(workers).toEqual([])
  await expect(page.locator('[data-lane-row]')).toHaveCount(0)
})

overlayTest('applies shared selection, global toggle lifecycle, presentation preservation and compact close (#109)', async ({ page }) => {
  await documents(page, () => small)
  await page.goto('/learning/overlay')
  const standalone = page.getByRole('region', { name: 'Key schedule', exact: true })
  await expect(standalone).toBeVisible()
  const standaloneWord = standalone.locator('[data-row-id="input.value"]')
  await standalone.getByRole('combobox').selectOption('32')
  await standaloneWord.getByRole('button').first().click()
  await expect(standaloneWord.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true')
  await expect(standalone.locator('[data-row-id="rk0.value"] button[data-state="related"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  const cipher = page.getByRole('region', { name: 'SPN decryption', exact: true })
  const origin = cipher.locator('[data-row-id="key1.value"]')
  await expect(cipher).toBeVisible()
  await expect(cipher.locator('[data-lane-row]')).toHaveCount(0)
  await expect(cipher.getByRole('status')).toHaveText('No bit selected.')
  const compactCount = await cipher.locator('table').first().locator('tbody tr').count()
  await origin.getByRole('button').first().click()
  const sourceStatus = await cipher.getByRole('status').textContent()
  const show = cipher.getByRole('toolbar').getByRole('button', { name: 'Show key schedule', exact: true })
  const close = cipher.getByRole('toolbar').getByRole('button', { name: 'Close key schedule', exact: true })
  await expect(show).toHaveAttribute('aria-pressed', 'false')
  await expect(origin.getByRole('button', { name: 'Show key schedule', exact: true })).toBeVisible()
  await show.click()
  await expect(close).toHaveAttribute('aria-pressed', 'true')
  await expect(show).toHaveCount(0)
  await expect(origin.getByRole('button', { name: 'Close key schedule', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(cipher.getByRole('status')).toHaveText(sourceStatus!)
  const paddingCount = await cipher.locator('table').first().locator('tbody tr').count()
  expect(paddingCount).toBeGreaterThan(compactCount)
  await expect(cipher.getByRole('button', { name: /^Round key 1 \(key1.value\), Bit/ })).toHaveCount(0)
  await expect(cipher.locator('[data-lane-row]')).toHaveCount(8)
  await expect(cipher.getByRole('status')).toHaveText(sourceStatus!)
  await close.click()
  await expect(show).toHaveAttribute('aria-pressed', 'false')
  await expect(close).toHaveCount(0)
  await expect(cipher.locator('[data-lane-row]')).toHaveCount(0)
  await expect(cipher.getByRole('status')).toHaveText(sourceStatus!)
  await expect(origin.locator('button[aria-pressed="true"]')).toHaveCount(1)
  expect(await cipher.locator('table').first().locator('tbody tr').count()).toBe(compactCount)
  await show.click()
  await expect(close).toHaveAttribute('aria-pressed', 'true')
  await expect(cipher.locator('[data-lane-row]')).toHaveCount(8)
  await expect(cipher.getByRole('status')).toHaveText(sourceStatus!)
  const input = cipher.locator('[data-lane-row="schedule:input.value"]')
  await cipher.getByRole('combobox', { name: 'Key schedule overlay: Selection unit', exact: true }).selectOption('32')
  await expect(cipher.getByRole('status')).toHaveText('No bit selected.')
  await expect(cipher.locator('[data-lane-row]')).toHaveCount(8)
  await cipher.getByRole('toolbar').getByRole('button', { name: 'Close key schedule', exact: true }).click()
  await origin.getByRole('button').first().click()
  await show.click()
  const partial = input.getByRole('button').nth(1)
  await expect(partial).toHaveText('0x04050607')
  await expect(partial).toHaveAttribute('aria-pressed', 'false')
  await expect(partial).toHaveAccessibleName(/Bits 32–63: 0x04050607; Related group$/)
  await expect(partial).toHaveAttribute('title', /Bits 32–63: 0x04050607; Related group$/)
  await expect(cipher.locator('[data-lane-row="schedule:rot.value"] button[data-state="related"]')).toHaveCount(0)
  await expect(input.locator('details')).toHaveCount(0)
  await partial.focus()
  await partial.press('Enter')
  await expect(partial).toHaveAttribute('aria-pressed', 'true')
  await expect(cipher.getByRole('status')).toContainText('Key schedule:')
  await expect(cipher.getByRole('status')).toContainText('Bits 32–63')
  const scheduleStatus = await cipher.getByRole('status').textContent()
  await cipher.getByRole('combobox', { name: 'Key schedule overlay: Selection unit', exact: true }).selectOption('32')
  await expect(cipher.getByRole('status')).toHaveText(scheduleStatus!)
  await page.setViewportSize({ width: 320, height: 844 })
  await expect(partial).toHaveAttribute('aria-pressed', 'true')
  await expect(cipher.getByRole('status')).toHaveText(scheduleStatus!)
  await expect(cipher.getByRole('combobox', { name: 'SPN decryption: Selection unit', exact: true })).toHaveValue('1')
  await expect(cipher.getByRole('combobox', { name: 'Key schedule overlay: Selection unit', exact: true })).toHaveValue('32')
  await page.getByRole('button', { name: 'Language', exact: true }).click()
  await page.getByRole('option', { name: /zh-CN/ }).click()
  const chinese = page.getByRole('region', { name: 'SPN 解密', exact: true })
  await expect(chinese).toBeVisible()
  await expect(chinese.locator('[data-lane-row]')).toHaveCount(8)
  await expect(chinese.getByRole('status')).toContainText('密钥编排:')
  await expect(chinese.getByRole('status')).toContainText('位 32–63')
  await expect(chinese.getByRole('combobox', { name: 'SPN 解密: 选择单位', exact: true })).toHaveValue('1')
  await expect(chinese.getByRole('combobox', { name: '密钥编排覆盖层: 选择单位', exact: true })).toHaveValue('32')
  await chinese.getByRole('toolbar').getByRole('button', { name: '关闭密钥编排', exact: true }).click()
  await expect(chinese.locator('[data-row-id="key1.value"] button[data-state="related"]')).toHaveCount(32)
  await chinese.getByRole('toolbar').getByRole('button', { name: '显示密钥编排', exact: true }).click()
  await chinese.getByRole('button', { name: '清除选择', exact: true }).click()
  await expect(chinese.getByRole('status')).toHaveText('未选择位。')
  await expect(chinese.locator('[data-lane-row]')).toHaveCount(8)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('link', { name: '返回课程目录', exact: true }).click()
  await page.getByRole('link', { name: parse(small.locales['zh-CN']).title, exact: true }).click()
  await expect(page.getByRole('region', { name: '密钥编排', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  const reentered = page.getByRole('region', { name: 'SPN 解密', exact: true })
  await expect(reentered).toBeVisible()
  await expect(reentered.locator('[data-lane-row]')).toHaveCount(0)
  await expect(reentered.getByRole('status')).toHaveText('未选择位。')
  await expect(reentered.getByRole('combobox')).toHaveValue('1')
  await reentered.getByRole('toolbar').getByRole('button', { name: '显示密钥编排', exact: true }).click()
  await expect(reentered.getByRole('combobox', { name: '密钥编排覆盖层: 选择单位', exact: true })).toHaveValue('1')
})

for (const originBit of [0, 64] as const) {
  overlayTest(`maps real AES-192 cross-batch bit ${originBit} without widening source words (#108)`, async ({ page }) => {
    await documents(page, () => aes)
    await page.goto('/learning/overlay')
    const standalone = page.getByRole('region', { name: 'AES-192 key expansion', exact: true })
    await expect(standalone).toBeVisible({ timeout: 30000 })
    await expect(standalone.locator('[data-row-id="round-key-1.value"]')).toContainText('0x10111213141516175846f2f95c43f4fe')
    await expect(standalone.locator('[data-row-id="batch-0.value"]')).toContainText('0x5846f2f95c43f4fe544afef55847f0fa4856e2e95c43f4fe')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    const cipher = page.getByRole('region', { name: 'AES-192 encryption', exact: true })
    await cipher.waitFor({ state: 'visible', timeout: 30000 })
    await expect(cipher).toBeVisible({ timeout: 30000 })
    const opener = cipher.getByRole('toolbar').getByRole('button', { name: 'Show key schedule', exact: true })
    await opener.click()
    await expect(cipher.locator('[data-lane-row]')).toHaveCount(46)
    const original = cipher.locator('[data-lane-row="schedule:key.value"]')
    const generated = cipher.locator('[data-lane-row="schedule:batch-0.value"]')
    await cipher.getByRole('combobox', { name: 'Key schedule overlay: Selection unit', exact: true }).selectOption('32')
    await cipher.getByRole('toolbar').getByRole('button', { name: 'Close key schedule', exact: true }).click()
    const key = cipher.locator('[data-row-id="round-key-1.value"]')
    await key.getByRole('button').nth(originBit).click()
    await opener.click()
    if (originBit === 0) {
      const partial = original.getByRole('button').nth(4)
      await expect(partial).toHaveText('0x10111213')
      await expect(partial).toHaveAccessibleName(/Bits 128–159: 0x10111213; Related group$/)
      await expect(partial).toHaveAttribute('aria-pressed', 'false')
      await expect(generated.locator('button[data-state="related"]')).toHaveCount(0)
      await expect(cipher.locator('[data-lane-row="schedule:rot-0.value"] button[data-state="related"]')).toHaveCount(0)
      await expect(cipher.locator('[data-lane-row="schedule:round-key-1.value"] button[data-state="related"]')).toHaveCount(1)
    } else {
      await expect(generated.getByRole('button').first()).toHaveAccessibleName(/Bits 0–31: 0x5846f2f9; Related group$/)
      await expect(original.getByRole('button').first()).toHaveText('0x00010203')
      await expect(original.getByRole('button').first()).toHaveAttribute('aria-pressed', 'false')
      await expect(cipher.locator('[data-lane-row="schedule:round-key-0.value"] button[data-state="related"]')).toHaveCount(0)
      await expect(cipher.locator('[data-lane-row="schedule:round-key-2.value"] button[data-state="related"]')).toHaveCount(0)
    }
    await expect(cipher.locator('[data-row-id="add-round-key-12.value"]')).toContainText('0xdda97ca4864cdfe06eaf70a0ec0d7191')
  })
}

overlayTest('replaces an AES schedule origin with a complete deliberate word (#108)', async ({ page }) => {
  await documents(page, () => aes)
  await page.goto('/learning/overlay')
  await expect(page.getByRole('region', { name: 'AES-192 key expansion', exact: true })).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  const cipher = page.getByRole('region', { name: 'AES-192 encryption', exact: true })
  await cipher.waitFor({ state: 'visible', timeout: 30000 })
  await expect(cipher).toBeVisible()
  await cipher.getByRole('toolbar').getByRole('button', { name: 'Show key schedule', exact: true }).click()
  const target = cipher.locator('[data-row-id="add-round-key-1.value"] [data-lane-row="schedule:round-key-1.value"]')
  await expect(target).toBeVisible()
  await cipher.getByRole('combobox', { name: 'Key schedule overlay: Selection unit', exact: true }).selectOption('32')
  await target.getByRole('button').nth(2).click()
  await expect(cipher.getByRole('status')).toContainText('Key schedule:')
  await expect(cipher.getByRole('status')).toContainText('Bits 64–95')
  await cipher.getByRole('toolbar').getByRole('button', { name: 'Close key schedule', exact: true }).click()
  await expect(cipher.locator('[data-row-id="round-key-1.value"] button[data-state="related"]')).toHaveCount(32)
  await expect(cipher.locator('[data-row-id="add-round-key-12.value"]')).toContainText('0xdda97ca4864cdfe06eaf70a0ec0d7191')
})

overlayTest('retains available values and only retained schedule edges in truncated real Worker traces (#108)', async ({ page }) => {
  const lesson = parse(small.lesson)
  lesson.limits = { traceEvents: 4 }
  await documents(page, () => ({ ...small, lesson: stringify(lesson) }))
  await page.goto('/learning/overlay')
  const schedule = page.getByRole('region', { name: 'Key schedule', exact: true })
  await expect(schedule).toBeVisible()
  await expect(schedule.locator('[data-row-id]')).toHaveCount(4)
  await expect(schedule.locator('[data-row-id="input.value"]')).toContainText('0x0001020304050607')
  await expect(schedule.locator('[data-diagnostic-code="trace.incomplete"]')).toBeVisible()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  const cipher = page.getByRole('region', { name: 'SPN decryption', exact: true })
  await expect(cipher).toBeVisible()
  await expect(cipher.locator('[data-row-id="mix2.value"]')).toBeVisible()
  await expect(cipher.locator('[data-diagnostic-code="trace.incomplete"]')).toBeVisible()
  await cipher.getByRole('toolbar').getByRole('button', { name: 'Show key schedule', exact: true }).click()
  await expect(cipher.locator('[data-lane-row]')).toHaveCount(4)
  await expect(cipher.locator('[data-lane-row="schedule:input.value"]').locator('..')).toContainText('0x0001020304050607')
  await expect(cipher.locator('[data-lane-row="schedule:rk2.value"]')).toHaveCount(0)
  // Retained edges: 64 rotation, 256 nibble-substitution and 64 constant-XOR dependencies.
  await expect.poll(() => cipher.locator('svg[data-lineage] path').evaluateAll((paths) => paths.reduce((count, path) => count + (path.getAttribute('d')?.match(/M/g)?.length ?? 0), 0))).toBe(384)
})

for (const locale of ['en-US', 'zh-CN'] as const) {
  for (const width of [1440, 320]) {
    overlayTest(`inspects production AES grouped overlay in ${locale} at ${width}px with light/dark themes (#109)`, async ({ page }, testInfo) => {
      const zh = locale === 'zh-CN'
      const localized = parse(aes.locales[locale])
      localized.title = zh ? 'AES-192 密钥扩展与加密：跨批次轮密钥、分组依赖及原始生成顺序的完整学习示例' : 'AES-192 key expansion and encryption: a complete learning example of cross-batch round keys, group dependencies and original generation order'
      await documents(page, () => ({ ...aes, locales: { ...aes.locales, [locale]: stringify(localized) } }))
      await page.addInitScript((language) => localStorage.setItem('i18nextLng', language), locale)
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
      await page.goto('/learning/overlay')
      await expect(page.getByRole('region', { name: zh ? 'AES-192 密钥扩展' : 'AES-192 key expansion', exact: true })).toBeVisible({ timeout: 30000 })
      await expect(page.getByRole('heading', { name: localized.title, exact: true })).toBeVisible()
      await page.getByRole('button', { name: zh ? '下一步' : 'Next', exact: true }).click()
      const cipher = page.getByRole('region', { name: zh ? 'AES-192 加密' : 'AES-192 encryption', exact: true })
      await cipher.waitFor({ state: 'visible', timeout: 30000 })
      await expect(cipher).toBeVisible()
      await cipher.getByRole('combobox').selectOption('8')
      await expect(cipher.locator('[data-row-id="plaintext.value"]').getByRole('button').first()).toHaveText('0x00')
      await page.getByRole('heading', { name: localized.title, exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: testInfo.outputPath(`aes-page-${locale}-${width}-light.png`) })
      await cipher.getByRole('toolbar').getByRole('button', { name: zh ? '显示密钥编排' : 'Show key schedule', exact: true }).click()
      const source = cipher.locator('[data-lane-row="schedule:key.value"]')
      await expect(cipher.getByRole('combobox')).toHaveCount(2)
      const scheduleMode = cipher.getByRole('combobox', { name: zh ? '密钥编排覆盖层: 选择单位' : 'Key schedule overlay: Selection unit', exact: true })
      await expect(scheduleMode).toHaveValue('1')
      await scheduleMode.selectOption('32')
      await expect(source.getByRole('button')).toHaveCount(6)
      const bit = source.getByRole('button').first()
      await expect(bit).toHaveText('0x00010203')
      await bit.focus()
      await bit.press('Enter')
      await expect(bit).toBeFocused()
      await expect(bit).toHaveAttribute('aria-pressed', 'true')
      await expect(cipher.getByRole('status')).toContainText(zh ? '位 0–31：0x00010203' : 'Bits 0–31: 0x00010203')
      await expect(cipher.locator('[data-lane-row] details')).toHaveCount(0)
      const gutters = await page.locator('.learning-trace').evaluate((element) => ({ left: element.getBoundingClientRect().left, right: innerWidth - element.getBoundingClientRect().right, border: getComputedStyle(element).borderLeftWidth }))
      expect(gutters).toEqual({ left: width < 520 ? 16 : 24, right: width < 520 ? 16 : 24, border: '1px' })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      expect(await cipher.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
      await cipher.getByRole('heading', { name: zh ? 'AES-192 加密' : 'AES-192 encryption', exact: true }).evaluate((element) => element.scrollIntoView({ block: 'start' }))
      await expect(scheduleMode).toBeInViewport({ ratio: 1 })
      await page.screenshot({ path: testInfo.outputPath(`aes-overlay-${locale}-${width}-light.png`) })
      await bit.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'center' }))
      await expect.poll(() => cipher.locator('svg[data-lineage] path').count()).toBeGreaterThan(0)
      await page.screenshot({ path: testInfo.outputPath(`aes-groups-${locale}-${width}-light.png`) })
      await page.getByRole('button', { name: zh ? '夜间模式' : 'Dark', exact: true }).click()
      await expect(page.locator('[data-theme="dark"]')).toBeVisible()
      await expect(bit).toHaveAttribute('aria-pressed', 'true')
      await bit.focus()
      await expect(bit).toBeFocused()
      await page.screenshot({ path: testInfo.outputPath(`aes-groups-${locale}-${width}-dark.png`) })
      await cipher.getByRole('heading', { name: zh ? 'AES-192 加密' : 'AES-192 encryption', exact: true }).evaluate((element) => element.scrollIntoView({ block: 'start' }))
      await expect(scheduleMode).toBeInViewport({ ratio: 1 })
      await page.screenshot({ path: testInfo.outputPath(`aes-overlay-${locale}-${width}-dark.png`) })
    })
  }
}

overlayTest('clears and closes after a changed input produces a different real execution (#108)', async ({ page }) => {
  const lesson = parse(small.lesson)
  lesson.steps.unshift({ id: 'inputs', inputs: [{ input: 'plaintext', prompt: 'state-prompt' }] })
  await documents(page, () => ({ ...small, lesson: stringify(lesson) }))
  await page.goto('/learning/overlay')
  await expect(page.getByRole('textbox', { name: 'State', exact: true })).toHaveValue('0x00112233')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Key schedule', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  const cipher = page.getByRole('region', { name: 'SPN decryption', exact: true })
  await expect(cipher).toBeVisible()
  const state = cipher.locator('[data-row-id="state.value"]')
  await expect(state).toContainText('0x00112233')
  await state.getByRole('button').first().click()
  await cipher.getByRole('toolbar').getByRole('button', { name: 'Show key schedule', exact: true }).click()
  await expect(cipher.locator('[data-lane-row]')).toHaveCount(8)
  await page.getByRole('button', { name: 'Previous', exact: true }).click()
  await page.getByRole('button', { name: 'Previous', exact: true }).click()
  await page.getByRole('textbox', { name: 'State', exact: true }).fill('0x00000000')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Key schedule', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(cipher).toBeVisible()
  await expect(state).toContainText('0x00000000')
  await expect(cipher.locator('[data-lane-row]')).toHaveCount(0)
  await expect(cipher.getByRole('status')).toHaveText('No bit selected.')
})

overlayTest('starts closed and unselected after an actual authored direction change (#108)', async ({ page }) => {
  const lesson = parse(small.lesson)
  await documents(page, () => ({ ...small, lesson: stringify(lesson) }))
  await page.goto('/learning/overlay')
  await expect(page.getByRole('region', { name: 'Key schedule', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  const cipher = page.getByRole('region', { name: 'SPN decryption', exact: true })
  await expect(cipher).toBeVisible()
  await cipher.locator('[data-row-id="state.value"]').getByRole('button').first().click()
  await cipher.getByRole('toolbar').getByRole('button', { name: 'Show key schedule', exact: true }).click()
  await expect(cipher.locator('[data-lane-row]')).toHaveCount(8)
  lesson.steps[1].presentation.direction = 'encrypt'
  await page.reload()
  await expect(page.getByRole('region', { name: 'Key schedule', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  const changed = page.getByRole('region', { name: 'SPN encryption', exact: true })
  await expect(changed).toBeVisible()
  await expect(changed.locator('[data-lane-row]')).toHaveCount(0)
  await expect(changed.getByRole('status')).toHaveText('No bit selected.')
})

for (const language of ['en-US', 'zh-CN'] as const) overlayTest(`aligns cipher/schedule units, emphasizes the overlay and retains the global toggle lifecycle (${language})`, async ({ page }, testInfo) => {
  await page.addInitScript((language) => { localStorage.setItem('i18nextLng', language); localStorage.setItem('cryptography-learning-theme', 'light') }, language)
  await documents(page, () => ({ ...small, lesson: small.lesson.replaceAll('unit: 32', 'unit: 8') }))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/learning/overlay')
  const chinese = language === 'zh-CN'
  await page.getByRole('region', { name: chinese ? '密钥编排' : 'Key schedule', exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  await page.getByRole('button', { name: chinese ? '下一步' : 'Next', exact: true }).click()
  const cipher = page.getByRole('region', { name: chinese ? 'SPN 解密' : 'SPN decryption', exact: true })
  await cipher.waitFor({ state: 'visible', timeout: 30000 })
  const cipherMode = cipher.getByRole('combobox', { name: chinese ? 'SPN 解密: 选择单位' : 'SPN decryption: Selection unit', exact: true })
  const showText = chinese ? '显示密钥编排' : 'Show key schedule'
  const closeText = chinese ? '关闭密钥编排' : 'Close key schedule'
  const show = cipher.getByRole('toolbar').getByRole('button', { name: showText, exact: true })
  const close = cipher.getByRole('toolbar').getByRole('button', { name: closeText, exact: true })
  const rowShow = cipher.locator('[data-row-id]').getByRole('button', { name: showText, exact: true })
  const rowClose = cipher.locator('[data-row-id]').getByRole('button', { name: closeText, exact: true })
  const names = chinese ? ['4 位（半字节）', '8 位（字节）', '32 位（字）'] : ['4 bits (nibble)', '8 bits (byte)', '32 bits (word)']
  for (const [index, size] of ['4', '8', '32'].entries()) await expect(cipherMode.getByRole('option', { name: names[index], exact: true })).toHaveAttribute('value', size)
  await expect(show).toHaveAttribute('aria-pressed', 'false')
  await expect(rowShow).toHaveCount(3)
  await expect(rowShow).toHaveText([showText, showText, showText])
  for (const theme of ['light', 'dark'] as const) {
    if (await page.locator('[data-theme]').getAttribute('data-theme') !== theme) {
      await page.getByRole('button', { name: chinese ? (theme === 'dark' ? '夜间模式' : '日间模式') : (theme === 'dark' ? 'Dark' : 'Light'), exact: true }).click()
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      for (const size of ['1', '2', '4', '8', '16', '32']) {
        await cipherMode.selectOption(size)
        const geometry = await cipher.locator('table').first().evaluate((table) => ({
          rows: [...table.querySelectorAll('tbody tr')].map((row) => [...row.querySelectorAll('button[title]')].map((button) => {
            const bounds = button.getBoundingClientRect()
            const text = document.createRange()
            text.selectNodeContents(button)
            const glyphs = text.getBoundingClientRect()
            return { left: bounds.left, right: bounds.right, width: bounds.width, value: button.textContent, textFits: glyphs.left >= bounds.left && glyphs.right <= bounds.right }
          })),
          weights: [...table.querySelectorAll('th')].map((header) => Number(getComputedStyle(header).fontWeight)),
        }))
        await testInfo.attach(`cipher-${theme}-${width}-${size}`, { body: JSON.stringify(geometry), contentType: 'application/json' })
        expect(geometry.rows.length).toBeGreaterThan(1)
        for (const row of geometry.rows) expect(row).toHaveLength(32 / Number(size))
        const units = geometry.rows.flat()
        expect(units.every((unit) => unit.textFits), `complete ${size}-bit unit values fit their buttons`).toBe(true)
        expect(Math.max(...units.map((unit) => unit.width)) - Math.min(...units.map((unit) => unit.width))).toBeLessThanOrEqual(1)
        for (let index = 0; index < geometry.rows[0].length; index++) {
          for (const edge of ['left', 'right'] as const) {
            const positions = geometry.rows.map((row) => row[index][edge])
            expect(Math.max(...positions) - Math.min(...positions), `cipher ${size}-bit unit ${index} ${edge}`).toBeLessThanOrEqual(1)
          }
        }
        const values = [...new Set(units.map((unit) => unit.value))]
        if (size === '1') expect(values.sort()).toEqual(['0', '1'])
        else if (Number(size) >= 4) {
          expect(values.length).toBeGreaterThan(1)
          for (const value of values) expect(value).toMatch(/^0x[0-9a-f]+$/)
        }
        for (const weight of geometry.weights) expect(weight).toBe(700)
      }
    }
  }
  await cipherMode.selectOption('16')
  await cipher.locator('[data-row-id="state.value"]').getByRole('button').first().click()
  const origin = await cipher.getByRole('status').textContent()
  const compact = await cipher.locator('table').first().evaluate((table) => ({ height: table.getBoundingClientRect().height, rows: table.querySelectorAll('tbody tr').length }))
  await rowShow.first().click()
  await expect(close).toHaveAttribute('aria-pressed', 'true')
  await expect(show).toHaveCount(0)
  await expect(rowClose).toHaveCount(3)
  await expect(rowClose).toHaveText([closeText, closeText, closeText])
  for (let index = 0; index < 3; index++) await expect(rowClose.nth(index)).toHaveAttribute('aria-pressed', 'true')
  await expect(cipher.getByRole('status')).toHaveText(origin!)
  await expect(cipher.locator('[data-lane-row]')).toHaveCount(8)
  await rowClose.nth(1).click()
  await expect(show).toHaveAttribute('aria-pressed', 'false')
  await expect(close).toHaveCount(0)
  for (let index = 0; index < 3; index++) await expect(rowShow.nth(index)).toHaveAttribute('aria-pressed', 'false')
  await expect(cipher.locator('[data-lane-row]')).toHaveCount(0)
  await expect(cipher.getByRole('status')).toHaveText(origin!)
  await expect(cipherMode).toHaveValue('16')
  expect(await cipher.locator('table').first().evaluate((table) => ({ height: table.getBoundingClientRect().height, rows: table.querySelectorAll('tbody tr').length }))).toEqual(compact)
  expect(await cipher.locator('table').first().locator('th, td').evaluateAll((cells) => cells.every((cell) => getComputedStyle(cell).opacity === '1'))).toBe(true)
  await rowShow.nth(2).click()
  await expect(close).toHaveAttribute('aria-pressed', 'true')
  await expect(cipher.getByRole('status')).toHaveText(origin!)
  await expect(cipher.locator('[data-lane-row]')).toHaveCount(8)
  await expect(cipher.getByRole('columnheader', { name: chinese ? '生成行' : 'Generation row', exact: true })).toBeVisible()
  await expect(cipher.getByRole('columnheader', { name: chinese ? '来源' : 'Source', exact: true })).toBeVisible()
  await expect(cipher.locator('[data-lane-row="schedule:input.value"]').locator('..').getByRole('cell', { name: 'input.value', exact: true })).toBeVisible()
  const scheduleMode = cipher.getByRole('combobox').nth(1)
  for (const [index, size] of ['4', '8', '32'].entries()) await expect(scheduleMode.getByRole('option', { name: names[index], exact: true })).toHaveAttribute('value', size)
  for (const size of ['16', '32']) {
    await scheduleMode.selectOption(size)
    for (const theme of ['light', 'dark'] as const) {
      if (await page.locator('[data-theme]').getAttribute('data-theme') !== theme) {
        await page.getByRole('button', { name: chinese ? (theme === 'dark' ? '夜间模式' : '日间模式') : (theme === 'dark' ? 'Dark' : 'Light'), exact: true }).click()
      }
      await expect(page.locator(`[data-theme="${theme}"]`)).toBeVisible()
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 })
        const geometry = await cipher.evaluate((section) => {
          const lane = [...section.querySelectorAll('[data-lane-row]')]
          const starts = lane.flatMap((row) => row.querySelector('button')?.getBoundingClientRect().left ?? [])
          const columns = lane.map((row) => [...row.closest('tr')!.cells].slice(-6))
          const columnSpreads = Array.from({ length: 6 }, (_, index) => {
            const starts = columns.map((cells) => cells[index].getBoundingClientRect().left)
            return Math.max(...starts) - Math.min(...starts)
          })
          const headersMatch = lane.every((row) => row.closest('tr')!.cells.length === row.closest('table')!.tHead!.rows[0].cells.length)
          const markers = [...section.querySelectorAll('button [data-bit-group]')]
          const contained = markers.every((marker) => {
            const bounds = marker.getBoundingClientRect()
            const button = marker.closest('button')!.getBoundingClientRect()
            return bounds.top >= button.top && bounds.bottom <= button.bottom
          })
          section.scrollLeft = section.scrollWidth
          const right = section.getBoundingClientRect().right
          const buttonsReachable = [...section.querySelectorAll('button[title]')].every((button) => button.getBoundingClientRect().right <= right + 1)
          const table = lane[0].closest('table')!
          const outside = [...table.querySelectorAll('th:not([data-lane-heading]), td:not([data-lane-cell])')]
          const schedule = [...table.querySelectorAll('[data-lane-heading], [data-lane-cell]')]
          return {
            startSpread: Math.max(...starts) - Math.min(...starts), columnSpreads, headersMatch, markerCount: markers.length, contained, buttonsReachable,
            headerWeights: [...table.querySelectorAll('th')].map((header) => Number(getComputedStyle(header).fontWeight)),
            outsideOpacity: outside.map((cell) => Number(getComputedStyle(cell).opacity)),
            scheduleOpacity: schedule.map((cell) => Number(getComputedStyle(cell).opacity)),
          }
        })
        await testInfo.attach(`${theme}-${width}-${size}`, { body: JSON.stringify(geometry), contentType: 'application/json' })
        expect(geometry.startSpread).toBeLessThanOrEqual(1)
        expect(geometry.columnSpreads).toHaveLength(6)
        for (const spread of geometry.columnSpreads) expect(spread).toBeLessThanOrEqual(1)
        expect(geometry.headersMatch).toBe(true)
        expect(geometry.markerCount).toBeGreaterThan(0)
        expect(geometry.contained).toBe(true)
        expect(geometry.buttonsReachable).toBe(true)
        for (const weight of geometry.headerWeights) expect(weight).toBe(700)
        expect(geometry.outsideOpacity.length).toBeGreaterThan(0)
        expect(geometry.scheduleOpacity.length).toBeGreaterThan(0)
        for (const opacity of geometry.outsideOpacity) expect(opacity).toBe(0.65)
        for (const opacity of geometry.scheduleOpacity) expect(opacity).toBe(1)
        await expect(rowClose).toHaveText([closeText, closeText, closeText])
      }
    }
  }
  await cipher.locator('[data-lane-row="schedule:input.value"]').getByRole('button').first().click()
  const scheduleOrigin = await cipher.getByRole('status').textContent()
  await close.click()
  await expect(show).toHaveAttribute('aria-pressed', 'false')
  await expect(cipher.getByRole('status')).toHaveText(scheduleOrigin!)
  await show.click()
  await expect(close).toHaveAttribute('aria-pressed', 'true')
  await expect(cipher.locator('[data-lane-row]')).toHaveCount(8)
  await expect(cipherMode).toHaveValue('16')
  await expect(scheduleMode).toHaveValue('32')
  await expect(cipher.getByRole('status')).toHaveText(scheduleOrigin!)
})


overlayTest('visually separates hexadecimal bytes in round keys and both schedule views (#109)', async ({ page }, testInfo) => {
  await documents(page, () => small)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/learning/overlay')
  const schedule = page.getByRole('region', { name: 'Key schedule', exact: true })
  await schedule.waitFor({ state: 'visible', timeout: 30000 })
  const checkBytes = async (target: Locator, value: string) => {
    const measured = await target.evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      const glyphs: DOMRect[] = []
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (let offset = 0; offset < node.textContent!.length; offset++) {
          const range = document.createRange()
          range.setStart(node, offset)
          range.setEnd(node, offset + 1)
          glyphs.push(range.getBoundingClientRect())
        }
      }
      const text = element.textContent!
      const separators = [...element.querySelectorAll('.learning-unit-separator, .learning-hex-byte + .learning-hex-byte')].map((separator) => {
        const style = getComputedStyle(separator, separator.classList.contains('learning-hex-byte') ? '::before' : null)
        return { height: parseFloat(style.height) / parseFloat(style.fontSize), width: style.width, color: style.backgroundColor }
      })
      return { text, gaps: glyphs.flatMap((bounds, index) => index > 2 && (text.length - index) % 2 === 0 ? [bounds.left - glyphs[index - 1].right] : []), separators }
    })
    expect(measured.text).toBe(value)
    expect(measured.gaps).toHaveLength(Math.ceil((value.length - 2) / 2) - 1)
    expect(measured.gaps.every((gap) => gap > 1), `visible byte gaps in ${value}: ${measured.gaps}`).toBe(true)
    expect(measured.separators).toHaveLength(measured.gaps.length)
    for (const separator of measured.separators) {
      expect(separator.height).toBeCloseTo(0.65, 2)
      expect(separator.width).toBe('1px')
      expect(separator.color).not.toBe('rgba(0, 0, 0, 0)')
    }
  }
  for (const theme of ['light', 'dark'] as const) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Dark', exact: true }).click()
    await checkBytes(schedule.locator('[data-row-id="input.value"] td').nth(1), '0x0001020304050607')
    await schedule.getByRole('combobox').selectOption('32')
    await checkBytes(schedule.locator('[data-row-id="input.value"] button[title]').first(), '0x00010203')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    const cipher = page.getByRole('region', { name: 'SPN decryption', exact: true })
    await cipher.waitFor({ state: 'visible', timeout: 30000 })
    await cipher.getByRole('combobox').selectOption('32')
    const key = cipher.locator('[data-row-id="key0.value"]')
    await key.getByRole('button', { name: 'Show key schedule', exact: true }).click()
    await cipher.getByRole('combobox').nth(1).selectOption('32')
    await cipher.getByRole('toolbar').getByRole('button', { name: 'Close key schedule', exact: true }).click()
    await checkBytes(key.locator('td').nth(1), '0x00010203')
    const unit = key.locator('button[title]').first()
    await checkBytes(unit, '0x00010203')
    await unit.click()
    await expect(cipher.getByRole('status')).toContainText('Bits 0–31: 0x00010203')
    await key.getByRole('button', { name: 'Show key schedule', exact: true }).click()
    await cipher.getByRole('combobox').nth(1).selectOption('32')
    const lane = cipher.locator('[data-lane-row="schedule:rk0.value"]')
    await checkBytes(lane.locator('..').locator('[data-lane-cell="true"]').nth(4), '0x00010203')
    await checkBytes(lane.locator('button[title]').first(), '0x00010203')
    await expect(cipher.getByRole('status')).toContainText('Bits 0–31: 0x00010203')
    await page.setViewportSize({ width: 390, height: 844 })
    await checkBytes(lane.locator('button[title]').first(), '0x00010203')
    await testInfo.attach(`byte-spacing-${theme}`, { body: await cipher.screenshot(), contentType: 'image/png' })
    if (theme === 'light') await page.getByRole('button', { name: 'Previous', exact: true }).click()
  }
})
