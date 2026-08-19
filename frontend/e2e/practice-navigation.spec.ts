import { expect, test } from '@playwright/test'

const catalog = {
  data: {
    practice: {
      __typename: 'Practice',
      labCategories: [
        {
          __typename: 'LabCategory',
          id: 'classical',
          name: [{ __typename: 'Translation', lang: 'en-US', text: 'Classical' }],
          labs: [
            {
              __typename: 'Lab',
              id: 'affine',
              resources: [{ __typename: 'ResourceWithTranslation', lang: 'en-US', name: 'Affine Cipher' }],
              wsEndpoints: [],
              tcpEndpoints: [],
            },
          ],
        },
      ],
    },
  },
}

test.describe('Practice Navigation (#57)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Responsive geometry runs in Chromium')

  test('keeps the same two-column catalog usable on desktop and phone', async ({ page }) => {
    await page.route('**/query', (route) => route.fulfill({ json: catalog }))

    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      await page.goto('/')
      await page.getByRole('button', { name: 'Practice' }).click()

      const navigation = page.getByRole('dialog', { name: 'Practice Navigation' })
      const categoriesHeading = navigation.getByText('Lab categories')
      const labsHeading = navigation.getByText('Labs')
      await expect(categoriesHeading).toBeVisible()
      await expect(labsHeading).toBeVisible()
      const categoriesBox = await categoriesHeading.boundingBox()
      const labsBox = await labsHeading.boundingBox()
      expect(categoriesBox).not.toBeNull()
      expect(labsBox).not.toBeNull()
      if (categoriesBox === null || labsBox === null) {
        throw new Error('Practice Navigation column geometry unavailable')
      }
      expect(Math.abs(categoriesBox.y - labsBox.y)).toBeLessThan(4)
      expect(labsBox.x).toBeGreaterThan(categoriesBox.x)
      await navigation.getByRole('button', { name: 'Classical' }).click()
      await expect(navigation.getByRole('button', { name: 'Affine Cipher' })).toBeVisible()
    }
  })
})
