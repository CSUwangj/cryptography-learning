import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const lesson = readFileSync(new URL('../src/lesson_runtime/fixture/lesson.yaml', import.meta.url), 'utf8')
const locales = {
  'en-US': readFileSync(new URL('../src/lesson_runtime/fixture/locales/en-US.yaml', import.meta.url), 'utf8'),
  'zh-CN': readFileSync(new URL('../src/lesson_runtime/fixture/locales/zh-CN.yaml', import.meta.url), 'utf8'),
}

const caesarLesson = `version: 1
id: caesar
default_locale: en-US
inputs:
  plaintext: {type: {family: alphabet-text, mapping: latin}, encoding: text, default: "Ab C!"}
  shift: {type: {family: integer, signed: true, safe: true}, encoding: integer, default: 3}
  policy: {type: {family: alphabet-policy}, encoding: policy, default: preserve}
constants: {}
graphs:
  caesar:
    alphabetMappings: [{id: latin, symbols: [A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z]}]
    nodes:
      - {id: text, operation: core.source@1, parameters: {type: {family: alphabet-text, mapping: latin}}}
      - {id: shift, operation: core.source@1, parameters: {type: {family: integer, signed: true, safe: true}}}
      - {id: policy, operation: core.source@1, parameters: {type: {family: alphabet-policy}}}
      - {id: cipher, operation: classical.caesar@1, inputs: {text: {node: text, port: value}, shift: {node: shift, port: value}, policy: {node: policy, port: value}}}
    outputs: [{node: cipher, port: text}]
steps:
  - id: inputs
    inputs:
      - {input: plaintext, prompt: plaintext}
      - {input: shift, prompt: shift}
      - {input: policy, prompt: policy}
  - id: execute
    execute:
      graph: caesar
      bindings:
        text.value: {input: plaintext}
        shift.value: {input: shift}
        policy.value: {input: policy}
`

const caesarLocales = {
  'en-US': `title: Caesar
summary: Encrypt text.
texts: {plaintext: Plaintext, shift: Shift, policy: Policy}
`,
  'zh-CN': `title: 凯撒
summary: 加密文本。
texts: {plaintext: 明文, shift: 位移, policy: 策略}
`,
}

test.describe('Learning Lesson (#30)', () => {
  test('loads catalog and deep link, retains input, and executes the XOR Step', async ({ page }) => {
    const progressRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().endsWith('/query') && /completion|progress|practice/i.test(request.postDataJSON()?.query ?? '')) {
        progressRequests.push(request.postDataJSON()?.query ?? '')
      }
    })
    if (!process.env.PLAYWRIGHT_BASE_URL) {
      await page.route('**/query', async (route) => {
        const variables = route.request().postDataJSON()?.variables
        if (variables?.lessonId) {
          await route.fulfill({
            json: {
              data: {
                lessonDocuments: {
                  lesson,
                  locale: locales[variables.language as keyof typeof locales] ?? null,
                },
              },
            },
          })
          return
        }
        await route.fulfill({
          json: {
            data: {
              learning: {
                lessonCategories: [{
                  id: 'fundamentals',
                  name: [
                    { lang: 'en-US', text: 'Fundamentals' },
                    { lang: 'zh-CN', text: '基础' },
                  ],
                  lessons: [{ id: 'xor-intro' }],
                }],
              },
            },
          },
        })
      })
    }

    await page.goto('/learning')
    await expect(page.getByText('Fundamentals')).toBeVisible()
    await page.getByRole('link', { name: 'xor-intro' }).click()
    await expect(page.getByRole('heading', { name: 'Explore XOR' })).toBeVisible()

    await page.getByRole('button', { name: 'Next' }).click()
    const input = page.getByRole('textbox')
    await expect(input).toHaveValue('0x0f0f')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('0x0ff0 (bits<16>)')).toBeVisible()
    await expect(page.getByText('Correct output.')).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'XOR' }).click()
    await expect(page.getByText('This graph applies XOR.')).toBeVisible()

    await page.getByRole('button', { name: 'Previous' }).click()
    await page.getByRole('button', { name: 'Previous' }).click()
    await input.fill('0x0000')
    await page.getByRole('button', { name: 'Language' }).click()
    await page.getByRole('option', { name: 'Chinese(Simplified)' }).click()
    await expect(input).toHaveValue('0x0000')
    await expect(page.getByText('请输入以 0x 开头的四位十六进制数。')).toBeVisible()
    await page.getByRole('button', { name: '下一步' }).click()
    await expect(page.getByText('0x00ff (bits<16>)')).toBeVisible()

    await page.goto('/learning/xor-intro')
    await expect(page.getByRole('heading', { name: '探索异或' })).toBeVisible()
    expect(progressRequests).toEqual([])
  })

  test('selects Preserve or Strict policy in Learning', async ({ page }) => {
    test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses the synthetic Lesson fixture')
    await page.route('**/query', async (route) => {
      const variables = route.request().postDataJSON()?.variables
      await route.fulfill({
        json: {
          data: {
            lessonDocuments: {
              lesson: caesarLesson,
              locale: caesarLocales[variables.language as keyof typeof caesarLocales] ?? null,
            },
          },
        },
      })
    })

    await page.goto('/learning/caesar')
    await page.getByRole('button', { name: 'Next' }).click()
    const policy = page.getByLabel('Policy')
    await expect(policy).toHaveValue('preserve')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Db F! (alphabet-text<latin>)')).toBeVisible()
    await page.getByRole('button', { name: 'Previous' }).click()
    await policy.selectOption('strict')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText(/cipher\.unmapped-symbol/)).toBeVisible()
  })

  test('keeps navigation available after an accepted operation diagnostic', async ({ page }) => {
    test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses the synthetic Worker fixture')
    const acceptedLesson = lesson.replace(
      '    check:\n      kind: equal',
      '    accepted_error_codes: [operation-failed]\n    check:\n      kind: equal',
    )
    await page.addInitScript(() => {
      class WorkerStub {
        private listeners: Array<(event: MessageEvent<unknown>) => void> = []

        addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
          if (type === 'message') this.listeners.push(listener)
        }

        postMessage(request: { requestId: string }): void {
          queueMicrotask(() => this.listeners.forEach((listener) => listener({
            data: {
              requestId: request.requestId,
              kind: 'diagnostic',
              diagnostics: [{ code: 'operation-failed', message: 'Operation execution failed.', path: 'mixed', details: {} }],
            },
          } as MessageEvent<unknown>)))
        }

        terminate(): void {}
      }
      Object.defineProperty(window, 'Worker', { value: WorkerStub })
    })
    await page.route('**/query', async (route) => {
      const variables = route.request().postDataJSON()?.variables
      await route.fulfill({
        json: {
          data: {
            lessonDocuments: {
              lesson: acceptedLesson,
              locale: locales[variables.language as keyof typeof locales] ?? null,
            },
          },
        },
      })
    })

    await page.goto('/learning/xor-intro')
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('operation-failed: Operation execution failed. (mixed)')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Previous' })).toBeEnabled()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('button', { name: 'XOR' })).toBeVisible()
  })

  test('keeps navigation available after a bounded execution failure', async ({ page }) => {
    test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'uses the synthetic Lesson fixture')
    const boundedLesson = lesson.replace('steps:\n', 'limits: {inputBytes: 1}\nsteps:\n')
    await page.route('**/query', async (route) => {
      const variables = route.request().postDataJSON()?.variables
      await route.fulfill({
        json: {
          data: {
            lessonDocuments: {
              lesson: boundedLesson,
              locale: locales[variables.language as keyof typeof locales] ?? null,
            },
          },
        },
      })
    })

    await page.goto('/learning/xor-intro')
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText(/execution\.input-limit/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Previous' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  test('container handles locale fallback, malformed content, and unknown Lessons', async ({ page }) => {
    test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'requires the mounted container fixture')
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh-CN'))

    await page.goto('/learning/fallback-xor')
    await expect(page.getByRole('heading', { name: 'Fallback XOR' })).toBeVisible()

    await page.goto('/learning/malformed-yaml')
    await expect(page.getByText(/lesson\.yaml-syntax/)).toBeVisible()

    await page.goto('/learning/unknown-lesson')
    await expect(page.getByRole('heading', { name: '未找到' })).toBeVisible()
  })
})
