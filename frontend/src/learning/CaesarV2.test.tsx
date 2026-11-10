import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { OverlaysProvider } from '@blueprintjs/core'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { of } from 'rxjs'
import { parse, stringify } from 'yaml'
import { i18n } from '../app'
import { executeWorkerRequest, type WorkerRequest } from '../crypto_graph'
import { caesarV2Documents } from '../../demos/caesarLesson'
import { LearningPage } from './index'

class LocalWorker extends EventTarget {
  static requests: WorkerRequest[] = []
  postMessage(request: WorkerRequest): void {
    LocalWorker.requests.push(request)
    queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: executeWorkerRequest(request) })))
  }
  terminate(): void {}
}

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  await i18n.changeLanguage('en-US')
})

it('previews a v2 Caesar key by keyboard and commits through the real Lesson input and execution owner', async () => {
  vi.stubGlobal('Worker', LocalWorker)
  LocalWorker.requests = []
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink((operation) => of({ data: operation.operationName === 'LearningCatalog'
      ? { learning: { lessonCategories: [] } }
      : { lessonDocuments: { lesson: caesarV2Documents.lesson, locale: caesarV2Documents.locales['en-US'] } },
    })),
  })
  render(<ApolloProvider client={client}><MemoryRouter initialEntries={['/learning/caesar-v2']}><OverlaysProvider>
    <LearningPage />
  </OverlaysProvider></MemoryRouter></ApolloProvider>)
  await screen.findByLabelText('Signed shift')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByText('βγ😀 ? (alphabet-text<custom>)')
  const control = screen.getByRole('slider', { name: 'Caesar shift' })
  control.focus()
  const requests = LocalWorker.requests.length
  fireEvent.keyDown(control, { key: 'ArrowDown' })
  expect(screen.getByText('Preview shift: 0')).toBeVisible()
  expect(screen.getByText('βγ😀 ? (alphabet-text<custom>)')).toBeVisible()
  expect(LocalWorker.requests).toHaveLength(requests)
  fireEvent.keyUp(control, { key: 'ArrowDown' })
  await screen.findByText('αβδ ? (alphabet-text<custom>)')
  await waitFor(() => expect(screen.getByRole('slider', { name: 'Caesar shift' })).toHaveFocus())
  const nextControl = screen.getByRole('slider', { name: 'Caesar shift' })
  fireEvent.keyDown(nextControl, { key: 'ArrowDown' })
  fireEvent.keyUp(nextControl, { key: 'ArrowDown' })
  await screen.findByText('😀αγ ? (alphabet-text<custom>)')
  expect(LocalWorker.requests.some((request) => request.kind === 'execute' && request.payload.inputs
    && 'value' in request.payload.inputs['rotation.value'] && request.payload.inputs['rotation.value'].value === -1)).toBe(true)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Previous' })) })
  expect(screen.getByLabelText('Signed shift')).toHaveValue('-1')
})

it('keeps Previous navigation after a pending Caesar commit and still reports a current Worker error', async () => {
  let complete: (() => void) | undefined
  let fail: (() => void) | undefined
  class HeldWorker extends LocalWorker {
    postMessage(request: WorkerRequest): void {
      const shift = request.kind === 'execute' && request.payload.inputs?.['rotation.value']
      if (shift && 'value' in shift && shift.value === 0) {
        complete = () => super.postMessage(request)
        fail = () => this.dispatchEvent(new Event('error'))
      } else super.postMessage(request)
    }
  }
  vi.stubGlobal('Worker', HeldWorker)
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink((operation) => of({ data: operation.operationName === 'LearningCatalog'
      ? { learning: { lessonCategories: [] } }
      : { lessonDocuments: { lesson: caesarV2Documents.lesson, locale: caesarV2Documents.locales['en-US'] } },
    })),
  })
  render(<ApolloProvider client={client}><MemoryRouter initialEntries={['/learning/caesar-v2']}><OverlaysProvider>
    <LearningPage />
  </OverlaysProvider></MemoryRouter></ApolloProvider>)
  await screen.findByLabelText('Signed shift')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByText('βγ😀 ? (alphabet-text<custom>)')
  const control = screen.getByRole('slider', { name: 'Caesar shift' })
  fireEvent.keyDown(control, { key: 'ArrowDown' })
  fireEvent.keyUp(control, { key: 'ArrowDown' })
  await waitFor(() => expect(complete).toBeDefined())
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Previous' })) })
  expect(screen.getByLabelText('Signed shift')).toHaveValue('0')
  await act(async () => { complete!() })
  expect(screen.getByLabelText('Signed shift')).toHaveValue('0')
  expect(screen.queryByText(/lesson.execution-cancelled/)).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await act(async () => { fail!() })
  expect(await screen.findByText(/execution.worker-error/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Previous' })).toBeVisible()
})

it.each([false, true])('keeps the v2 Caesar presentation for a fixed prior-Step key, aliased %s', async (aliased) => {
  vi.stubGlobal('Worker', LocalWorker)
  const lesson = parse(caesarV2Documents.lesson)
  lesson.graphs.key = aliased ? {
    nodes: [{ id: 'repeated', repeat: { subgraph: 'fixed', count: 1 }, inputs: {} }],
    outputs: [{ node: 'repeated', port: 'value' }],
    subgraphs: { fixed: {
      inputs: [], outputs: [{ name: 'value', type: { family: 'integer', signed: true, safe: true } }],
      nodes: [{ id: 'value', operation: 'core.source@1', parameters: { type: { family: 'integer', signed: true, safe: true }, value: 1 } }],
    } },
  } : {
    nodes: [{ id: 'source', operation: 'core.source@1', parameters: { type: { family: 'integer', signed: true, safe: true } } }],
    outputs: [{ node: 'source', port: 'value' }],
  }
  lesson.steps.splice(1, 0, { id: 'key', execute: { graph: 'key', bindings: aliased ? {} : { 'source.value': { input: 'rotation' } } } })
  lesson.steps[2].execute.bindings['rotation.value'] = { step: 'key', output: aliased ? 'repeated.value' : 'source.value' }
  const document = stringify(lesson)
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink((operation) => of({ data: operation.operationName === 'LearningCatalog'
      ? { learning: { lessonCategories: [] } }
      : { lessonDocuments: { lesson: document, locale: caesarV2Documents.locales['en-US'] } },
    })),
  })
  render(<ApolloProvider client={client}><MemoryRouter initialEntries={['/learning/caesar-v2']}><OverlaysProvider>
    <LearningPage />
  </OverlaysProvider></MemoryRouter></ApolloProvider>)
  await screen.findByLabelText('Signed shift')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByText('1 (integer)')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByText('βγ😀 ? (alphabet-text<custom>)')
  expect(screen.getByText('α → β')).toBeVisible()
  expect(screen.getByText('Committed shift: 1')).toBeVisible()
  expect(screen.queryByRole('slider', { name: 'Caesar shift' })).not.toBeInTheDocument()
})
