import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import i18n from '../src/app/i18n'
import { executeWorkerRequest, type Diagnostic } from '../src/crypto_graph'
import { AesCipherDemo } from './AesCipherDemo'
import { SpnDemo } from './SpnDemo'
import { AesAvalancheDemo } from './AesAvalancheDemo'
import { KeyExpansionPrototype } from './KeyExpansionPrototype'
import { createBrowserLessonSession } from '../src/lesson_runtime'
import { teachingSpnDemoDocuments } from './teachingSpnLesson'
import { visualizerCatalog } from '../src/visualizers'

vi.mock('../src/visualizers', async () => {
  const actual = await vi.importActual<typeof import('../src/visualizers')>('../src/visualizers')
  return { ...actual, RenderHost: () => <div data-testid="render-host" /> }
})

let workerFailure: Diagnostic | undefined
let workerRequests = 0
class WorkerStub {
  private listeners: Array<(event: MessageEvent<unknown>) => void> = []
  addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
    if (type === 'message') this.listeners.push(listener)
  }
  postMessage(request: Parameters<typeof executeWorkerRequest>[0]): void {
    workerRequests += 1
    const failure = workerFailure
    workerFailure = undefined
    const data = failure
      ? { requestId: request.requestId, kind: 'diagnostic', diagnostics: [failure] }
      : executeWorkerRequest(request)
    queueMicrotask(() => this.listeners.forEach((listener) => listener({ data } as MessageEvent<unknown>)))
  }
  terminate(): void {}
}

const previousWorker = globalThis.Worker
afterEach(async () => {
  cleanup()
  globalThis.Worker = previousWorker
  workerFailure = undefined
  workerRequests = 0
  await i18n.changeLanguage('en-US')
})

it('retains a real engine limit diagnostic and its details independently of UI language', async () => {
  globalThis.Worker = WorkerStub as unknown as typeof Worker
  const documents = { ...teachingSpnDemoDocuments, lesson: teachingSpnDemoDocuments.lesson.replace('steps:', 'limits: {inputBytes: 1}\nsteps:') }
  const created = createBrowserLessonSession(documents, 'zh-CN', i18n.getFixedT('zh-CN', 'translations'), visualizerCatalog)
  if (!created.ok) throw new Error(JSON.stringify(created.diagnostics))
  try {
    const result = await created.value.next()
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
    const original = structuredClone(result.value.executionDiagnostics.visualize)
    expect(original).toMatchObject({ code: 'execution.input-limit', message: 'Execution input exceeds the input limit.', path: 'inputs', details: { limit: 1, actual: expect.any(Number) } })
    for (const language of ['en-US', 'fr-FR', 'zh-CN']) {
      expect(created.value.updateDocuments(documents, language, i18n.getFixedT(language, 'translations'), visualizerCatalog).ok).toBe(true)
      expect(created.value.state().executionDiagnostics.visualize).toEqual(original)
    }
  } finally {
    created.value.dispose()
  }
})

it.each([
  { name: 'AES', Demo: AesCipherDemo },
  { name: 'SPN', Demo: SpnDemo },
])('retains $name execution failures in current UI language without altering unknown runtime messages', async ({ Demo }) => {
  globalThis.Worker = WorkerStub as unknown as typeof Worker
  await i18n.changeLanguage('zh-CN')
  const original: Diagnostic = { code: 'operation-failed', message: 'Engine execution failed.', path: 'runtime.original.path', details: { engine: 'original' } }
  workerFailure = original
  const view = render(<Demo />)
  expect(await screen.findByRole('alert')).toHaveTextContent('操作执行失败。')
  const completedRequests = workerRequests
  for (const [language, expected] of [['en-US', 'Operation execution failed.'], ['fr-FR', 'Operation execution failed.'], ['zh-CN', '操作执行失败。']]) {
    await act(async () => { await i18n.changeLanguage(language) })
    expect(screen.getByRole('alert')).toHaveTextContent(expected)
    expect(workerRequests).toBe(completedRequests)
  }
  view.unmount()
  const unknown: Diagnostic = { code: 'runtime.custom-failure', message: '运行时 {{unchanged}} <external>&', path: 'runtime.original.path', details: { engine: 'original' } }
  workerFailure = unknown
  render(<Demo />)
  expect(await screen.findByRole('alert')).toHaveTextContent(unknown.message)
  const unknownRequests = workerRequests
  for (const language of ['en-US', 'fr-FR', 'zh-CN']) {
    await act(async () => { await i18n.changeLanguage(language) })
    expect(screen.getByRole('alert')).toHaveTextContent(unknown.message)
    expect(workerRequests).toBe(unknownRequests)
  }
  expect(unknown).toEqual({ code: 'runtime.custom-failure', message: '运行时 {{unchanged}} <external>&', path: 'runtime.original.path', details: { engine: 'original' } })
})

it.each([
  { name: 'AES', Demo: AesCipherDemo },
  { name: 'SPN', Demo: SpnDemo },
  { name: 'AES avalanche', Demo: AesAvalancheDemo },
  { name: 'key expansion', Demo: KeyExpansionPrototype },
])('keeps unknown $name codes and raw nesting/interpolation text verbatim across languages', async ({ Demo }) => {
  globalThis.Worker = WorkerStub as unknown as typeof Worker
  for (const code of ['lesson-invalid-input', 'inputType', 'lesson', 'constructor', '__proto__', 'toString']) {
    const unknown: Diagnostic = {
      code, message: 'External $t(learning.policy.preserve) {{unchanged}} <message>&', path: 'external.path',
      span: { file: 'external.yaml', line: 7, column: 11 }, details: { request: 17, retained: true },
    }
    const original = structuredClone(unknown)
    workerFailure = unknown
    const view = render(<Demo />)
    expect((await screen.findByRole('alert')).textContent).toBe(unknown.message)
    const completedRequests = workerRequests
    for (const language of ['en-US', 'zh-CN', 'fr-FR']) {
      await act(async () => { await i18n.changeLanguage(language) })
      expect(screen.getByRole('alert').textContent).toBe(unknown.message)
      expect(workerRequests).toBe(completedRequests)
    }
    expect(unknown).toEqual(original)
    view.unmount()
  }
})

it.each([
  { name: 'AES', Demo: AesCipherDemo, label: '密钥（定宽十六进制）', chinese: '密钥（定宽十六进制）: 输入不符合声明的类型和编码。', english: 'Key (hex-block): Input does not match its declared type and encoding.' },
  { name: 'SPN', Demo: SpnDemo, label: '明文', chinese: '输入不符合声明的类型和编码。', english: 'Input does not match its declared type and encoding.' },
])('re-presents retained $name input failure through shared language changes', async ({ Demo, label, chinese, english }) => {
  globalThis.Worker = WorkerStub as unknown as typeof Worker
  await i18n.changeLanguage('zh-CN')
  const user = userEvent.setup()
  render(<Demo />)
  await screen.findByTestId('render-host')
  const input = screen.getByLabelText(label)
  await user.clear(input)
  await user.type(input, 'zz')
  fireEvent.submit(input.closest('form')!)
  expect(await screen.findByRole('alert')).toHaveTextContent(chinese)
  for (const [language, expected] of [['en-US', english], ['fr-FR', english], ['zh-CN', chinese]]) {
    await act(async () => { await i18n.changeLanguage(language) })
    expect(screen.getByRole('alert')).toHaveTextContent(expected)
    expect(input).toHaveValue('zz')
  }
})

it.each([
  { name: 'AES avalanche', Demo: AesAvalancheDemo },
  { name: 'key expansion', Demo: KeyExpansionPrototype },
])('renders $name engine summaries and retains unknown external failures across language changes', async ({ Demo }) => {
  globalThis.Worker = WorkerStub as unknown as typeof Worker
  await i18n.changeLanguage('zh-CN')
  const original: Diagnostic = { code: 'execution.node-limit', message: 'Expanded graph exceeds the node limit.', path: 'graph.nodes', details: { limit: 1, actual: 2 } }
  workerFailure = original
  const view = render(<Demo />)
  expect(await screen.findByRole('alert')).toHaveTextContent('展开的图超出节点数量限制。')
  for (const [language, summary] of [['en-US', 'The expanded graph exceeds the node limit.'], ['fr-FR', 'The expanded graph exceeds the node limit.'], ['zh-CN', '展开的图超出节点数量限制。']]) {
    await act(async () => { await i18n.changeLanguage(language) })
    expect(screen.getByRole('alert')).toHaveTextContent(summary)
  }
  expect(original).toEqual({ code: 'execution.node-limit', message: 'Expanded graph exceeds the node limit.', path: 'graph.nodes', details: { limit: 1, actual: 2 } })
  view.unmount()
  const unknown: Diagnostic = { code: 'external.failure', message: 'External {{raw}} <message>&', path: 'external.path', details: { request: 17 } }
  workerFailure = unknown
  render(<Demo />)
  expect(await screen.findByRole('alert')).toHaveTextContent(unknown.message)
  const unknownRequests = workerRequests
  for (const language of ['en-US', 'fr-FR', 'zh-CN']) {
    await act(async () => { await i18n.changeLanguage(language) })
    expect(screen.getByRole('alert')).toHaveTextContent(unknown.message)
    expect(workerRequests).toBe(unknownRequests)
  }
})
