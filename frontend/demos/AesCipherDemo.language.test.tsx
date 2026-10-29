import React from 'react'
import { I18nextProvider } from 'react-i18next'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import i18n from '../src/app/i18n'
import { executeWorkerRequest } from '../src/crypto_graph'
import { AesCipherDemo } from './AesCipherDemo'

// Keep the demo/session/Worker/renderer boundary real with a small supported trace.
// Full AES rendering is covered by the browser acceptance checks.
vi.mock('./aes128CipherLesson', () => ({
  aesCipherDemoDocuments: () => ({
    lesson: `version: 1
id: aes-language-test
default_locale: en-US
inputs:
  key: {type: {family: bits, size: 128}, encoding: hex-block, default: "000102030405060708090a0b0c0d0e0f"}
  plaintext: {type: {family: bits, size: 128}, encoding: hex-block, default: "00112233445566778899aabbccddeeff"}
  ciphertext: {type: {family: bits, size: 128}, encoding: hex-block, default: "69c4e0d86a7b0430d8cdb78070b4c55a"}
constants: {}
graphs:
  trace:
    nodes:
      - id: source
        operation: core.source@1
        parameters: {type: {family: bits, size: 128}}
    outputs: [{node: source, port: value}]
    traceLevel: detail
steps:
  - id: enter-input
    prose: intro
  - id: expand-key
    execute: {graph: trace, bindings: {source.value: {input: key}}}
  - id: encrypt
    execute: {graph: trace, bindings: {source.value: {input: plaintext}}}
  - id: decrypt
    execute: {graph: trace, bindings: {source.value: {input: ciphertext}}}
`,
    locales: {
      'en-US': 'title: Authored English\nsummary: Authored summary\ntexts: {intro: Authored input prompt}',
      'zh-CN': 'title: Authored Chinese\nsummary: Authored summary\ntexts: {intro: Authored input prompt}',
    },
  }),
}))

let failRequests = false
const requests: string[] = []
class WorkerStub {
  private listeners: Array<(event: MessageEvent<unknown>) => void> = []
  addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
    if (type === 'message') this.listeners.push(listener)
  }
  postMessage(request: Parameters<typeof executeWorkerRequest>[0]): void {
    requests.push(request.requestId)
    const data = failRequests
      ? { requestId: request.requestId, kind: 'diagnostic', diagnostics: [{ code: 'execution.timeout', message: 'Worker execution timed out.', path: 'request', details: {} }] }
      : executeWorkerRequest(request)
    queueMicrotask(() => this.listeners.forEach((listener) => listener({ data } as MessageEvent<unknown>)))
  }
  terminate(): void {}
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  failRequests = false
  requests.length = 0
})

it('relabels retained execution without Worker requests, preserves controls, and still runs on submit', async () => {
  vi.stubGlobal('Worker', WorkerStub)
  const language = i18n.cloneInstance({ lng: 'en-US' })
  render(<I18nextProvider i18n={language}><AesCipherDemo /></I18nextProvider>)
  expect(await screen.findByRole('row', { name: 'Output — 0x00112233445566778899aabbccddeeff' })).toBeVisible()
  const completedRequests = [...requests]
  expect(completedRequests).toEqual(['expand-key-1', 'encrypt-2'])
  const key = screen.getByLabelText('Key (hex-block)')
  const ciphertext = screen.getByLabelText('Ciphertext (hex-block)')
  const variant = screen.getByLabelText('Variant')
  fireEvent.change(key, { target: { value: '0f0e0d0c0b0a09080706050403020100' } })
  fireEvent.change(ciphertext, { target: { value: 'aabbccddeeff00112233445566778899' } })
  fireEvent.change(screen.getByLabelText('Plaintext (hex-block)'), { target: { value: '112233445566778899aabbccddeeff00' } })
  fireEvent.change(screen.getByLabelText('Direction'), { target: { value: 'decrypt' } })
  failRequests = true
  for (const [locale, source, plaintextLabel, directionLabel, decryptLabel] of [
    ['zh-CN', '输出', '明文（定宽十六进制）', '方向', '解密'],
    ['fr-FR', 'Output', 'Plaintext (hex-block)', 'Direction', 'Decryption'],
    ['zh-CN', '输出', '明文（定宽十六进制）', '方向', '解密'],
  ]) {
    await act(async () => { await language.changeLanguage(locale) })
    expect(requests).toEqual(completedRequests)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('row', { name: `${source} — 0x00112233445566778899aabbccddeeff` })).toBeVisible()
    expect(screen.getByLabelText(plaintextLabel)).toHaveValue('112233445566778899aabbccddeeff00')
    expect(key).toHaveValue('0f0e0d0c0b0a09080706050403020100')
    expect(ciphertext).toHaveValue('aabbccddeeff00112233445566778899')
    expect(variant).toHaveValue('128')
    expect(screen.getByLabelText(directionLabel)).toHaveValue('decrypt')
    expect(screen.getByRole('option', { name: decryptLabel })).toBeVisible()
  }
  failRequests = false
  fireEvent.click(screen.getByRole('button', { name: '运行' }))
  await waitFor(() => expect(requests).toEqual([...completedRequests, 'expand-key-1', 'encrypt-2', 'decrypt-3']))
  expect(await screen.findByRole('row', { name: '输出 — 0xaabbccddeeff00112233445566778899' })).toBeVisible()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
