import { expect, test, type Page } from '@playwright/test'
import { aesKeyExpansionDemoDocuments } from '../demos/aesKeyExpansionLesson'
import { aesOverlayFixturePresentation } from './aes-learning-fixture'

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

const mockLessonDocuments = async (
  page: Page,
  documentFor: (language: keyof typeof locales) => { lesson: string; locale: string | null },
) => {
  await page.route('**/query', async (route) => {
    const request = route.request().postDataJSON()
    if (request?.operationName === 'LearningCatalog') {
      return route.fulfill({ json: { data: { learning: { lessonCategories: [] } } } })
    }
    if (request?.operationName !== 'LessonDocuments') {
      throw new Error(`Unexpected Learning GraphQL operation: ${request?.operationName}`)
    }
    const language = request.variables?.language === 'zh-CN' ? 'zh-CN' : 'en-US'
    return route.fulfill({ json: { data: { lessonDocuments: documentFor(language) } } })
  })
}

test.describe('Avalanche Visualizer (#32)', () => {
  test('renders an accessible continuous comparison and preserves selection on resize', async ({ page }) => {
    test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses the synthetic Lesson fixture')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(() => {
      const bits = (bytes: number[]) => ({ type: { family: 'bits', size: 16 }, bytes: Uint8Array.from(bytes) })
      const value = (left: number[], right: number[], mask: number[]) => ({
        complete: true,
        left: bits(left),
        right: bits(right),
        mask: bits(mask),
        changedBits: 8,
        ratio: 0.5,
      })
      const left = [0x0f, 0x0f]
      const right = [0x00, 0xff]
      const mask = [0x0f, 0xf0]
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
              executions: {
                baseline: { trace: [], outputs: {}, traceStatus: { truncated: false, retained: 0, dropped: 0 } },
                changed: { trace: [], outputs: {}, traceStatus: { truncated: false, retained: 0, dropped: 0 } },
              },
              checkpoints: [
                { path: 'plaintext', stage: 'input', ...value(left, right, mask) },
                { path: 'key-mix', stage: 'key-mix', ...value([0, 0], [0x0f, 0xf0], mask) },
                { path: 'substitute', stage: 'substitute', ...value([0, 0], [0x0f, 0xf0], mask) },
                { path: 'permute', stage: 'permute', ...value([0, 0], [0x0f, 0xf0], mask) },
                { path: 'output', stage: 'output', ...value([0, 0], [0x0f, 0xf0], mask) },
              ],
            },
          } } as MessageEvent<unknown>)))
        }

        terminate(): void {}
      }
      Object.defineProperty(window, 'Worker', { configurable: true, value: WorkerStub })
    })
    await mockLessonDocuments(page, (language) => ({ lesson, locale: locales[language] ?? null }))

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
    await page.addInitScript(() => {
      const bits = (bytes: number[]) => ({ type: { family: 'bits', size: 16 }, bytes: Uint8Array.from(bytes) })
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
              truncated: true,
              executions: {
                baseline: {
                  trace: [{ path: 'plaintext', level: 'detail', stage: 'input', value: bits([0x0f, 0x0f]) }],
                  outputs: {},
                  traceStatus: { truncated: true, retained: 1, dropped: 1 },
                },
                changed: { trace: [], outputs: {}, traceStatus: { truncated: true, retained: 0, dropped: 2 } },
              },
              checkpoints: [{ path: 'plaintext', stage: 'input', complete: false }],
            },
          } } as MessageEvent<unknown>)))
        }

        terminate(): void {}
      }
      Object.defineProperty(window, 'Worker', { configurable: true, value: WorkerStub })
    })
    await mockLessonDocuments(page, (language) => ({
      lesson: lesson.replace('inputs:\n', 'limits: {traceEvents: 14}\ninputs:\n'),
      locale: locales[language] ?? null,
    }))

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
    await mockLessonDocuments(page, (language) => ({
      lesson: lesson.replace('steps:\n', 'steps:\n  - id: intro\n    prose: intro\n'),
      locale: (locales[language] ?? locales['en-US']).replace('texts: {}', 'texts:\n  intro: Intro'),
    }))

    await page.goto('/learning/avalanche')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('heading', { name: 'Visualizer unavailable' })).toBeVisible()
    await expect(page.getByRole('table', { name: 'Retained comparison data' })).toContainText('—')
    await expect(page.getByRole('button', { name: 'Previous' })).toBeEnabled()
  })

  test('executes an initial comparison before advancing', async ({ page }) => {
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
              executions: {
                baseline: { trace: [], outputs: {}, traceStatus: { truncated: false, retained: 0, dropped: 0 } },
                changed: { trace: [], outputs: {}, traceStatus: { truncated: false, retained: 0, dropped: 0 } },
              },
              checkpoints: [],
            },
          } } as MessageEvent<unknown>)))
        }

        terminate(): void {}
      }
      Object.defineProperty(window, 'Worker', { configurable: true, value: WorkerStub })
    })
    await mockLessonDocuments(page, (language) => ({
      lesson: `${lesson}  - id: prose\n    prose: prose\n`,
      locale: (locales[language] ?? locales['en-US']).replace('texts: {}', 'texts:\n  prose: Done'),
    }))

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
    await mockLessonDocuments(page, (language) => ({ lesson: `${lesson}${executionStep}`, locale: locales[language] ?? null }))

    await page.goto('/learning/avalanche')
    await expect(page.getByRole('heading', { name: 'Continuous avalanche comparison' })).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('heading', { name: 'Teaching SPN execution' })).toBeVisible()
  })

  test('marks truncated execution traces and isolates renderer failures', async ({ page }) => {
    test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses the synthetic Lesson fixture')
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en-US'))
    await mockLessonDocuments(page, (language) => ({
      lesson: executionLesson('limits: {traceEvents: 2}\n'),
      locale: locales[language] ?? null,
    }))

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
    await mockLessonDocuments(page, (language) => ({
      lesson: `${executionLesson()}  - id: prose\n    prose: prose\n`,
      locale: (locales[language] ?? locales['en-US']).replace('texts: {}', 'texts:\n  prose: Done'),
    }))

    await page.goto('/learning/spn')
    await expect(page.getByRole('heading', { name: 'Visualizer unavailable' })).toBeVisible()
    await expect(page.getByRole('table', { name: 'Retained execution data' })).toContainText('—')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Done')).toBeVisible()
  })
})

test.describe('Teaching key schedule through the generic key-expansion mode (#93)', () => {
  test('renders full-state Nk=2 schedule rows with its teaching boundary, no word log or overlay', async ({ page }) => {
    test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses the synthetic Lesson fixture')
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en-US'))
    await mockLessonDocuments(page, () => ({
      lesson: aesKeyExpansionDemoDocuments.lesson,
      locale: aesKeyExpansionDemoDocuments.locales['en-US'],
    }))

    await page.goto('/learning/aes-key-expansion')
    await expect(page.getByRole('heading', { name: 'AES-style teaching key schedule', level: 2 })).toBeVisible()
    const section = page.getByRole('region', { name: 'AES-style teaching key schedule (64-bit key, not a FIPS-197 variant)', exact: true })
    await expect(section).toBeVisible()
    await expect(section.getByText(/declares no key-expansion presentation/)).toHaveCount(0)
    await expect(section.locator('[data-row-id="input"] th')).toHaveText('Input')
    await expect(section.locator('[data-row-id="rot-word-1-w6"] th')).toHaveText('RotWord 1 (word 6)')
    await expect(section.locator('[data-row-id="round-key-1"] th')).toHaveText('Round key 1')
    await expect(section.locator('[data-row-id^="word-"]')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Key expansion', exact: true })).toHaveCount(0)
  })
})

test.describe('Shared AES presentation fixtures (#121)', () => {
  test('opens, aligns, switches, and closes a tiny anchored schedule lane', async ({ page }) => {
    test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses the synthetic renderer fixture')
    await page.goto('/')
    await page.evaluate(async () => {
      const fixture = await import('/e2e/aes-learning-fixture.tsx')
      const root = fixture.mountAesFixture(fixture.aesOverlayFixturePresentation)
      ;(window as Window & { __aesFixture?: { unmount: () => void } }).__aesFixture = root
    })
    const section = page.getByRole('region', { name: 'AES anchored overlay fixture' })
    await section.getByRole('button', { name: 'Round key 0: 0x0011' }).click()
    const lane = section.getByRole('region', { name: 'Key expansion' })
    await expect(lane).toBeVisible()
    await expect(lane.getByText('Schedule input')).toBeVisible()
    const firstRow = await lane.locator('tr[data-row-id="state-0"]').boundingBox()
    const firstLane = await lane.getByText('Schedule input').evaluate((element) => element.closest('tr')?.getBoundingClientRect().toJSON())
    expect(Math.abs((firstRow?.y ?? 0) - (firstLane?.y ?? 0))).toBeLessThan(2)
    const paddingLane = lane.locator('[data-lane-row="schedule-round-key-0"]')
    await expect(paddingLane).toHaveCount(1)
    expect(await paddingLane.evaluate((element) => element.closest('tr')?.querySelector('th')?.textContent)).toBe('')
    await section.getByRole('button', { name: 'Round key 1: 0x2233' }).click()
    await expect(section.getByRole('button', { name: 'Round key 1: 0x2233' })).toHaveAttribute('aria-pressed', 'true')
    const secondRow = await lane.locator('tr[data-row-id="state-1"]').boundingBox()
    const secondLane = await lane.locator('[data-lane-row="schedule-round-key-1"]').evaluate((element) => element.closest('tr')?.getBoundingClientRect().toJSON())
    expect(Math.abs((secondRow?.y ?? 0) - (secondLane?.y ?? 0))).toBeLessThan(2)
    await lane.getByRole('button', { name: 'Close key expansion' }).click()
    await expect(lane).toBeHidden()
    await expect(section.locator('[data-lane-row="schedule-round-key-0"]')).toHaveCount(0)
  })
})
