import { expect, test } from '@playwright/test'

test.describe('Linux web-tier acceptance (#21)', () => {
  test('serves the SPA at root and nested routes', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#root')).toBeVisible()
    await page.goto('/practice/classical/affine')
    await expect(page.locator('#root')).toBeVisible()
  })

  test('serves static assets and the representative Practice catalog', async ({ page, request }) => {
    await expect((await request.get('/manifest.json')).ok()).toBeTruthy()
    const response = await request.post('/query', {
      data: { query: '{ practice { labCategories { id } } }' },
    })
    expect(response.ok()).toBeTruthy()
    const body = await response.json()
    expect(body.data.practice.labCategories).toEqual(
      expect.arrayContaining([{ id: 'classical' }, { id: 'modern' }]),
    )
    await page.goto('/practice')
    await expect(page.locator('#root')).toBeVisible()
  })

  test('exposes liveness and readiness for the running image', async ({ request }) => {
    await expect((await request.get('/health/live')).status()).toBe(200)
    await expect((await request.get('/health/ready')).status()).toBe(200)
  })
})
