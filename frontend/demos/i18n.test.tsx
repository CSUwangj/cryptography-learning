import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import i18n from '../src/app/i18n'
import { AvalancheDemo } from './AvalancheDemo'

afterEach(async () => {
  cleanup()
  await i18n.changeLanguage('en-US')
})

it('updates a mounted demo and its presentation through the shared language without changing user input', async () => {
  await i18n.changeLanguage('en-US')
  render(<AvalancheDemo />)
  const input = screen.getByLabelText('Baseline plaintext')
  fireEvent.change(input, { target: { value: '0xabcd' } })
  await act(async () => { await i18n.changeLanguage('zh-CN') })
  expect(screen.getByRole('heading', { name: '雪崩比较原型' })).toBeVisible()
  expect(screen.getByRole('heading', { name: '连续雪崩比较' })).toBeVisible()
  expect(screen.getByLabelText('基准明文')).toHaveValue('0xabcd')
  await act(async () => { await i18n.changeLanguage('fr-FR') })
  expect(screen.getByRole('heading', { name: 'Avalanche comparison prototype' })).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Continuous avalanche comparison' })).toBeVisible()
  expect(screen.getByLabelText('Baseline plaintext')).toHaveValue('0xabcd')
})
