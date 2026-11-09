import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { firstAes192KeyChangeLesson } from '../demos/keyChangeLesson'

// Real first-generation AES-192 graphs keep browser geometry bounded; runtime tests cover full AES.
const documents = firstAes192KeyChangeLesson(readFileSync(new URL('../src/lesson_runtime/fixture/aes192-v2.yaml', import.meta.url), 'utf8'), 'encrypt')

test('inspects a real key-change cipher overlay with local lineage, complete alignment and accessible controls (#144)', async ({ page }, testInfo) => {
  test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses public synthetic Lesson documents and the real local Worker')
  await page.addInitScript(() => {
    localStorage.setItem('i18nextLng', 'en-US')
    localStorage.removeItem('cryptography-learning-theme')
    const state = window as Window & { comparisonRequests: number }
    state.comparisonRequests = 0
    const send = Worker.prototype.postMessage
    Worker.prototype.postMessage = function (message: unknown) {
      if (typeof message === 'object' && message !== null && 'kind' in message && message.kind === 'compare') state.comparisonRequests++
      send.call(this, message)
    }
  })
  await page.route('**/query', async (route) => {
    const request = route.request().postDataJSON()
    const language = request.variables.language === 'zh-CN' ? 'zh-CN' : 'en-US'
    if (request.operationName === 'LearningCatalog') return route.fulfill({ json: { data: { learning: { lessonCategories: [] } } } })
    if (request.operationName !== 'LessonDocuments') throw new Error(`Unexpected operation: ${request.operationName}`)
    return route.fulfill({ json: { data: { lessonDocuments: { lesson: documents.lesson, locale: documents.locales[language] } } } })
  })
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/learning/key-avalanche')
  await expect(page.getByRole('textbox', { name: 'Original key', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('table', { name: 'Comparison summary', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  const comparison = page.getByRole('region', { name: /^(Execution comparison|执行比较)$/ })
  const selected = comparison.locator('button[data-different][aria-pressed="true"]')
  const row = (id: string) => comparison.locator(`[data-row-id="${id}.value"]`).first()
  const lane = (id: string) => comparison.locator(`[data-lane-row="schedule:${id}.value"]`)
  const units = (id: string) => row(id).locator('button[data-different]')
  await expect(comparison.getByRole('toolbar')).toBeVisible()
  await expect(comparison.getByRole('combobox')).toHaveValue('1')
  await expect(selected).toHaveCount(0)
  await expect(comparison.locator('[data-lane-row]')).toHaveCount(0)
  await comparison.getByRole('combobox').selectOption('8')
  const unchanged = units('round-key-1').first()
  await unchanged.focus()
  await expect(unchanged).toBeFocused()
  await unchanged.press('Enter')
  await expect(unchanged).toHaveAccessibleName(/Baseline result: 0x10; Changed result: 0x10; Deliberately selected/)
  await expect(unchanged.locator('u')).toHaveCount(0)
  await expect(units('add-round-key-0').first().locator('u')).toHaveText('0x00|0x80')
  const open = comparison.getByRole('toolbar').getByRole('button', { name: 'Show key schedule', exact: true })
  await open.focus()
  await open.press(' ')
  await expect(selected).toHaveCount(0)
  await expect(comparison.locator('[data-lane-row]')).toHaveCount(8)
  for (const round of [0, 1]) {
    const anchor = comparison.locator(`[data-row-id="add-round-key-${round}.value"] [data-lane-row="schedule:round-key-${round}.value"]`)
    await expect(anchor).toHaveCount(1)
    expect(await anchor.evaluate((cell) => Math.abs(cell.getBoundingClientRect().top - cell.closest('tr')!.getBoundingClientRect().top))).toBeLessThanOrEqual(1)
  }
  await comparison.getByRole('combobox', { name: 'Key schedule overlay: Selection unit', exact: true }).selectOption('32')
  await lane('key').getByRole('button').nth(2).click()
  await expect(selected).toHaveCount(1)
  await row('round-key-0').getByRole('button', { name: 'Close key schedule', exact: true }).click()
  await expect(selected).toHaveCount(0)
  await expect(comparison.getByRole('combobox')).toHaveValue('8')
  await row('round-key-0').getByRole('button', { name: 'Show key schedule', exact: true }).click()
  await expect(selected).toHaveCount(0)
  await expect(comparison.getByRole('combobox').nth(1)).toHaveValue('32')
  await comparison.getByRole('combobox').nth(1).selectOption('8')
  const origin = lane('round-key-1').getByRole('button').nth(8)
  await origin.focus()
  await origin.press('Enter')
  await expect(origin).toBeFocused()
  await expect(origin).toHaveAttribute('aria-pressed', 'true')
  await expect(origin.locator('u')).toHaveText('0x58|0xd8')
  await expect(lane('key').locator('button[data-state^="related"]')).toHaveCount(2)
  await expect(lane('round-key-1').getByRole('button').nth(12)).toHaveAttribute('data-state', 'changed')
  await expect(lane('round-key-1').getByRole('button').nth(12).locator('u')).toBeVisible()
  // Only the active lane has bit endpoints and drawn lineage while the cipher is covered.
  await expect(comparison.locator('[data-row-id] > td:not([data-lane-cell]) button[data-different]')).toHaveCount(0)
  expect(await comparison.evaluate((element) => {
    const svg = element.querySelector<SVGSVGElement>('svg[data-lineage]')!
    const cells = [...element.querySelectorAll('[data-lane-row]')].map((cell) => cell.getBoundingClientRect())
    const left = Math.min(...cells.map((cell) => cell.left))
    const right = Math.max(...cells.map((cell) => cell.right))
    const paths = [...svg.querySelectorAll('path')]
    return paths.length > 0 && paths.every((path) => {
      const bounds = path.getBoundingClientRect()
      return bounds.left >= left - 1 && bounds.right <= right + 1
    })
  })).toBe(true)
  for (const locale of ['en-US', 'zh-CN']) {
    if (locale === 'zh-CN') {
      await page.getByRole('button', { name: 'Language', exact: true }).click()
      await page.getByRole('option', { name: /zh-CN/ }).click()
    }
    await expect(page.getByRole('table', { name: locale === 'en-US' ? 'Comparison summary' : '比较摘要', exact: true })).toBeVisible()
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 })
      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
        await expect(page.locator(`[data-theme="${theme}"]`)).toBeVisible()
        await expect(origin).toHaveAttribute('aria-pressed', 'true')
        await expect(comparison.getByRole('combobox').nth(0)).toHaveValue('8')
        await expect(comparison.getByRole('combobox').nth(1)).toHaveValue('8')
        await origin.scrollIntoViewIfNeeded()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        if (width === 390) {
          expect(await comparison.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
          await comparison.evaluate((element) => { element.scrollLeft = element.scrollWidth })
          expect(await comparison.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
          await origin.scrollIntoViewIfNeeded()
        }
        await page.screenshot({ path: testInfo.outputPath(`key-overlay-${locale}-${width}-${theme}.png`) })
      }
    }
  }
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
  expect(await page.evaluate(() => (window as Window & { comparisonRequests: number }).comparisonRequests)).toBe(2)
  await page.getByRole('button', { name: '上一步', exact: true }).click()
  await page.getByRole('button', { name: '上一步', exact: true }).click()
  await page.getByRole('textbox', { name: '原始密钥', exact: true }).fill('0x000000000000000000000000000000000000000000000001')
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await expect(page.getByRole('table', { name: '比较摘要', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await expect(comparison.getByRole('toolbar')).toBeVisible()
  await expect(comparison.getByRole('combobox')).toHaveValue('1')
  await expect(comparison.locator('[data-lane-row]')).toHaveCount(0)
  await expect(selected).toHaveCount(0)
  await comparison.getByRole('toolbar').getByRole('button', { name: '显示密钥编排', exact: true }).click()
  await expect(comparison.getByRole('combobox').nth(1)).toHaveValue('1')
  await expect(selected).toHaveCount(0)
  expect(errors).toEqual([])
})
