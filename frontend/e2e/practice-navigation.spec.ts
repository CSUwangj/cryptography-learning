import { expect, test, type Page } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'

const lesson = readFileSync(new URL('../src/lesson_runtime/fixture/lesson.yaml', import.meta.url), 'utf8')
const learningNames = {
  'en-US': { category: 'Modern / Block Ciphers', lesson: 'Explore XOR and bit relationships' },
  'zh-CN': { category: '现代密码与分组密码', lesson: '探索异或与位之间的关系' },
}
const lessonLocales = Object.fromEntries(Object.entries(learningNames).map(([language, names]) => [
  language,
  readFileSync(new URL(`../src/lesson_runtime/fixture/locales/${language}.yaml`, import.meta.url), 'utf8')
    .replace(/^title:.*$/m, `title: ${names.lesson}`),
]))

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
    const { operationName, variables } = route.request().postDataJSON()
    const language = variables?.language === 'zh-CN' ? 'zh-CN' : 'en-US'
    if (operationName === 'LearningCatalog') {
      return route.fulfill({ json: { data: { learning: { lessonCategories: [{
        id: 'block-ciphers',
        name: Object.entries(learningNames).map(([lang, names]) => ({ lang, text: names.category })),
        lessons: [{ id: 'xor-intro', title: learningNames[language].lesson }],
      }] } } } })
    }
    if (operationName === 'LessonDocuments') {
      return route.fulfill({ json: { data: { lessonDocuments: { lesson, locale: lessonLocales[language] } } } })
    }
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

  for (const labels of [
    {
      language: 'en-US', home: 'Home', learning: 'Learning', practice: 'Practice', feedback: 'Feedback',
      getStarted: 'Get Started', dark: 'Dark', light: 'Light', languageControl: 'Language', completion: 'Completion Records',
      learningDialog: 'Learning Navigation', practiceDialog: 'Practice Navigation',
      learningBreadcrumb: 'Learning > Modern / Block Ciphers > Explore XOR and bit relationships',
      practiceBreadcrumb: 'Practice > Classical Cryptography Foundations > Affine Cipher With An Intentionally Long English Lab Title',
    },
    {
      language: 'zh-CN', home: '主页', learning: '学习', practice: '实践', feedback: '反馈',
      getStarted: '开始实践', dark: '夜间模式', light: '日间模式', languageControl: '语言', completion: '完成记录',
      learningDialog: '学习导航', practiceDialog: '实践导航',
      learningBreadcrumb: '学习 > 现代密码与分组密码 > 探索异或与位之间的关系',
      practiceBreadcrumb: '实践 > 古典密码学基础与入门 > 仿射密码长标题实验',
    },
  ]) {
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [1280, 1440, 769, 320, 390, 768]) {
        test(`allocates shared navigation space at ${width}px for ${labels.language} in ${theme}`, async ({ page }, testInfo) => {
          await mockGraphQL(page)
          await page.addInitScript(({ language, theme }) => {
            localStorage.setItem('i18nextLng', language)
            localStorage.setItem('cryptography-learning-theme', theme)
          }, { language: labels.language, theme })
          await page.setViewportSize({ width, height: 900 })
          await page.goto('/')

          const measurements: unknown[] = []
          try {
            let neutralWidth = 0
            for (const scenario of [
              { pathname: '/', state: 'neutral', key: 'home' },
              { pathname: '/practice', state: 'neutral', key: 'practice-catalog' },
              { pathname: '/learning', state: 'neutral', key: 'learning-catalog' },
              { pathname: '/learning/xor-intro', state: 'learning', key: 'lesson' },
              { pathname: '/practice/classical/affine', state: 'practice', key: 'lab' },
              { pathname: '/completion', state: 'practice', key: 'completion' },
            ]) {
              const navbar = page.locator('.bp6-navbar')
              if (scenario.key === 'practice-catalog') {
                await page.getByRole('button', { name: labels.getStarted, exact: true }).click()
              } else if (scenario.key === 'learning-catalog' || scenario.key === 'lesson') {
                await navbar.locator('[data-learning-navigation] button').click()
                const navigation = page.getByRole('dialog', { name: labels.learningDialog, exact: true })
                if (scenario.key === 'lesson') {
                  const names = learningNames[labels.language as keyof typeof learningNames]
                  await navigation.getByRole('button', { name: names.category, exact: true }).click()
                  await navigation.getByRole('button', { name: names.lesson, exact: true }).click()
                } else {
                  await navigation.getByRole('button', { name: labels.learning, exact: true }).click()
                }
              } else if (scenario.key === 'lab' || scenario.key === 'completion') {
                await navbar.locator('[data-practice-navigation] button').click()
                const navigation = page.getByRole('dialog', { name: labels.practiceDialog, exact: true })
                if (scenario.key === 'lab') {
                  await navigation.getByRole('button', { name: labels.language === 'en-US' ? 'Classical Cryptography Foundations' : '古典密码学基础与入门', exact: true }).click()
                  await navigation.getByRole('button', { name: labels.language === 'en-US' ? 'Affine Cipher With An Intentionally Long English Lab Title' : '仿射密码长标题实验', exact: true }).click()
                } else {
                  await navigation.getByRole('button', { name: labels.completion, exact: true }).click()
                }
              }
              await expect(page).toHaveURL(scenario.pathname)
              const learningName = scenario.state === 'learning' ? labels.learningBreadcrumb : labels.learning
              const practiceName = scenario.key === 'lab' ? labels.practiceBreadcrumb
                : scenario.key === 'completion' ? `${labels.practice} > ${labels.completion}` : labels.practice
              const learningTrigger = navbar.locator('[data-learning-navigation]').getByRole('button', { name: learningName, exact: true })
              const practiceTrigger = navbar.locator('[data-practice-navigation]').getByRole('button', { name: practiceName, exact: true })
              await expect(learningTrigger).toBeVisible()
              await expect(practiceTrigger).toBeVisible()
              const controls = navbar.getByRole('button')
              await expect(controls).toHaveCount(6)
              const names = [labels.home, learningName, practiceName, labels.feedback, theme === 'dark' ? labels.light : labels.dark, labels.languageControl]
              const geometry = await controls.evaluateAll((buttons) => buttons.map((button) => {
                const rect = button.getBoundingClientRect()
                const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
                const clippedText = Array.from(button.querySelectorAll('.bp6-button-text, .bp6-button-text *'))
                  .filter((element) => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1)
                  .map((element) => element.textContent)
                return { x: rect.x, right: rect.right, width: rect.width, hit: hit !== null && button.contains(hit), clippedText }
              }))
              measurements.push({ language: labels.language, theme, width, ...scenario, names, geometry })
              if (scenario.key === 'home' || scenario.key === 'lesson' || scenario.key === 'lab') {
                await navbar.screenshot({ path: testInfo.outputPath(`navbar-${width}-${scenario.key}.png`) })
              }

              if (width <= 768) {
                const widths = geometry.map((control) => control.width)
                expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1)
                expect(Math.min(...widths)).toBeGreaterThanOrEqual(40)
              } else if (scenario.state === 'neutral') {
                expect(Math.abs(geometry[1].width - geometry[2].width)).toBeLessThanOrEqual(1)
                neutralWidth = geometry[1].width
              } else {
                const active = scenario.state === 'learning' ? geometry[1] : geometry[2]
                const inactive = scenario.state === 'learning' ? geometry[2] : geometry[1]
                expect(active.width).toBeGreaterThan(neutralWidth + 1)
                expect(inactive.width).toBeLessThan(neutralWidth - 1)
                expect(inactive.width).toBeLessThanOrEqual(160)
                if (scenario.state === 'learning' && width >= 1280) expect(active.clippedText).toEqual([])
              }
              for (const [index, name] of names.entries()) {
                const control = controls.nth(index)
                await expect(control).toHaveAccessibleName(name)
                await expect(control).toHaveAttribute('title', name)
                await expect(control.locator('.bp6-icon').first()).toBeVisible()
                const text = control.locator('.bp6-button-text').first()
                if (width <= 768 || index === 0 || index >= 4) await expect(text).toBeHidden()
                else await expect(text).toBeVisible()
                expect(geometry[index].x).toBeGreaterThanOrEqual(0)
                expect(geometry[index].right).toBeLessThanOrEqual(width)
                expect(geometry[index].hit).toBe(true)
                if (index > 0) expect(geometry[index - 1].right).toBeLessThanOrEqual(geometry[index].x + 1)
              }
              await expect(learningTrigger.locator('a, button, [role=button]')).toHaveCount(0)
              await expect(practiceTrigger.locator('a, button, [role=button]')).toHaveCount(0)
              if (scenario.key !== 'home') expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
            }
            const navbar = page.locator('.bp6-navbar')
            for (const [selector, name] of [
              ['[data-learning-navigation] button', labels.learningDialog],
              ['[data-practice-navigation] button', labels.practiceDialog],
            ]) {
              await navbar.locator(selector).click()
              await expect(page.getByRole('dialog', { name, exact: true })).toBeVisible()
              await navbar.locator(selector).click()
              await expect(page.getByRole('dialog', { name, exact: true })).toHaveCount(0)
            }
          } finally {
            const path = testInfo.outputPath('navbar-geometry.json')
            writeFileSync(path, JSON.stringify(measurements, null, 2))
            await testInfo.attach('navbar-geometry.json', { path, contentType: 'application/json' })
          }
        })
      }
    }
  }
  test('remembers the shared theme choice across routes and reloads', async ({ page }) => {
    await mockGraphQL(page)
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()

    await expect(page.getByRole('button', { name: 'Dark' })).toBeVisible()
    await page.getByRole('button', { name: 'Dark' }).click()
    await expect(page.locator('body')).toHaveClass(/bp6-dark/)

    await page.goto('/practice')
    await expect(page.locator('body')).toHaveClass(/bp6-dark/)
    await page.reload()
    await expect(page.locator('body')).toHaveClass(/bp6-dark/)
    await expect(page.getByRole('button', { name: 'Light' })).toBeVisible()

    await page.getByRole('button', { name: 'Light' }).click()
    await expect(page.locator('body')).not.toHaveClass(/bp6-dark/)
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
