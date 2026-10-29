import React from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import i18n from '../src/app/i18n'
import { executeWorkerRequest } from '../src/crypto_graph'
import { KeyExpansionPrototype } from './KeyExpansionPrototype'

const requests: string[] = []
class WorkerStub {
  private listeners: Array<(event: MessageEvent<unknown>) => void> = []
  addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
    if (type === 'message') this.listeners.push(listener)
  }
  postMessage(request: Parameters<typeof executeWorkerRequest>[0]): void {
    requests.push(request.requestId)
    const data = executeWorkerRequest(request)
    queueMicrotask(() => this.listeners.forEach((listener) => listener({ data } as MessageEvent<unknown>)))
  }
  terminate(): void {}
}

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  requests.length = 0
  await i18n.changeLanguage('en-US')
})

it('remeasures an open key lane after language changes while retaining execution and edited controls', async () => {
  vi.stubGlobal('Worker', WorkerStub)
  await i18n.changeLanguage('en-US')
  render(<KeyExpansionPrototype />)
  const trace = await screen.findByRole('region', { name: 'Teaching SPN execution' })
  expect(requests).toEqual(['visualize-1'])
  const input = screen.getByLabelText('Plaintext')
  fireEvent.change(input, { target: { value: '0xabcd' } })

  // Supply browser geometry; JSDOM cannot establish translated text reflow or pixel alignment.
  let shift = 0
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this === trace.parentElement) return new DOMRect(10, 20, 1000, 600)
    if (this.tagName === 'TABLE') return new DOMRect(100, 90 + shift, 900, 400 + shift)
    if (this.matches('thead tr')) return new DOMRect(100, 100 + shift, 900, 20 + shift)
    if (this.matches('tbody tr')) {
      const index = [...this.parentElement!.children].indexOf(this)
      return new DOMRect(100, 120 + 2 * shift + index * 30, 900, 30)
    }
    if (this.matches('tbody tr:first-child > :nth-child(4)')) return new DOMRect(300, 120, 600, 30)
    return new DOMRect()
  })

  fireEvent.click(screen.getAllByRole('button', { name: /^Round keys:/ })[0])
  const overlay = screen.getByRole('region', { name: 'Key expansion' })
  expect(overlay).toHaveStyle({ top: '80px', height: '390px' })
  expect(within(overlay).getByRole('button', { name: 'Master key bit 0: 0' })).toHaveStyle({ top: '25px' })
  for (const [language, offset, name, bit, top, height, bitTop] of [
    ['zh-CN', 30, '密钥扩展', '主密钥 位 0: 0', '110px', '420px', '55px'],
    ['fr-FR', 10, 'Key expansion', 'Master key bit 0: 0', '90px', '400px', '35px'],
    ['en-US', 0, 'Key expansion', 'Master key bit 0: 0', '80px', '390px', '25px'],
  ] as const) {
    shift = offset
    await act(async () => { await i18n.changeLanguage(language) })
    expect(screen.getByRole('region', { name })).toBe(overlay)
    expect(overlay).toHaveStyle({ top, height })
    expect(within(overlay).getByRole('button', { name: bit })).toHaveStyle({ top: bitTop })
    expect(input).toHaveValue('0xabcd')
    expect(requests).toEqual(['visualize-1'])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  }
})
