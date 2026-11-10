import { expect, test } from '@playwright/test'
import { caesarV2Documents } from '../demos/caesarLesson'

for (const copy of [
  { locale: 'en-US', message: 'Message', shiftInput: 'Signed shift', control: 'Caesar shift', next: 'Next', previous: 'Previous', region: 'Classical cipher position mapping', outputs: 'Graph outputs', preview: 'Preview shift: ', committed: 'Committed shift: ', moves: 'moves' },
  { locale: 'zh-CN', message: '消息', shiftInput: '有符号位移', control: '凯撒位移', next: '下一步', previous: '上一步', region: '古典密码位置映射', outputs: '图输出', preview: '预览位移：', committed: '已提交位移：', moves: '移动' },
]) {
  test(`previews and commits the real v2 Caesar Lesson in ${copy.locale} (#145)`, async ({ page }, testInfo) => {
    test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses synthetic Lesson documents through the real Learning route')
    const reducedMotion = copy.locale === 'zh-CN' ? 'reduce' : 'no-preference'
    await page.emulateMedia({ colorScheme: 'light', reducedMotion })
    await page.addInitScript((locale) => {
      localStorage.setItem('i18nextLng', locale)
      localStorage.removeItem('cryptography-learning-theme')
      const state = window as Window & { caesarExecutions: { id: string, shift: number }[] }
      state.caesarExecutions = []
      const send = Worker.prototype.postMessage
      Worker.prototype.postMessage = function (request: unknown) {
        const message = request as { kind?: string, requestId?: string, payload?: { inputs?: Record<string, { value?: number }> } }
        if (message.kind === 'execute' && message.payload?.inputs?.['rotation.value']) {
          state.caesarExecutions.push({ id: message.requestId!, shift: message.payload.inputs['rotation.value'].value! })
        }
        send.call(this, request)
      }
    }, copy.locale)
    await page.route('**/query', async (route) => {
      const operation = route.request().postDataJSON()
      if (operation.operationName === 'LearningCatalog') {
        return route.fulfill({ json: { data: { learning: { lessonCategories: [] } } } })
      }
      if (operation.operationName !== 'LessonDocuments') throw new Error(`Unexpected operation: ${operation.operationName}`)
      await route.fulfill({ json: { data: { lessonDocuments: {
        lesson: caesarV2Documents.lesson,
        locale: caesarV2Documents.locales[operation.variables.language] ?? null,
      } } } })
    })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const workers: string[] = []
    page.on('worker', (worker) => workers.push(worker.url()))
    const executions = () => page.evaluate(() => (window as Window & { caesarExecutions: { id: string, shift: number }[] }).caesarExecutions)
    await page.goto('/learning/caesar-v2')
    await page.getByRole('textbox', { name: copy.message, exact: true }).fill('αβγδ😀 '.repeat(6) + '?')
    await page.getByRole('button', { name: copy.next, exact: true }).click()
    const outputs = page.getByRole('table', { name: copy.outputs, exact: true })
    await expect(outputs).toContainText('βγδ😀α '.repeat(6) + '?')
    expect(workers.some((url) => url.includes('worker'))).toBe(true)
    const region = page.getByRole('region', { name: copy.region, exact: true })
    const control = region.getByRole('slider', { name: copy.control, exact: true })
    await expect(control).toHaveAttribute('aria-orientation', 'vertical')
    await control.scrollIntoViewIfNeeded()
    const handle = (await control.boundingBox())!
    const track = (await region.locator('[data-caesar-control] .bp6-slider-track').first().boundingBox())!
    const before = await executions()
    const committed = await outputs.innerText()
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    for (const shift of [2, 3]) {
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 - (shift - 1) * track.height / 8)
      await expect(control).toHaveAttribute('aria-valuenow', String(shift))
      await expect(region.getByText(`${copy.preview}${shift}`, { exact: true })).toBeVisible()
      await expect(region.getByText(`${copy.committed}1`, { exact: true })).toBeVisible()
      expect(await outputs.innerText()).toBe(committed)
      expect(await executions()).toEqual(before)
    }
    const preview = region.getByLabel(`${copy.locale === 'en-US' ? 'Preview' : '预览'} α ${copy.moves} 0 3`, { exact: true })
    await expect(preview.first().locator('[aria-current="true"]')).toHaveText('δ')
    await page.mouse.up()
    await expect(outputs).toContainText('δ😀αβγ '.repeat(6) + '?')
    await expect(region.getByText(`${copy.committed}3`, { exact: true })).toBeVisible()
    const released = await executions()
    expect(released.slice(before.length).some(({ id, shift }) => shift === 3 && !before.some((old) => old.id === id))).toBe(true)

    await page.getByRole('button', { name: copy.previous, exact: true }).click()
    await expect(page.getByRole('textbox', { name: copy.shiftInput, exact: true })).toHaveValue('3')
    await page.getByRole('button', { name: copy.next, exact: true }).click()
    await control.focus()
    for (let shift = 2; shift >= -1; shift -= 1) {
      await control.press('ArrowDown')
      await expect(region.getByText(`${copy.committed}${shift}`, { exact: true })).toBeVisible()
      await expect(control).toBeFocused()
    }
    await expect(outputs).toContainText('😀αβγδ '.repeat(6) + '?')
    expect((await executions()).some(({ shift }) => shift === -1)).toBe(true)
    expect(await control.evaluate((element) => {
      const style = getComputedStyle(element)
      return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0
    })).toBe(true)
    const reel = region.getByLabel(`α ${copy.moves} 0 4`, { exact: true }).first()
    await expect(reel.locator('[aria-current="true"]')).toHaveText('😀')
    if (reducedMotion === 'reduce') {
      expect(await reel.locator('div').evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s')
    }

    const colors: string[] = []
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 })
      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme, reducedMotion })
        await expect(page.locator(`[data-theme="${theme}"]`)).toBeVisible()
        await expect(control).toBeVisible()
        const cells = await region.locator('[data-mapped]').evaluateAll((elements) => elements.map((element) => {
          const box = element.getBoundingClientRect()
          return { x: box.x, right: box.right, y: box.y }
        }))
        const controlBox = (await control.boundingBox())!
        expect(Math.abs(cells[0].y - cells[1].y)).toBeLessThan(1)
        expect(controlBox.x).toBeGreaterThanOrEqual(Math.max(...cells.map((cell) => cell.right)))
        if (width === 390) expect(cells.some((cell) => cell.y > cells[0].y + 1)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        colors.push(await reel.evaluate((element) => `${getComputedStyle(element).color}/${getComputedStyle(element).backgroundColor}`))
        await page.screenshot({ path: testInfo.outputPath(`caesar-${copy.locale}-${width}-${theme}.png`), fullPage: true })
      }
    }
    expect(colors[0]).not.toBe(colors[1])
    expect(colors[2]).not.toBe(colors[3])
    await page.getByRole('button', { name: copy.previous, exact: true }).click()
    await expect(page.getByRole('textbox', { name: copy.shiftInput, exact: true })).toHaveValue('-1')
    expect(errors).toEqual([])
  })
}

test('rolls both signed Caesar previews without committing intermediate values', async ({ page }) => {
  test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses synthetic Lesson documents through the real Learning route')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() => {
    localStorage.setItem('i18nextLng', 'en-US')
    const state = window as Window & { caesarExecutionCount: number }
    state.caesarExecutionCount = 0
    const send = Worker.prototype.postMessage
    Worker.prototype.postMessage = function (request: unknown) {
      if ((request as { kind?: string }).kind === 'execute') state.caesarExecutionCount += 1
      send.call(this, request)
    }
  })
  await page.route('**/query', async (route) => {
    const operation = route.request().postDataJSON()
    await route.fulfill({ json: { data: operation.operationName === 'LearningCatalog'
      ? { learning: { lessonCategories: [] } }
      : { lessonDocuments: { lesson: caesarV2Documents.lesson, locale: caesarV2Documents.locales['en-US'] } },
    } })
  })
  for (const example of [
    { initial: 1, previews: [[2, 2, 'γ'], [3, 3, 'δ']], output: 'δ😀β ?' },
    { initial: -1, previews: [[-2, 3, 'δ'], [-3, 2, 'γ']], output: 'γδα ?' },
  ] as const) {
    await page.goto('/learning/caesar-v2')
    await page.getByRole('textbox', { name: 'Signed shift', exact: true }).fill(String(example.initial))
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    const region = page.getByRole('region', { name: 'Classical cipher position mapping', exact: true })
    const control = region.getByRole('slider', { name: 'Caesar shift', exact: true })
    await control.scrollIntoViewIfNeeded()
    await region.getByLabel(`α moves 0 ${example.initial > 0 ? 1 : 4}`, { exact: true }).locator('div').evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished))
    })
    const outputs = page.getByRole('table', { name: 'Graph outputs', exact: true })
    const committed = await outputs.innerText()
    const executions = await page.evaluate(() => (window as Window & { caesarExecutionCount: number }).caesarExecutionCount)
    const handle = (await control.boundingBox())!
    const track = (await region.locator('[data-caesar-control] .bp6-slider-track').first().boundingBox())!
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    for (const [shift, target, symbol] of example.previews) {
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 - (shift - example.initial) * track.height / 8)
      await expect(control).toHaveAttribute('aria-valuenow', String(shift))
      const reel = region.getByLabel(`Preview α moves 0 ${target}`, { exact: true }).locator('div')
      const motion = await reel.evaluate(async (element) => {
        const start = element.getBoundingClientRect().y
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        return { distance: element.getBoundingClientRect().y - start, running: element.getAnimations().some((animation) => animation.playState === 'running') }
      })
      expect(motion.running).toBe(true)
      expect(motion.distance * example.initial).toBeLessThan(0)
      await reel.evaluate(async (element) => { await Promise.all(element.getAnimations().map((animation) => animation.finished)) })
      await expect(reel.locator('[aria-current="true"]')).toHaveText(symbol)
      expect(await outputs.innerText()).toBe(committed)
      expect(await page.evaluate(() => (window as Window & { caesarExecutionCount: number }).caesarExecutionCount)).toBe(executions)
    }
    await page.mouse.up()
    await expect(outputs).toContainText(example.output)
    await page.getByRole('button', { name: 'Previous', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Signed shift', exact: true })).toHaveValue(String(example.previews[1][0]))
  }
})
