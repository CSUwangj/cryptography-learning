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
      content: '# Affine Cipher\n\nOrdinary Lab prose stays readable on narrow screens.\n\n`copy-this-command-without-changing-its-value-0123456789`\n\nInline math stays intact: $a_0 + a_1 + a_2 + a_3 + a_4 + a_5 + a_6 + a_7 + a_8 + a_9$.\n\n```text\nthis-is-a-wide-command-value-that-must-remain-copyable-0123456789\n```\n\n| Header | Value |\n| --- | --- |\n| wide-row | this-is-a-wide-table-value-that-must-remain-intact-0123456789 |\n\n$$a_0 + a_1 + a_2 + a_3 + a_4 + a_5 + a_6 + a_7 + a_8 + a_9 + a_{10}$$\n\n![Lab diagram](https://example.test/lab-diagram.png)',
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

  test('contains inherently wide Markdown content in local regions', async ({ page }) => {
    await mockGraphQL(page)

    for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport)
      await page.goto('/practice/classical/affine')
      await expect(page.getByRole('heading', { name: 'Affine Cipher', exact: true })).toBeVisible()

      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
      const regions = await page.locator('[data-markdown-root]').evaluateAll((roots, width) => roots.flatMap((root) => {
        const selectors = ['pre', 'code', 'table', '.katex-display', 'span[data-markdown-inline-math]']
        return selectors.flatMap((selector) => Array.from(root.querySelectorAll(selector)).map((element) => {
          const style = getComputedStyle(element)
          let boundary = element
          for (let ancestor = element.parentElement; ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
            const ancestorStyle = getComputedStyle(ancestor)
            if (ancestorStyle.overflowX === 'auto' || ancestorStyle.overflowX === 'scroll') {
              boundary = ancestor
              break
            }
          }
          const boundaryRect = boundary.getBoundingClientRect()
          return {
            selector,
            localOverflow: element.scrollWidth > element.clientWidth,
            scrollable: style.overflowX === 'auto' || style.overflowX === 'scroll',
            contained: boundaryRect.left >= 0 && boundaryRect.right <= width,
          }
        }))
      }), viewport.width)
      expect(regions.filter((region) => !region.contained)).toEqual([])
      expect(regions.filter((region) => region.localOverflow).every((region) => region.scrollable)).toBe(true)
      if (viewport.width <= 390) {
        const overflowSelectors = new Set(regions.filter((region) => region.localOverflow).map((region) => region.selector))
        expect(overflowSelectors.has('pre')).toBe(true)
        expect(overflowSelectors.has('table')).toBe(true)
      }
      await expect(page.locator('[data-markdown-root] pre').first()).toHaveCSS('white-space', 'pre')
      await expect(page.locator('[data-markdown-root] code').first()).toHaveCSS('white-space', 'pre')
      expect(await page.getByText('Ordinary Lab prose stays readable on narrow screens.', { exact: true }).evaluate((element) =>
        getComputedStyle(element).overflowX,
      )).toBe('visible')
    }
  })

  test('contains a Lab terminal card at phone and desktop widths', async ({ page }) => {
    await mockGraphQL(page)

    for (const viewport of [
      { width: 320, height: 844 },
      { width: 390, height: 844 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto('/practice/classical/affine')
      await page.getByRole('button', { name: 'Web Endpoint 0' }).click()
      const terminal = page.locator('.xterm').last()
      const card = page.locator('[data-terminal-card]').last()
      await expect(terminal).toBeVisible()
      const geometry = await terminal.evaluate((element, width) => {
        const terminalRect = element.getBoundingClientRect()
        const card = element.closest('[data-terminal-card]')
        const cardRect = card?.getBoundingClientRect()
        if (!card || !cardRect) {
          throw new Error('terminal card geometry unavailable')
        }
        return {
          terminalLeft: terminalRect.left,
          terminalRight: terminalRect.right,
          cardLeft: cardRect.left,
          cardRight: cardRect.right,
          cardClientWidth: card.clientWidth,
          cardScrollWidth: card.scrollWidth,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: width,
        }
      }, viewport.width)
      await expect(card).toBeVisible()
      expect(geometry.terminalLeft).toBeGreaterThanOrEqual(geometry.cardLeft)
      expect(geometry.terminalRight).toBeLessThanOrEqual(geometry.cardRight)
      expect(geometry.cardLeft).toBeGreaterThanOrEqual(0)
      expect(geometry.cardRight).toBeLessThanOrEqual(geometry.viewportWidth)
      expect(geometry.cardScrollWidth).toBeLessThanOrEqual(geometry.cardClientWidth)
      expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth)
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
