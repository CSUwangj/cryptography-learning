import { expect, test, type Page } from '@playwright/test'

const catalog = {
  data: {
    practice: {
      __typename: 'Practice',
      labCategories: [
        {
          __typename: 'LabCategory',
          id: 'classical',
          name: [
            { __typename: 'Translation', lang: 'en-US', text: 'Classical Cryptography Foundations' },
            { __typename: 'Translation', lang: 'zh-CN', text: '古典密码学基础与入门' },
          ],
          labs: [
            {
              __typename: 'Lab',
              id: 'affine',
              resources: [
                { __typename: 'ResourceWithTranslation', lang: 'en-US', name: 'Affine Cipher With An Intentionally Long English Lab Title' },
                { __typename: 'ResourceWithTranslation', lang: 'zh-CN', name: '仿射密码长标题实验' },
              ],
              wsEndpoints: [],
              tcpEndpoints: [],
            },
          ],
        },
      ],
    },
  },
}

const lab = {
  data: {
    lab: {
      __typename: 'LabInstance',
      content: '# Affine Cipher\n\nOrdinary Lab prose stays readable on narrow screens.\n\n![Lab diagram](https://example.test/lab-diagram.png)',
      wsEndpoints: [
        { __typename: 'Endpoint', host: 'challenge.example.test', port: 19020 },
        { __typename: 'Endpoint', host: 'challenge.example.test', port: 19021 },
      ],
      tcpEndpoints: [
        { __typename: 'Endpoint', host: 'challenge.example.test', port: 19000 },
        { __typename: 'Endpoint', host: 'challenge.example.test', port: 19001 },
      ],
    },
  },
}

const completion = {
  data: {
    completionBoard: {
      courseRunId: 'spring-2026',
      students: [],
    },
  },
}

const mockGraphQL = async (page: Page) => {
  await page.route('**/query', (route) => {
    const body = route.request().postData() ?? ''
    const response = body.includes('completionBoard')
      ? completion
      : body.includes('lab(')
        ? lab
        : catalog
    return route.fulfill({ json: response })
  })
}

test.describe('Practice Navigation (#57)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Responsive geometry runs in Chromium')

  test('keeps the same two-column catalog usable on desktop and phone', async ({ page }) => {
    await mockGraphQL(page)

    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 844 }]) {
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
      await navigation.getByRole('button', { name: 'Classical Cryptography Foundations' }).click()
      await expect(navigation.getByRole('button', { name: 'Affine Cipher With An Intentionally Long English Lab Title' })).toBeVisible()
    }
  })

  test('renders fluid welcome route without legacy sidebar or phone overflow', async ({ page }) => {
    await mockGraphQL(page)

    for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport)
      await page.goto('/practice')

      await expect(page.getByRole('heading', { name: 'WELCOME' })).toBeVisible()
      await expect(page.getByRole('dialog', { name: 'Practice Navigation' })).toHaveCount(0)
      await expect(page.getByRole('menu')).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
    }
  })

  test('keeps route-aware shell controls contained and reachable', async ({ page }) => {
    await mockGraphQL(page)

    const languages = [
      {
        language: 'en-US',
        home: 'Home',
        practice: 'Practice',
        feedback: 'Feedback',
        theme: 'Dark',
        languageControl: 'Language',
        completion: 'Completion Records',
        desktopBreadcrumb: 'Practice > Classical Cryptography Foundations > Affine Cipher With An Intentionally Long English Lab Title',
        phoneBreadcrumb: 'Practice > Affine Cipher With An Intentionally Long English Lab Title',
      },
      {
        language: 'zh-CN',
        home: '主页',
        practice: '实践',
        feedback: '反馈',
        theme: '夜间模式',
        languageControl: '语言',
        completion: '完成记录',
        desktopBreadcrumb: '实践 > 古典密码学基础与入门 > 仿射密码长标题实验',
        phoneBreadcrumb: '实践 > 仿射密码长标题实验',
      },
    ]

    for (const labels of languages) {
      await page.addInitScript((language) => localStorage.setItem('i18nextLng', language), labels.language)
      for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 1280, height: 900 }]) {
        await page.setViewportSize(viewport)
        await page.goto('/practice/classical/affine')

        const trigger = page.getByRole('button', { name: labels.desktopBreadcrumb })
        await expect(trigger).toBeVisible()
        expect((await trigger.innerText()).replace(/\s+/g, ' ').trim()).toBe(
          viewport.width <= 520 ? labels.phoneBreadcrumb : labels.desktopBreadcrumb,
        )
        await expect(page.getByRole('button', { name: labels.home })).toBeVisible()
        await expect(page.getByRole('button', { name: labels.feedback })).toBeVisible()
        await expect(page.getByRole('button', { name: labels.theme })).toBeVisible()
        await expect(page.getByRole('button', { name: labels.languageControl })).toBeVisible()
        await expect(page.getByRole('button', { name: labels.completion })).toHaveCount(0)

        const controls = [
          page.getByRole('button', { name: labels.home }),
          trigger,
          page.getByRole('button', { name: labels.feedback }),
          page.getByRole('button', { name: labels.theme }),
          page.getByRole('button', { name: labels.languageControl }),
        ]
        const boxes = await Promise.all(controls.map((control) => control.boundingBox()))
        expect(boxes.every((box) => box !== null)).toBe(true)
        for (let index = 1; index < boxes.length; index += 1) {
          const previous = boxes[index - 1]
          const current = boxes[index]
          if (previous === null || current === null) {
            throw new Error('Shared shell control geometry unavailable')
          }
          expect(previous.x + previous.width).toBeLessThanOrEqual(current.x + 1)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
      }
    }
  })

})

test.describe('Responsive Labs (#61)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Responsive geometry runs in Chromium')

  test('keeps ordinary Lab content fluid on phones and readable on desktop', async ({ page }) => {
    await mockGraphQL(page)

    for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      await page.goto('/practice/classical/affine')

      await expect(page.getByRole('heading', { name: 'Affine Cipher' })).toBeVisible()
      await expect(page.getByText('Ordinary Lab prose stays readable on narrow screens.')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Web Endpoint 0' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Web Endpoint 1' })).toBeVisible()
      await expect(page.getByText('Raw TCP Endpoint 0:')).toBeVisible()

      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
      for (const control of [
        page.getByRole('button', { name: 'Web Endpoint 0' }),
        page.getByRole('button', { name: 'Web Endpoint 1' }),
        page.getByRole('button', { name: 'Clear' }),
      ]) {
        const box = await control.boundingBox()
        expect(box).not.toBeNull()
        if (box !== null) {
          expect(box.x).toBeGreaterThanOrEqual(0)
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
        }
      }
    }

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/practice/classical/affine')
    const labContent = page.getByRole('heading', { name: 'Affine Cipher' }).locator('..').locator('..')
    const contentBox = await labContent.boundingBox()
    expect(contentBox).not.toBeNull()
    if (contentBox !== null) {
      expect(contentBox.width).toBeLessThanOrEqual(1000)
      expect(contentBox.x).toBeGreaterThanOrEqual(0)
      expect(contentBox.x + contentBox.width).toBeLessThanOrEqual(1280)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280)
  })
})
