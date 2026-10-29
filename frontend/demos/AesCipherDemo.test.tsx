import { I18nextProvider } from 'react-i18next'
import i18n from '../src/app/i18n'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { executeWorkerRequest } from '../src/crypto_graph'

vi.mock('../src/visualizers', async () => {
  const actual = await vi.importActual<typeof import('../src/visualizers')>('../src/visualizers')
  return {
    ...actual,
    RenderHost: (props: { execution?: { outputs: Record<string, unknown> }; executionIdentity: string; presentation?: { direction?: string } }) => (
      <div data-testid="render-host" data-render-host={`${props.executionIdentity}:${props.presentation?.direction ?? ''}:${Object.keys(props.execution?.outputs ?? {}).join(',')}`}>
        {Object.keys(props.execution?.outputs ?? {}).join(',')}
      </div>
    ),
  }
})

import { AesCipherDemo } from './AesCipherDemo'

class WorkerStub {
  private listeners: Array<(event: MessageEvent<unknown>) => void> = []
  addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
    if (type === 'message') this.listeners.push(listener)
  }
  postMessage(request: Parameters<typeof executeWorkerRequest>[0]): void {
    queueMicrotask(() => this.listeners.forEach((listener) => listener({ data: executeWorkerRequest(request) } as MessageEvent<unknown>)))
  }
  terminate(): void {}
}

describe('AesCipherDemo form', () => {
  const previousWorker = globalThis.Worker
  afterEach(() => { globalThis.Worker = previousWorker })

  it('switches variants and direction, reports localized invalid input, and retains the prior result', async () => {
    globalThis.Worker = WorkerStub as unknown as typeof Worker
    const user = userEvent.setup()
    render(<I18nextProvider i18n={i18n.cloneInstance({ lng: "en-US" })}><AesCipherDemo  /></I18nextProvider>)
    await waitFor(() => expect(screen.getByTestId('render-host')).toBeVisible())
    expect(screen.getByText('cipher-10-add-round-key.value')).toBeVisible()

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0], '256')
    expect(screen.getByDisplayValue('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f')).toBeVisible()
    await user.selectOptions(selects[0], '128')
    expect(screen.getByDisplayValue('000102030405060708090a0b0c0d0e0f')).toBeVisible()
    await user.selectOptions(selects[0], '256')
    await user.selectOptions(selects[1], 'decrypt')
    await user.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(screen.getByText('cipher-0-add-round-key.value')).toBeVisible())
    const successfulMarker = screen.getByTestId('render-host').getAttribute('data-render-host')
    expect(successfulMarker).toMatch(/:decrypt:.*cipher-0-add-round-key\.value/)

    const key = screen.getByDisplayValue('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f')
    await user.clear(key)
    await user.type(key, 'zz')
    await user.click(screen.getByRole('button', { name: 'Run' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Key (hex-block):')
    expect(screen.getByText('cipher-0-add-round-key.value')).toBeVisible()
    expect(screen.getByTestId('render-host')).toHaveAttribute('data-render-host', successfulMarker)
  })

  it('localizes diagnostics and keeps the successful render marker', async () => {
    globalThis.Worker = WorkerStub as unknown as typeof Worker
    const user = userEvent.setup()
    render(<I18nextProvider i18n={i18n.cloneInstance({ lng: "zh-CN" })}><AesCipherDemo  /></I18nextProvider>)
    await waitFor(() => expect(screen.getByText('cipher-10-add-round-key.value')).toBeVisible())
    const key = screen.getAllByRole('textbox')[0]
    await user.clear(key)
    await user.type(key, 'zz')
    await user.click(screen.getByRole('button', { name: '运行' }))
    expect(screen.getByRole('alert')).toHaveTextContent('密钥（定宽十六进制）:')
    expect(screen.getByText('cipher-10-add-round-key.value')).toBeVisible()
  })
})
