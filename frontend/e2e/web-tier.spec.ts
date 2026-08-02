import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const loadFixture = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../baseline/fixtures/graphql/${name}`, import.meta.url), 'utf8')
  )

const affineLabFixture = loadFixture('lab_affine_en.json')

const labResponse = {
  data: {
    lab: {
      ...affineLabFixture.data.lab,
      __typename: 'LabInstance',
      wsEndpoints: affineLabFixture.data.lab.wsEndpoints.map((endpoint: object) => ({
        ...endpoint,
        __typename: 'Endpoint',
      })),
      tcpEndpoints: affineLabFixture.data.lab.tcpEndpoints.map((endpoint: object) => ({
        ...endpoint,
        __typename: 'Endpoint',
      })),
    },
  },
}

const practiceResponse = {
  data: {
    practice: {
      __typename: 'Practice',
      labCategories: [],
    },
  },
}

test.describe('Linux web-tier acceptance (#21)', () => {
  test('serves the SPA at root and nested routes', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#root')).toBeVisible()
    await page.goto('/practice/classical/affine')
    await expect(page.locator('#root')).toBeVisible()
  })

  test('renders the representative Practice Lab Description without browser errors', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.route('**/query', async (route) => {
      const variables = route.request().postDataJSON()?.variables
      const response = variables?.labId === 'affine' ? labResponse : practiceResponse
      await route.fulfill({ json: response })
    })

    await page.goto('/practice/classical/affine')

    await expect(page.getByRole('heading', { name: 'Affine Cipher' })).toBeVisible()
    await expect(page.getByText('Baseline Lab Description for characterization tests.')).toBeVisible()
    expect(pageErrors).toEqual([])
  })

  test('serves static assets and the representative Practice catalog', async ({ page, request }) => {
    await expect((await request.get('/manifest.json')).ok()).toBeTruthy()
    const response = await request.post('/query', {
      data: { query: '{ practice { labCategories { id } } }' },
    })
    expect(response.ok()).toBeTruthy()
    const body = await response.json()
    expect(body.data.practice.labCategories).toEqual([{ id: 'classical' }, { id: 'modern' }])
    await page.goto('/practice')
    await expect(page.locator('#root')).toBeVisible()
  })

  test('exposes liveness and readiness for the running image', async ({ request }) => {
    await expect((await request.get('/health/live')).status()).toBe(200)
    await expect((await request.get('/health/ready')).status()).toBe(200)
  })
})
