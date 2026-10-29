// Local, throwaway acceptance check for #95 P0-A5/A6. Start prototype:learning-shell first.
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const origin = process.env.PROTOTYPE_ORIGIN ?? 'http://127.0.0.1:4181'
const resources = {}
for (const locale of ['en-US', 'zh-CN']) {
  resources[locale] = {}
  for (const namespace of ['translations', 'demos']) {
    const path = fileURLToPath(new URL('../src/app/i18n/locales/' + locale + '/' + namespace + '.json', import.meta.url))
    const response = await fetch(origin + '/@fs' + path)
    assert.ok(response.ok, 'Shared UI resources must be served by the prototype')
    resources[locale][namespace] = await response.json()
  }
}
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message) })
const geometry = async () => {
  const metrics = await page.evaluate(() => {
    const main = document.querySelector('main')
    const prose = main.querySelector('.prose')
    const trace = main.querySelector('section[aria-label]')
    return {
      page: document.documentElement.scrollWidth, viewport: innerWidth,
      content: main.clientWidth, contentScroll: main.scrollWidth,
      proseX: prose.getBoundingClientRect().x, proseWidth: prose.clientWidth,
      traceX: trace?.getBoundingClientRect().x, traceWidth: trace?.getBoundingClientRect().width, traceScroll: trace?.scrollWidth,
      buttons: [...document.querySelectorAll('.bp6-navbar button')].map((button) => {
        const rect = button.getBoundingClientRect()
        return { label: button.getAttribute('aria-label'), x: rect.x, right: rect.right, width: rect.width }
      }),
    }
  })
  assert.ok(metrics.page <= metrics.viewport + 1, JSON.stringify(metrics))
  assert.ok(metrics.contentScroll <= metrics.content + 1, JSON.stringify(metrics))
  for (const [index, button] of metrics.buttons.entries()) {
    assert.ok(button.width >= 32 && button.x >= 0 && button.right <= metrics.viewport + 1, JSON.stringify(button))
    if (index) assert.ok(button.x >= metrics.buttons[index - 1].right - 1, `Navigation overlap: ${JSON.stringify(metrics.buttons)}`)
  }
  return metrics
}

try {
  for (const locale of ['en-US', 'zh-CN']) {
    const { translations: ui, demos } = resources[locale]
    const content = { category: demos.learningShell.categoryNames.foundations, blocks: demos.learningShell.categoryNames['block-ciphers'], short: demos.learningShell.lessonTitles.xor }
    for (const width of [1440, 1100, 768, 521, 520, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(`${origin}/learning/aes-192-long?prototype=shell&lang=${locale}`)
      await page.locator('[data-prototype="learning-shell"]').waitFor()
      await expect(page.locator('[data-prototype="learning-shell"]')).toBeVisible()
      await expect(page.locator('main h2')).toContainText('AES-192')
      const title = await page.locator('main h2').innerText()
      const trigger = page.getByRole('button', { name: `${ui.nav.learning} > ${content.blocks} > ${title}`, exact: true })
      await expect(trigger).toBeVisible()
      const metrics = await geometry()
      const gutter = width <= 520 ? 16 : 24
      assert.equal(metrics.proseWidth, Math.min(960, width - 2 * gutter))
      assert.equal(metrics.proseX, (width - metrics.proseWidth) / 2)
      assert.equal(metrics.traceX, gutter)
      assert.ok(metrics.traceScroll > metrics.traceWidth, 'Trace must keep its local scrollbar')
      assert.equal(metrics.traceWidth, width - 2 * gutter)

      await page.getByRole('button', { name: ui.nav.homeAction, exact: true }).focus()
      await page.keyboard.press('Tab')
      await expect(trigger).toBeFocused()
      await page.keyboard.press('Enter')
      const dialog = page.getByRole('dialog', { name: ui.learningNavigation.label })
      await expect(dialog).toBeVisible()
      // Measure the final layout after Blueprint's CSS scale transition.
      await dialog.evaluate((element) => Promise.all(element.closest('.bp6-popover').getAnimations().map((animation) => animation.finished)))
      await expect(dialog.getByRole('button', { name: title, exact: true })).toBeVisible()
      const bounds = await dialog.boundingBox()
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `Popup bounds ${width}: ${JSON.stringify(bounds)}`)
      const buttonsFit = await dialog.locator('button').evaluateAll((buttons) => buttons.every((button) => button.scrollWidth <= button.clientWidth + 1 && button.scrollHeight <= button.clientHeight + 1))
      assert.ok(buttonsFit, `Popup titles must wrap at ${locale}/${width}`)
      if ([1440, 320].includes(width)) await page.screenshot({ path: `/tmp/learning-shell-${locale}-${width}-menu.png` })
      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()

      await trigger.click()
      await dialog.getByRole('button', { name: content.category, exact: true }).click()
      await dialog.getByRole('button', { name: content.short, exact: true }).focus()
      await page.keyboard.press('Enter')
      await expect(dialog).not.toBeVisible()
      await expect(page.locator('main h2')).toHaveText(content.short)
      assert.equal(new URL(page.url()).pathname, '/learning/xor')
      await geometry()
      await page.locator('main nav a').click()
      await expect(page.locator('main h2')).toHaveText(ui.nav.learning)
      await expect(page.locator('main a')).toHaveCount(4)
      await page.getByRole('link', { name: title, exact: true }).click()
      await expect(page.locator('main h2')).toHaveText(title)
      const trace = page.getByRole('region', { name: demos.learningShell.trace, exact: true })
      await trace.scrollIntoViewIfNeeded()
      await trace.evaluate((element) => { element.scrollLeft = element.scrollWidth })
      assert.ok(await trace.evaluate((element) => element.scrollLeft > 0))
      const lastBit = trace.getByRole('button').last()
      await lastBit.focus()
      await page.keyboard.press('Enter')
      await expect(lastBit).toHaveAttribute('aria-pressed', 'true')
      await expect(trace.getByRole('status')).toContainText('127')
      await geometry()
      if ([1440, 320].includes(width)) {
        await trace.evaluate((element) => { element.scrollLeft = 0 })
        await page.screenshot({ path: `/tmp/learning-shell-${locale}-${width}-trace.png` })
        await page.locator('main h2').scrollIntoViewIfNeeded()
        await page.screenshot({ path: `/tmp/learning-shell-${locale}-${width}.png` })
      }
      console.log(`${locale} ${width}px: navigation, keyboard, catalog, wrapping, trace selection/scroll passed`)
    }
    await page.getByRole('button', { name: new RegExp(`^${ui.nav.learning}`) }).click()
    await page.getByRole('dialog', { name: ui.learningNavigation.label }).getByRole('button', { name: ui.learning.title }).click()
    assert.equal(new URL(page.url()).pathname, '/learning')
    await page.getByRole('button', { name: ui.nav.homeAction, exact: true }).click()
    await expect(page.locator('main h2')).toBeVisible()
    assert.equal(new URL(page.url()).pathname, '/')
    await page.getByRole('button', { name: ui.nav.feedback, exact: true }).click()
    await expect(page.locator('main h2')).toHaveText(ui.nav.feedback)
    await page.getByRole('button', { name: ui.nav.practice, exact: true }).click()
    await page.getByRole('button', { name: ui.nav.completion, exact: true }).click()
    await expect(page.locator('main h2')).toHaveText(ui.nav.completion)
    await page.reload()
    await expect(page.locator('[data-prototype="learning-shell"]')).toBeVisible()
  }
  await page.goto(`${origin}/learning/aes-192-long?prototype=shell&lang=en-US`)
  const english = resources['en-US'].translations
  const chinese = resources['zh-CN']
  await page.getByRole('button', { name: english.nav.language, exact: true }).click()
  await page.getByRole('option', { name: english.i18n['zh-CN'] }).click()
  await expect(page.locator('main h2')).toHaveText(resources['zh-CN'].demos.learningShell.lessonTitles['aes-192-long'])
  await expect(page).toHaveURL(/lang=zh-CN/)
  await page.getByText(new RegExp('^' + chinese.demos.learningShell.spacing + ':')).click()
  await page.getByLabel(chinese.demos.learningShell.narrow, { exact: true }).fill('20')
  assert.equal((await geometry()).proseX, 20)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByLabel(chinese.demos.learningShell.desktop, { exact: true }).fill('32')
  await page.getByLabel(chinese.demos.learningShell.measure, { exact: true }).fill('40')
  const adjusted = await geometry()
  assert.equal(adjusted.proseX, (1440 - 640) / 2)
  assert.equal(adjusted.proseWidth, 640)
  assert.equal(adjusted.traceX, 32)
  assert.equal(adjusted.traceWidth, 1440 - 64)
  await page.reload()
  await expect(page.getByText(chinese.demos.learningShell.spacing + ': 24/16px · 60rem', { exact: true })).toBeVisible()
  assert.deepEqual(errors, [])
  console.log('Locale switch, existing destinations, reload, adjustable spacing passed; no browser errors.')
} finally {
  await browser.close()
}
