import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryHistory } from 'history'
import { Router } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { OverlaysProvider } from '@blueprintjs/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApolloClientProvider } from 'transport'
import { LearningNavigation } from 'learning'
import i18n from './i18n'

const catalogResponse = {
  data: {
    learning: {
      lessonCategories: [
        {
          id: 'fundamentals',
          name: [{ lang: 'en-US', text: 'Foundations' }, { lang: 'zh-CN', text: '基础知识' }],
          lessons: [{ id: 'xor', title: 'Exclusive OR' }],
        },
        {
          id: 'block-ciphers',
          name: [{ lang: 'en-US', text: 'Block ciphers' }, { lang: 'zh-CN', text: '分组密码' }],
          lessons: [{ id: 'aes-128', title: null }],
        },
      ],
    },
  },
}

const renderAt = (path: string) => {
  cleanup()
  document.body.replaceChildren()
  const history = createMemoryHistory({ initialEntries: [path] })
  render(
    <I18nextProvider i18n={i18n}>
      <Router history={history}>
        <OverlaysProvider>
          <ApolloClientProvider><LearningNavigation /></ApolloClientProvider>
        </OverlaysProvider>
      </Router>
    </I18nextProvider>,
  )
  return history
}

describe('Learning Navigation routes (#104)', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('selects a category, keeps unavailable lessons reachable, and closes before navigation', async () => {
    await i18n.changeLanguage('en-US')
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(catalogResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))))

    const history = renderAt('/learning')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Learning' }))

    const navigation = await screen.findByRole('dialog', { name: 'Learning Navigation' })
    await user.click(within(navigation).getByRole('button', { name: 'Block ciphers' }))
    expect(within(navigation).getByRole('button', { name: 'Title unavailable (aes-128)' })).toBeInTheDocument()

    await user.click(within(navigation).getByRole('button', { name: 'Title unavailable (aes-128)' }))
    expect(history.location.pathname).toBe('/learning/aes-128')
    expect(screen.queryByRole('dialog', { name: 'Learning Navigation' })).not.toBeInTheDocument()
  })
})
