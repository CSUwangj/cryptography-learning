import { expect, test, type Page } from '@playwright/test'

// Playwright's injected DOM traversal (trace snapshots, locator polling) blocks the main thread
// for seconds on the ~100k-element views and delays the Worker reply past its 1 s timeout, so
// runs in flight are awaited with a native query instead.
test.use({ trace: 'off' })

const view = (page: Page, title: string) => page.locator(`section[aria-label="${title}"]`)
const settled = (page: Page, title: string) => page.waitForFunction(
  (title) => document.querySelector(`section[aria-label="${title}"]`) ?? document.querySelector('[role="alert"]'),
  title,
  { timeout: 180_000, polling: 500 },
)

test('AES demo switches variants, rejects invalid input near the form, and keeps the last result (zh-CN) (#92)', async ({ page }) => {
  test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'demos are served only by the local dev server')
  test.setTimeout(600_000)
  await page.goto('http://127.0.0.1:4178/testaescipher')
  await page.locator('nav select').selectOption('zh-CN')
  await settled(page, 'AES-128 解密')
  await expect(view(page, 'AES-128 加密')).toBeVisible()

  const variant = page.locator('main select')
  const key = page.locator('main input').first()
  const run = page.locator('main button[type="submit"]')
  await variant.selectOption('256')
  await expect(key).toHaveValue('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f')
  await run.click()
  await settled(page, 'AES-256 解密')
  await expect(page.locator('[role="alert"]')).toHaveCount(0)
  await expect(view(page, 'AES-256 加密')).toBeVisible()

  await key.fill('zz')
  await run.click()
  await expect(page.locator('main form + [role="alert"]')).toHaveText('密钥（定宽十六进制）: 输入不符合声明的类型和编码。')
  await expect(view(page, 'AES-256 加密')).toBeVisible()
  await expect(view(page, 'AES-256 解密')).toBeVisible()

  await variant.selectOption('128')
  await expect(key).toHaveValue('000102030405060708090a0b0c0d0e0f')
  await run.click()
  await settled(page, 'AES-128 解密')
  await expect(page.locator('[role="alert"]')).toHaveCount(0)
  await expect(view(page, 'AES-128 加密')).toBeVisible()
  expect(await view(page, 'AES-128 加密').locator('svg[data-lineage] line').count()).toBeGreaterThan(10_000)
})
