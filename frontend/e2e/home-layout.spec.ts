import { expect, test, type Locator, type Page } from '@playwright/test'

const features = [
  {
    title: '通过解题学密码学',
    details: ['通过夺旗赛的方式来学习密码学，使知识更有趣。同时实践的过程也会让知识更牢固。'],
  },
  {
    title: '多语言支持',
    details: ['平台的所有内容都可以迅速地切换到其他语言上，只要有人翻译。'],
  },
  {
    title: '资源整合',
    details: ['随处可点的超链接，通过感兴趣的点展开学习的道路吧。'],
  },
  {
    title: '想要更多？',
    details: [
      '更多的功能正在努力实现中：教程、更多资源、更多实践、学习指南、密码学工具箱、图解密码学。',
      '欢迎提供援助：CSUwangj@protonmail.com。',
    ],
  },
]

const withinHorizontalViewport = async (locator: Locator, viewportWidth: number, inset = 0) => {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  if (box === null) {
    throw new Error('Home feature geometry unavailable')
  }
  expect(box.x).toBeGreaterThanOrEqual(inset)
  expect(box.x + box.width).toBeLessThanOrEqual(viewportWidth - inset)
  return box
}

const expectRenderedElementUnclipped = async (locator: Locator, viewportWidth: number) => {
  await withinHorizontalViewport(locator, viewportWidth)
  expect(await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const elementStyle = getComputedStyle(element)
    const textFits = Array.from(element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT)).every((node) => {
      if (!node.textContent?.trim()) return true
      const range = document.createRange()
      range.selectNodeContents(node)
      return Array.from(range.getClientRects()).every((textRect) =>
        textRect.left >= rect.left - 1 && textRect.right <= rect.right + 1 &&
        textRect.top >= rect.top - 1 && textRect.bottom <= rect.bottom + 1,
      )
    })
    if (!textFits) return false
    if ((elementStyle.whiteSpace === 'nowrap' || elementStyle.overflowX === 'hidden' || elementStyle.overflowX === 'clip') &&
      element.scrollWidth > element.clientWidth) {
      return false
    }
    for (let ancestor: HTMLElement | null = element as HTMLElement; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor === document.body || ancestor === document.documentElement || ancestor.id === 'root') {
        continue
      }
      const style = getComputedStyle(ancestor)
      const ancestorRect = ancestor.getBoundingClientRect()
      const clipsX = style.overflowX === 'hidden' || style.overflowX === 'clip'
      const clipsY = style.overflowY === 'hidden' || style.overflowY === 'clip'
      if (clipsX && (rect.left < ancestorRect.left || rect.right > ancestorRect.right)) {
        return false
      }
      if (clipsY && (rect.top < ancestorRect.top || rect.bottom > ancestorRect.bottom)) {
        return false
      }
    }
    return true
  })).toBe(true)
}

const expectNoRectangleOverlap = (boxes: Array<{ x: number; y: number; width: number; height: number }>) => {
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const first = boxes[left]
      const second = boxes[right]
      expect(first.x + first.width <= second.x || second.x + second.width <= first.x ||
        first.y + first.height <= second.y || second.y + second.height <= first.y).toBe(true)
    }
  }
}

const featureBlock = (page: Page, title: string) =>
  page.getByRole('heading', { name: title, exact: true }).locator('..')

const expectLogoContained = async (page: Page, viewportWidth: number) => {
  const logo = page.getByRole('img', { name: 'Big Logo' })
  await expect(logo).toBeVisible()
  expect(await logo.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true)
  const box = await withinHorizontalViewport(logo, viewportWidth)
  await expectRenderedElementUnclipped(logo, viewportWidth)
  expect(box.y).toBeGreaterThanOrEqual(0)
  const footer = page.locator('#root h5').last()
  await expect(footer).toBeVisible()
  const footerBox = await footer.boundingBox()
  expect(footerBox).not.toBeNull()
  if (footerBox !== null) {
    expect(box.y + box.height).toBeLessThanOrEqual(footerBox.y + footerBox.height)
  }
  const ratio = await logo.evaluate((image) => image.naturalWidth / image.naturalHeight)
  expect(Math.abs(box.width / box.height - ratio)).toBeLessThan(0.01)
}

test.describe('Home layout (#59)', () => {
  test('stacks features on phones, preserves desktop columns, and opens Practice', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh-CN'))

    for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      await page.goto('/')

      await expectLogoContained(page, viewport.width)
      const blocks = features.map(({ title }) => featureBlock(page, title))
      const boxes = []
      for (const [index, feature] of features.entries()) {
        const block = blocks[index]
        const blockBox = await withinHorizontalViewport(block, viewport.width, 20)
        boxes.push(blockBox)
        const title = block.getByRole('heading', { name: feature.title, exact: true })
        const titleBox = await title.boundingBox()
        expect(titleBox).not.toBeNull()
        if (titleBox !== null) {
          expect(titleBox.y).toBeGreaterThanOrEqual(blockBox.y)
          expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(blockBox.y + blockBox.height)
        }
        for (const detail of feature.details) {
          const detailLocator = page.getByText(detail, { exact: true })
          const detailBox = await withinHorizontalViewport(detailLocator, viewport.width, 20)
          await expectRenderedElementUnclipped(detailLocator, viewport.width)
          expect(detailBox.y).toBeGreaterThanOrEqual((titleBox?.y ?? 0) + (titleBox?.height ?? 0))
          expect(detailBox.y + detailBox.height).toBeLessThanOrEqual(blockBox.y + blockBox.height)
        }
      }
      const visibleHomeGeometry = await page.locator('#root').evaluate((root) =>
        Array.from(root.querySelectorAll('h1, h3, h5, button')).flatMap((element) => {
          const style = getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) return []
          let clipped = false
          const textFits = Array.from(element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT)).every((node) => {
            if (!node.textContent?.trim()) return true
            const range = document.createRange()
            range.selectNodeContents(node)
            return Array.from(range.getClientRects()).every((textRect) =>
              textRect.left >= rect.left - 1 && textRect.right <= rect.right + 1 &&
              textRect.top >= rect.top - 1 && textRect.bottom <= rect.bottom + 1,
            )
          })
          clipped ||= !textFits
          clipped ||= (style.whiteSpace === 'nowrap' || style.overflowX === 'hidden' || style.overflowX === 'clip') &&
            element.scrollWidth > element.clientWidth
          for (let ancestor: HTMLElement | null = element; ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
            const ancestorStyle = getComputedStyle(ancestor)
            const ancestorRect = ancestor.getBoundingClientRect()
            const clipsX = ancestorStyle.overflowX === 'hidden' || ancestorStyle.overflowX === 'clip'
            const clipsY = ancestorStyle.overflowY === 'hidden' || ancestorStyle.overflowY === 'clip'
            clipped ||= clipsX && (rect.left < ancestorRect.left || rect.right > ancestorRect.right)
            clipped ||= clipsY && (rect.top < ancestorRect.top || rect.bottom > ancestorRect.bottom)
          }
          return [{ x: rect.left, y: rect.top, width: rect.width, height: rect.height, clipped }]
        }),
      )
      for (const element of visibleHomeGeometry) {
        expect(element.x).toBeGreaterThanOrEqual(0)
        expect(element.x + element.width).toBeLessThanOrEqual(viewport.width)
        expect(element.clipped).toBe(false)
      }
      const visibleHomeElementBoxes = visibleHomeGeometry.map(({ clipped: _clipped, ...box }) => box)
      expectNoRectangleOverlap(visibleHomeElementBoxes)
      const combinedGeometry = await page.locator('#root').evaluate((root) => {
        const elements = Array.from(root.querySelectorAll('h1, h3, h5, button, a')).filter((element) => {
          const style = getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
        })
        const boxes = elements.map((element) => {
          const rect = element.getBoundingClientRect()
          return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
        })
        const overlaps = []
        for (let left = 0; left < elements.length; left += 1) {
          for (let right = left + 1; right < elements.length; right += 1) {
            const first = boxes[left]
            const second = boxes[right]
            const intersects = !(first.x + first.width <= second.x || second.x + second.width <= first.x ||
              first.y + first.height <= second.y || second.y + second.height <= first.y)
            if (intersects && !elements[left].contains(elements[right]) && !elements[right].contains(elements[left])) {
              overlaps.push([left, right])
            }
          }
        }
        return { boxes, overlaps }
      })
      for (const box of combinedGeometry.boxes) {
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
      }
      expect(combinedGeometry.overlaps).toEqual([])
      for (let index = 1; index < boxes.length; index += 1) {
        expect(boxes[index].y).toBeGreaterThan(boxes[index - 1].y)
        expect(Math.abs(boxes[index].x - boxes[0].x)).toBeLessThanOrEqual(1)
      }
      expectNoRectangleOverlap(boxes)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)

      const getStarted = page.getByRole('button', { name: '开始实践' })
      await expect(getStarted).toBeVisible()
      const getStartedBox = await withinHorizontalViewport(getStarted, viewport.width)
      expect(getStartedBox.y + getStartedBox.height).toBeLessThanOrEqual(boxes[0].y)
      await getStarted.click()
      await expect(page).toHaveURL(/\/practice$/)
    }

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    await expectLogoContained(page, 1280)
    const desktopBoxes = await Promise.all(features.map(({ title }) => featureBlock(page, title).boundingBox()))
    expect(desktopBoxes.every((box) => box !== null)).toBe(true)
    const desktopVisibleBoxes = desktopBoxes.filter((box): box is NonNullable<typeof box> => box !== null)
    for (const box of desktopVisibleBoxes) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(1280)
    }
    expectNoRectangleOverlap(desktopVisibleBoxes)
    for (let index = 1; index < desktopBoxes.length; index += 1) {
      const previous = desktopBoxes[index - 1]
      const current = desktopBoxes[index]
      if (previous === null || current === null) {
        throw new Error('Desktop Home feature geometry unavailable')
      }
      expect(current.x).toBeGreaterThan(previous.x)
      expect(Math.abs(current.y - previous.y)).toBeLessThanOrEqual(1)
    }

    await page.getByRole('button', { name: '开始实践' }).click()
    await expect(page).toHaveURL(/\/practice$/)
  })
})
