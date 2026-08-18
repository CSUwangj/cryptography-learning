import { expect, test } from '@playwright/test'

const maxCourseRunId = `course-run-${'a'.repeat(53)}`
const maxStudentId = `student-${'b'.repeat(56)}`
const maxLabId = `lab-${'c'.repeat(60)}`

const board = {
  data: {
    completionBoard: {
      courseRunId: maxCourseRunId,
      students: [{
        studentId: maxStudentId,
        completions: [
          { labId: maxLabId, completedAt: '2026-10-12T08:15:30Z' },
          { labId: 'caesar', completedAt: '2026-10-12T08:15:30Z' },
          { labId: 'rsa', completedAt: '2026-10-12T08:15:30Z' },
          { labId: 'vigenere', completedAt: '2026-10-12T08:15:30Z' },
          { labId: 'xor', completedAt: '2026-10-12T08:15:30Z' },
        ],
      }],
    },
  },
}

test.describe('Completion Records Academic Register (#54)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Geometry evidence runs in Chromium')

  test('keeps report contained on desktop and narrow mobile while matrix scrolls locally', async ({
    page,
  }, testInfo) => {
    await page.route('**/query', (route) => route.fulfill({ json: board }))

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/completion')
    await expect(page.getByRole('heading', { name: 'Completion Records' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible()
    await expect(page.getByText(maxCourseRunId)).toBeVisible()
    expect(await page.locator('body').evaluate(
      (body) => document.documentElement.scrollWidth === body.clientWidth,
    )).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('completion-records-desktop.png'), fullPage: true })

    await page.setViewportSize({ width: 390, height: 844 })
    const exportButton = page.getByRole('button', { name: 'Export CSV' })
    await expect(exportButton).toBeVisible()
    expect(await exportButton.evaluate((element) =>
      Math.abs(element.getBoundingClientRect().width - element.parentElement!.getBoundingClientRect().width) < 1,
    )).toBe(true)
    const matrix = page.getByRole('region', { name: 'Completion Records matrix' })
    await expect(matrix).toBeVisible()
    expect(await page.locator('body').evaluate(
      (body) => document.documentElement.scrollWidth === body.clientWidth,
    )).toBe(true)
    expect(await matrix.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)

    await expect(page.getByRole('columnheader', { name: maxLabId })).toBeVisible()
    const student = page.getByRole('rowheader', { name: maxStudentId })
    const before = await student.boundingBox()
    expect(before).not.toBeNull()
    await matrix.evaluate((element) => { element.scrollLeft = 160 })
    const after = await student.boundingBox()
    expect(after).not.toBeNull()
    if (before === null || after === null) {
      throw new Error('Student ID geometry unavailable')
    }
    expect(Math.abs(before.x - after.x)).toBeLessThan(1)

    const studentHeader = page.getByRole('columnheader', { name: 'Student ID' })
    const headerBox = await studentHeader.boundingBox()
    expect(headerBox).not.toBeNull()
    if (headerBox === null) {
      throw new Error('Student ID header geometry unavailable')
    }
    expect(after.x + after.width).toBeGreaterThanOrEqual(headerBox.x + headerBox.width)
    expect(await student.evaluate((element) => {
      const box = element.getBoundingClientRect()
      const painted = document.elementFromPoint(box.right - 4, box.top + box.height / 2)
      return painted === element || element.contains(painted)
    })).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('completion-records-mobile.png'), fullPage: true })
  })
})
