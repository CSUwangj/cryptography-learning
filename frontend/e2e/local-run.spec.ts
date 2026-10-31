import { expect, test } from '@playwright/test'

// Exercise the endpoints exported by the real Playwright webServer lifecycle.
test('owns distinct local application, demo, and artifact destinations', async ({ request, baseURL }) => {
  test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'served-image runs do not start local Vite servers')
  const demoURL = process.env.PLAYWRIGHT_DEMO_BASE_URL
  expect(demoURL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
  expect(demoURL).not.toBe(baseURL)
  const app = await request.get('/')
  const demo = await request.get(`${demoURL}/`)
  expect(app.ok()).toBe(true)
  expect(demo.ok()).toBe(true)
  expect(await app.text()).toContain('/src/index.tsx')
  expect(await demo.text()).toContain('/main.tsx')
})
