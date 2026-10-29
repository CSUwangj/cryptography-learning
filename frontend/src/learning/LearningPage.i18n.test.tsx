import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { OverlaysProvider } from '@blueprintjs/core'
import { MemoryRouter } from 'react-router-dom'
import { of } from 'rxjs'
import i18n from '../app/i18n'
import { LearningPage } from './index'
import { compileLesson, createBrowserLessonSession } from '../lesson_runtime'
import type { Diagnostic } from '../crypto_graph'

const lesson = `version: 1
id: locale-split
default_locale: en-US
constants: {}
inputs:
  plaintext: {type: {family: bits, size: 8}, encoding: hex-block, default: "12"}
  changed_plaintext: {type: {family: bits, size: 8}, encoding: hex-block, default: "92"}
graphs: {}
steps:
  - id: experiment
    prose: intro
    bit_flip:
      - {input: plaintext, changed: changed_plaintext, prompt: source}
`
const content = 'title: Authored English Lesson\nsummary: Authored summary.\ntexts: {intro: Authored English prose., source: Authored plaintext}\n'
const previousWorker = globalThis.Worker

afterEach(async () => {
  cleanup()
  globalThis.Worker = previousWorker
  await i18n.changeLanguage('en-US')
})

it.each([
  ['en-US', 'Input does not match its declared type and encoding.', 'Operation execution failed.', 'Input does not match its declared type.'],
  ['zh-CN', '输入不符合声明的类型和编码。', '操作执行失败。', '输入不符合声明的类型和编码。'],
  ['fr-FR', 'Input does not match its declared type and encoding.', 'Operation execution failed.', 'Input does not match its declared type.'],
])('resolves diagnostic and unrelated runtime messages through native resources in %s', (language, invalidInput, operationFailed, inputType) => {
  const t = i18n.getFixedT(language, 'translations')
  expect(t('learning.runtime.lesson.invalid-input')).toBe(invalidInput)
  expect(t('learning.runtime.operation-failed')).toBe(operationFailed)
  expect(t('learning.runtime.inputType')).toBe(inputType)
})

it.each(['lesson-invalid-input', 'inputType'])('retains unknown %s diagnostics and source metadata through mounted language changes', async (code) => {
  const unknown: Diagnostic = {
    code, message: 'External $t(learning.policy.preserve) {{unchanged}} <message>&', path: 'external.path',
    span: { file: 'external.yaml', line: 7, column: 11 }, details: { request: 17, retained: true },
  }
  const original = structuredClone(unknown)
  class WorkerStub {
    private listener?: (event: MessageEvent<unknown>) => void
    addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
      if (type === 'message') this.listener = listener
    }
    postMessage(request: { requestId: string }): void {
      queueMicrotask(() => this.listener?.({ data: { requestId: request.requestId, kind: 'diagnostic', diagnostics: [unknown] } } as MessageEvent<unknown>))
    }
    terminate(): void {}
  }
  globalThis.Worker = WorkerStub as unknown as typeof Worker
  const executionLesson = lesson.replace('graphs: {}', `graphs:
  source:
    nodes:
      - {id: value, operation: core.source@1, parameters: {type: {family: bits, size: 8}}}
    outputs: [{node: value, port: value}]`)
    .split('    bit_flip:')[0]
    .replace('    prose: intro', '    prose: intro\n    execute: {graph: source, bindings: {value.value: {input: plaintext}}}')
  const documents = { lesson: executionLesson, locales: { 'en-US': content } }
  const created = createBrowserLessonSession(documents, 'en-US', i18n.getFixedT('en-US', 'translations'))
  if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
  try {
    await created.value.enter()
    expect(created.value.state().executionDiagnostics.experiment).toEqual(original)
    const client = new ApolloClient({
      cache: new InMemoryCache(),
      link: new ApolloLink((operation) => of({ data: operation.operationName === 'LearningCatalog'
        ? { learning: { lessonCategories: [] } }
        : { lessonDocuments: { lesson: executionLesson, locale: content } },
      })),
    })
    render(<ApolloProvider client={client}><MemoryRouter initialEntries={['/learning/locale-split']}><OverlaysProvider>
      <LearningPage />
    </OverlaysProvider></MemoryRouter></ApolloProvider>)
    for (const [language, location] of [['en-US', 'at'], ['zh-CN', '位置'], ['fr-FR', 'at']]) {
      await act(async () => { await i18n.changeLanguage(language) })
      const row = await screen.findByText((text) => text.startsWith(`${code}:`))
      expect(row.textContent).toBe(`${code}: ${original.message} (external.path) ${location} external.yaml:7:11`)
      expect(created.value.updateDocuments(documents, language, i18n.getFixedT(language, 'translations')).ok).toBe(true)
      expect(created.value.state().executionDiagnostics.experiment).toEqual(original)
    }
    expect(unknown).toEqual(original)
  } finally {
    created.value.dispose()
  }
})

it('localizes diagnostic location copy while preserving source coordinates', async () => {
  await i18n.changeLanguage('zh-CN')
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink((operation) => of({ data: operation.operationName === 'LearningCatalog'
      ? { learning: { lessonCategories: [] } }
      : { lessonDocuments: { lesson: lesson.replace('version: 1', 'version: 9'), locale: content } },
    })),
  })
  render(<ApolloProvider client={client}><MemoryRouter initialEntries={['/learning/locale-split']}><OverlaysProvider>
    <LearningPage />
  </OverlaysProvider></MemoryRouter></ApolloProvider>)
  expect(await screen.findByText(/lesson.unsupported-version: 不支持的课程版本。/))
    .toHaveTextContent('位置 lesson.yaml:1:10')
})

it('switches bit-flip UI language while authored Lesson content keeps its own fallback', async () => {
  await i18n.changeLanguage('zh-CN')
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink((operation) => of({ data: operation.operationName === 'LearningCatalog'
      ? { learning: { lessonCategories: [] } }
      : { lessonDocuments: { lesson, locale: operation.variables.language === 'en-US' ? content : null } },
    })),
  })
  render(<ApolloProvider client={client}><MemoryRouter initialEntries={['/learning/locale-split']}><OverlaysProvider>
    <LearningPage />
  </OverlaysProvider></MemoryRouter></ApolloProvider>)
  expect(await screen.findByRole('heading', { name: 'Authored English Lesson' })).toBeVisible()
  expect(screen.getByRole('group', { name: '单比特变化' })).toBeVisible()
  expect(screen.getByLabelText('翻转位（从最高位 0 开始）')).toBeVisible()
  expect(screen.getByText('Authored English prose.')).toBeVisible()

  await act(async () => { await i18n.changeLanguage('fr-FR') })
  expect(await screen.findByRole('group', { name: 'One-bit change' })).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Authored English Lesson' })).toBeVisible()
  expect(screen.getByLabelText('Flip bit (MSB-first, starting at 0)')).toBeVisible()
  expect(screen.getByText('Authored English prose.')).toBeVisible()
})

it('renders retained Lesson input summaries in the UI language and keeps authored prompts and input intact', async () => {
  const inputLesson = lesson.replace('    prose: intro', '    prose: intro\n    inputs: [{input: plaintext, prompt: source}]')
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink((operation) => of({ data: operation.operationName === 'LearningCatalog'
      ? { learning: { lessonCategories: [] } }
      : { lessonDocuments: { lesson: inputLesson, locale: operation.variables.language === 'en-US' ? content : null } },
    })),
  })
  await i18n.changeLanguage('zh-CN')
  render(<ApolloProvider client={client}><MemoryRouter initialEntries={['/learning/locale-split']}><OverlaysProvider>
    <LearningPage />
  </OverlaysProvider></MemoryRouter></ApolloProvider>)
  const input = await screen.findByRole('textbox')
  fireEvent.change(input, { target: { value: 'zz' } })
  for (const [language, summary] of [['zh-CN', '输入不符合声明的类型和编码。'], ['en-US', 'Input does not match its declared type and encoding.'], ['fr-FR', 'Input does not match its declared type and encoding.'], ['zh-CN', '输入不符合声明的类型和编码。']]) {
    await act(async () => { await i18n.changeLanguage(language) })
    expect(await screen.findByText(summary)).toBeVisible()
    expect(input).toHaveValue('zz')
    expect(screen.getByRole('textbox').closest('label')).toHaveTextContent('Authored plaintext')
  }
})

it('renders internal compiler summaries in the mounted UI language while preserving source diagnostics', async () => {
  const invalidLesson = `version: 1
id: locale-split
default_locale: en-US
constants:
  lookup: {kind: table, entryBits: 1, value: [0, 1]}
inputs: {}
graphs: {}
steps: [{id: intro, prose: intro}]
`
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink((operation) => of({ data: operation.operationName === 'LearningCatalog'
      ? { learning: { lessonCategories: [] } }
      : { lessonDocuments: { lesson: invalidLesson, locale: content } },
    })),
  })
  await i18n.changeLanguage('zh-CN')
  render(<ApolloProvider client={client}><MemoryRouter initialEntries={['/learning/locale-split']}><OverlaysProvider>
    <LearningPage />
  </OverlaysProvider></MemoryRouter></ApolloProvider>)
  expect(await screen.findByText(/lesson.v2-feature-in-v1:/)).toHaveTextContent('此功能需要课程版本 2。')
  for (const [language, summary] of [['en-US', 'This feature requires Lesson version 2.'], ['fr-FR', 'This feature requires Lesson version 2.'], ['zh-CN', '此功能需要课程版本 2。']]) {
    await act(async () => { await i18n.changeLanguage(language) })
    expect(await screen.findByText(/lesson.v2-feature-in-v1:/)).toHaveTextContent(summary)
  }
})

it.each([
  { constant: '{kind: table, entryBits: 0, value: []}', code: 'table.entry-bits-out-of-range', detail: 'Table entryBits must be from 1 through 16.', chinese: '表项位宽必须在 1 到 16 位之间。', english: 'Table entry width must be from 1 through 16 bits.' },
  { constant: '{kind: table, entryBits: 1, value: [0]}', code: 'table.length-mismatch', detail: 'Table length does not match entryBits.', chinese: '表长度与表项位宽不匹配。', english: 'Table length does not match its entry width.' },
  { constant: '{kind: table, entryBits: 1, value: [0, 2]}', code: 'table.entry-out-of-range', detail: 'Table entry is out of range.', chinese: '表项超出声明的位宽。', english: 'A table entry is outside its declared bit width.' },
  { constant: '{type: {family: bits, size: 4}, encoding: hex, value: "0x5"}', code: 'lesson.unknown-constant', detail: 'Parameter references an unknown constant.', chinese: '引用的常量未声明。', english: 'The referenced constant is not declared.' },
])('presents $code summaries while retaining original compiler diagnostics', async ({ constant, code, detail, chinese, english }) => {
  const invalidLesson = `version: 2
id: locale-split
default_locale: en-US
constants:
  lookup: ${constant}
inputs: {}
graphs:
  source:
    nodes:
      - {id: value, operation: core.source@1, parameters: {type: {family: bits, size: 4}, value: {constant: missing}}}
    outputs: [{node: value, port: value}]
steps: [{id: intro, prose: intro}]
`
  const documents = { lesson: invalidLesson, locales: { 'en-US': content } }
  const compiled = compileLesson(documents)
  expect(compiled.ok).toBe(false)
  if (compiled.ok) throw new Error('Expected invalid Lesson')
  expect(compiled.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code, message: detail, path: expect.any(String), details: expect.any(Object), span: expect.objectContaining({ file: 'lesson.yaml' }) })]))
  const original = structuredClone(compiled.diagnostics)
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink((operation) => of({ data: operation.operationName === 'LearningCatalog'
      ? { learning: { lessonCategories: [] } }
      : { lessonDocuments: { lesson: invalidLesson, locale: content } },
    })),
  })
  await i18n.changeLanguage('zh-CN')
  render(<ApolloProvider client={client}><MemoryRouter initialEntries={['/learning/locale-split']}><OverlaysProvider>
    <LearningPage />
  </OverlaysProvider></MemoryRouter></ApolloProvider>)
  for (const [language, summary] of [['zh-CN', chinese], ['en-US', english], ['fr-FR', english], ['zh-CN', chinese]]) {
    await act(async () => { await i18n.changeLanguage(language) })
    for (const row of await screen.findAllByText((text) => text.startsWith(`${code}:`))) expect(row).toHaveTextContent(summary)
    const browser = createBrowserLessonSession(documents, language, i18n.getFixedT(language, 'translations'))
    expect(browser.ok).toBe(false)
    if (browser.ok) throw new Error('Expected invalid Lesson')
    expect(browser.diagnostics).toEqual(original)
  }
  expect(compiled.diagnostics).toEqual(original)
})
