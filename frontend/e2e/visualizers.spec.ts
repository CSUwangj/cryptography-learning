import { expect, test } from '@playwright/test'

const lesson = `version: 1
id: avalanche
default_locale: en-US
inputs:
  plaintext: {type: {family: bits, size: 16}, encoding: hex, default: "0x0f0f"}
  changed_plaintext: {type: {family: bits, size: 16}, encoding: hex, default: "0x00ff"}
constants:
  key: {type: {family: bits, size: 16}, encoding: hex, value: "0x0f0f"}
graphs:
  teaching-spn:
    nodes:
      - {id: plaintext, operation: core.source@1, parameters: {type: {family: bits, size: 16}}}
      - {id: key, operation: core.source@1, parameters: {type: {family: bits, size: 16}}}
      - id: round
        repeat: {subgraph: round, count: 2}
        inputs:
          permute: {node: plaintext, port: value}
          key: {node: key, port: value}
    outputs: [{node: round, port: permute}]
    traceLevel: detail
    subgraphs:
      round:
        inputs:
          - {name: permute, type: {family: bits, size: 16}}
          - {name: key, type: {family: bits, size: 16}}
        outputs: [{name: permute, type: {family: bits, size: 16}}]
        nodes:
          - {id: key, operation: core.output@1, inputs: {value: {node: "@input", port: key}}}
          - {id: key-mix, operation: core.xor@1, inputs: {left: {node: "@previous", port: permute}, right: {node: key, port: value}}}
          - {id: substitute, operation: spn.substitute@1, inputs: {value: {node: key-mix, port: value}}, parameters: {sBox: [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7]}}
          - {id: permute, operation: spn.permute@1, inputs: {value: {node: substitute, port: value}}, parameters: {permutation: [0, 2, 1, 3]}}
steps:
  - id: compare
    visualizer:
      id: avalanche@1
      compare:
        kind: avalanche
        graph: teaching-spn
        bindings:
          plaintext:
            baseline: {input: plaintext}
            changed: {input: changed_plaintext}
          key: {constant: key}
        traceLevel: detail
`

const locales = {
  'en-US': 'title: "Avalanche"\nsummary: "Compare a plaintext change."\ntexts: {}',
  'zh-CN': 'title: "雪崩"\nsummary: "比较明文变化。"\ntexts: {}',
}

const executionStep = `  - id: explain
    execute:
      graph: teaching-spn
      bindings:
        plaintext.value: {input: plaintext}
        key.value: {constant: key}
    visualizer:
      id: teaching-spn@1
      bindings:
        trace: {step: explain, trace: output}
      options: {}
`

const executionLesson = (limits = ''): string =>
  lesson.replace('inputs:\n', `${limits}inputs:\n`).replace(/steps:[\s\S]*/, `steps:\n${executionStep}`)

const expectGraphLayout = async (page: import('@playwright/test').Page, title: string) => {
  const region = page.getByRole('region', { name: title })
  await expect(region.locator('svg[data-lineage] line').first()).toBeAttached()
  const firstBits = await region.getByRole('button', { name: /, (Bit|位) 0: / }).all()
  expect(firstBits.length).toBeGreaterThan(1)
  const columns = new Set<number>()
  for (const bit of firstBits) columns.add(Math.round((await bit.boundingBox())!.x))
  expect(columns.size).toBe(1)
}

const expectTraceValue = async (page: import('@playwright/test').Page, title: string, value: string) =>
  expect(page.getByRole('region', { name: title }).getByRole('cell').filter({ hasText: value }).first()).toBeVisible()

test.describe('Avalanche Visualizer (#32)', () => {
  test('renders an accessible continuous comparison and preserves selection on resize', async ({ page }) => {
    test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses the synthetic Lesson fixture')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.route('**/query', async (route) => {
      const language = route.request().postDataJSON()?.variables?.language as keyof typeof locales
      await route.fulfill({ json: { data: { lessonDocuments: { lesson, locale: locales[language] ?? null } } } })
    })

    await page.goto('/learning/avalanche')
    await expect(page.getByRole('heading', { name: 'Continuous avalanche comparison' })).toBeVisible()
    await expect(page.getByRole('table', { name: 'Comparison summary' })).toContainText('0.5')
    await expectTraceValue(page, 'Continuous avalanche comparison', '0x0f0f')
    await expectGraphLayout(page, 'Continuous avalanche comparison')

    const bit = page.getByRole('button', { name: /plaintext, Bit 4/ })
    await bit.focus()
    await bit.press('Enter')
    await expect(page.getByText(/Selected bit lineage: plaintext, Bit 4/)).toBeVisible()
    await page.setViewportSize({ width: 600, height: 700 })
    await expect(bit).toBeFocused()
    await expectGraphLayout(page, 'Continuous avalanche comparison')

    await page.getByRole('button', { name: 'Language' }).click()
    await page.getByRole('option', { name: 'Chinese(Simplified)' }).click()
    await expect(page.getByRole('heading', { name: '连续雪崩比较' })).toBeVisible()
    await expect(page.getByText(/所选位的谱系: 明文, 位 4/)).toBeVisible()
    await expectGraphLayout(page, '连续雪崩比较')
  })

  test('marks retained snapshots as incomplete instead of discarding them', async ({ page }) => {
    test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses the synthetic Lesson fixture')
    await page.route('**/query', async (route) => {
      const language = route.request().postDataJSON()?.variables?.language as keyof typeof locales
      await route.fulfill({ json: { data: { lessonDocuments: {
        lesson: lesson.replace('inputs:\n', 'limits: {traceEvents: 14}\ninputs:\n'),
        locale: locales[language] ?? null,
      } } } })
    })

    await page.goto('/learning/avalanche')
    await expect(page.getByRole('status').filter({ hasText: 'Trace is incomplete. Raw retained values remain visible; paired differences and lineage stop at the gap.' })).toBeVisible()
    await expect(page.getByRole('rowheader', { name: 'Trace gap' }).last()).toBeVisible()
  })

  test('contains renderer failures with localized retained data', async ({ page }) => {
    test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses the synthetic Lesson fixture')
    await page.addInitScript(() => {
      class WorkerStub {
        private listeners: Array<(event: MessageEvent<unknown>) => void> = []

        addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
          if (type === 'message') this.listeners.push(listener)
        }

        postMessage(request: { requestId: string }): void {
          queueMicrotask(() => this.listeners.forEach((listener) => listener({ data: {
            requestId: request.requestId,
            kind: 'comparison',
            comparison: {
              traceLevel: 'detail',
              truncated: false,
              executions: { baseline: { trace: [], outputs: {}, traceStatus: { truncated: false, retained: 0, dropped: 0 } }, changed: { trace: [], outputs: {}, traceStatus: { truncated: false, retained: 0, dropped: 0 } } },
              checkpoints: [{ path: 'plaintext', stage: 'input', complete: true, left: { type: { family: 'bits', size: 16 }, bytes: null }, right: { type: { family: 'bits', size: 16 }, bytes: null }, mask: { type: { family: 'bits', size: 16 }, bytes: null }, changedBits: 1, ratio: 1 / 16 }],
            },
          } } as MessageEvent<unknown>)))
        }

        terminate(): void {}
      }
      Object.defineProperty(window, 'Worker', { value: WorkerStub })
    })
    await page.route('**/query', async (route) => {
      const language = route.request().postDataJSON()?.variables?.language as keyof typeof locales
      await route.fulfill({ json: { data: { lessonDocuments: {
        lesson: lesson.replace('steps:\n', 'steps:\n  - id: intro\n    prose: intro\n'),
        locale: (locales[language] ?? locales['en-US']).replace('texts: {}', 'texts:\n  intro: Intro'),
      } } } })
    })

    await page.goto('/learning/avalanche')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('heading', { name: 'Visualizer unavailable' })).toBeVisible()
    await expect(page.getByRole('table', { name: 'Retained comparison data' })).toContainText('—')
    await expect(page.getByRole('button', { name: 'Previous' })).toBeEnabled()
  })

  test('executes an initial comparison before advancing', async ({ page }) => {
    test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses the synthetic Lesson fixture')
    await page.route('**/query', async (route) => {
      const language = route.request().postDataJSON()?.variables?.language as keyof typeof locales
      await route.fulfill({ json: { data: { lessonDocuments: {
        lesson: `${lesson}  - id: prose\n    prose: prose\n`,
        locale: (locales[language] ?? locales['en-US']).replace('texts: {}', 'texts:\n  prose: Done'),
      } } } })
    })

    await page.goto('/learning/avalanche')
    await expect(page.getByRole('heading', { name: 'Continuous avalanche comparison' })).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Done')).toBeVisible()
  })
})

test.describe('Teaching SPN Visualizer (#33)', () => {
  test('does not serve the maintainer review demos from the application', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en-US'))
    for (const path of ['/testspn', '/testavalanche']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: 'Not Found' })).toBeVisible()
      await expect(page.getByRole('region', { name: /Teaching SPN execution|Continuous avalanche comparison/ })).toHaveCount(0)
    }
  })

  test('uses one synthetic Lesson for both descriptors', async ({ page }) => {
    test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses the synthetic Lesson fixture')
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en-US'))
    await page.route('**/query', async (route) => {
      const language = route.request().postDataJSON()?.variables?.language as keyof typeof locales
      await route.fulfill({ json: { data: { lessonDocuments: { lesson: `${lesson}${executionStep}`, locale: locales[language] ?? null } } } })
    })

    await page.goto('/learning/avalanche')
    await expect(page.getByRole('heading', { name: 'Continuous avalanche comparison' })).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('heading', { name: 'Teaching SPN execution' })).toBeVisible()
  })

  test('marks truncated execution traces and isolates renderer failures', async ({ page }) => {
    test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses the synthetic Lesson fixture')
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en-US'))
    await page.route('**/query', async (route) => {
      const language = route.request().postDataJSON()?.variables?.language as keyof typeof locales
      await route.fulfill({ json: { data: { lessonDocuments: {
        lesson: executionLesson('limits: {traceEvents: 2}\n'),
        locale: locales[language] ?? null,
      } } } })
    })

    await page.goto('/learning/spn')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Trace is incomplete. Retained raw values remain visible; lineage stops at missing stages.').first()).toBeVisible()
  })

  test('leaves the Lesson usable after an execution renderer failure', async ({ page }) => {
    test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses the synthetic Lesson fixture')
    await page.addInitScript(() => {
      class WorkerStub {
        private listeners: Array<(event: MessageEvent<unknown>) => void> = []

        addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
          if (type === 'message') this.listeners.push(listener)
        }

        postMessage(request: { requestId: string }): void {
          queueMicrotask(() => this.listeners.forEach((listener) => listener({ data: {
            requestId: request.requestId,
            kind: 'snapshot',
            snapshot: {
              outputs: {},
              trace: [{ path: 'plaintext', level: 'detail', stage: 'input', value: { type: { family: 'bits', size: 16 }, bytes: null } }],
              traceStatus: { truncated: false, retained: 1, dropped: 0 },
            },
          } } as MessageEvent<unknown>)))
        }

        terminate(): void {}
      }
      Object.defineProperty(window, 'Worker', { value: WorkerStub })
      localStorage.setItem('i18nextLng', 'en-US')
    })
    await page.route('**/query', async (route) => {
      const language = route.request().postDataJSON()?.variables?.language as keyof typeof locales
      await route.fulfill({ json: { data: { lessonDocuments: {
        lesson: `${executionLesson()}  - id: prose\n    prose: prose\n`,
        locale: (locales[language] ?? locales['en-US']).replace('texts: {}', 'texts:\n  prose: Done'),
      } } } })
    })

    await page.goto('/learning/spn')
    await expect(page.getByRole('heading', { name: 'Visualizer unavailable' })).toBeVisible()
    await expect(page.getByRole('table', { name: 'Retained execution data' })).toContainText('—')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Done')).toBeVisible()
  })
})
