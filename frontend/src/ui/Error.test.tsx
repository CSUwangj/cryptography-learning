import React from 'react'
import { I18nextProvider } from 'react-i18next'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import i18n from '../app/i18n'
import { ShowError } from './index'

afterEach(cleanup)

it('updates error actions with UI language while preserving external text and retry/dismiss behavior', async () => {
  const language = i18n.cloneInstance({ lng: 'en-US' })
  const onRefetch = vi.fn()
  const raw = 'External {{raw}} <message>& / error-stable-id'
  render(<I18nextProvider i18n={language}><ShowError error={raw} onRefetch={onRefetch} /></I18nextProvider>)
  for (const [locale, retry, cancel] of [
    ['en-US', 'Retry', 'Cancel'],
    ['zh-CN', '重试', '取消'],
    ['fr-FR', 'Retry', 'Cancel'],
    ['zh-CN', '重试', '取消'],
  ]) {
    await act(async () => { await language.changeLanguage(locale) })
    expect(screen.getByRole('button', { name: retry })).toBeVisible()
    expect(screen.getByRole('button', { name: cancel })).toBeVisible()
    expect(screen.getByTestId('show-error')).toHaveTextContent(raw)
  }
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  expect(onRefetch).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: '取消' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  expect(onRefetch).toHaveBeenCalledTimes(1)
})
