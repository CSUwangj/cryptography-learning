import React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import i18n from '../src/app/i18n'
import { UiOptimizationPrototype } from './UiOptimizationPrototype'

const originalLocation = window.location.href

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', originalLocation)
  await i18n.changeLanguage('en-US')
})

it('updates public prototype catalog and Lab copy in place with English fallback and stable raw values', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  window.history.replaceState({}, '', '/practice/classical/affine?prototype=ui-optimization')
  await i18n.changeLanguage('en-US')
  render(<UiOptimizationPrototype />)
  for (const [language, category, title, prose, raw] of [
    ['en-US', 'Classical', 'Affine Cipher', 'Baseline Lab Description for characterization tests.', 'baseline-affine-en'],
    ['zh-CN', '古典密码学', '仿射加密', '用于布局预览的公开实验示例。', 'baseline-affine-zh'],
    ['fr-FR', 'Classical', 'Affine Cipher', 'Baseline Lab Description for characterization tests.', 'baseline-affine-en'],
  ]) {
    await act(async () => { await i18n.changeLanguage(language) })
    expect(await screen.findByRole('heading', { name: title })).toBeVisible()
    expect(screen.getByText(prose)).toBeVisible()
    expect(screen.getByText(raw, { selector: 'code' })).toBeVisible()
    expect(screen.getByRole('button', { name: `${i18n.t('nav.practice')} > ${category} > ${title}` })).toBeVisible()
    expect(screen.getByText('nc lab.example.invalid 19000')).toBeVisible()
    expect(window.location.pathname).toBe('/practice/classical/affine')
  }
})
