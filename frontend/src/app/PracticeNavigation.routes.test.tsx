import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryHistory } from 'history'
import { Router } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { OverlaysProvider } from '@blueprintjs/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApolloClientProvider } from 'transport'
import i18n from './i18n'
import { Routes } from './routes'

const catalogResponse = {
  data: {
    practice: {
      __typename: 'Practice',
      labCategories: [
        {
          __typename: 'LabCategory',
          id: 'classical',
          name: [{ __typename: 'Translation', lang: 'en-US', text: 'Classical' }],
          labs: [
            {
              __typename: 'Lab',
              id: 'affine',
              resources: [{ __typename: 'ResourceWithTranslation', lang: 'en-US', name: 'Affine Cipher' }],
              wsEndpoints: [],
              tcpEndpoints: [],
            },
          ],
        },
        {
          __typename: 'LabCategory',
          id: 'modern',
          name: [{ __typename: 'Translation', lang: 'en-US', text: 'Modern' }],
          labs: [],
        },
      ],
    },
  },
}

const labResponse = {
  data: {
    lab: {
      __typename: 'LabInstance',
      content: '# Affine Cipher',
      wsEndpoints: [],
      tcpEndpoints: [],
    },
  },
}

const renderAt = (path: string) => {
  const history = createMemoryHistory({ initialEntries: [path] })
  render(
    <I18nextProvider i18n={i18n}>
      <Router history={history}>
        <OverlaysProvider>
          <ApolloClientProvider>
            <Routes />
          </ApolloClientProvider>
        </OverlaysProvider>
      </Router>
    </I18nextProvider>,
  )
  return history
}

describe('Practice Navigation routes (#57)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens its two-column catalog and navigates to Labs or Completion Records', async () => {
    await i18n.changeLanguage('en-US')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { operationName?: string; query?: string }
        const response = body.operationName === 'Practices' ? catalogResponse : labResponse
        return Promise.resolve(
          new Response(JSON.stringify(response), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }),
    )
    const history = renderAt('/')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Practice' }))

    const navigation = await screen.findByRole('dialog', { name: 'Practice Navigation' })
    await user.click(within(navigation).getByRole('button', { name: 'Classical' }))
    await user.click(await within(navigation).findByRole('button', { name: 'Affine Cipher' }))

    expect(history.location.pathname).toBe('/practice/classical/affine')

    await user.click(await screen.findByRole('button', { name: 'Practice' }))
    const reopenedNavigation = await screen.findByRole('dialog', { name: 'Practice Navigation' })
    await user.click(
      within(reopenedNavigation).getByRole('button', { name: 'Completion Records' }),
    )

    expect(history.location.pathname).toBe('/completion')
  })

  it('keeps Completion Records actionable while its catalog loads', async () => {
    await i18n.changeLanguage('en-US')
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)))
    const history = renderAt('/learning')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Practice' }))

    const navigation = await screen.findByRole('dialog', { name: 'Practice Navigation' })
    expect(
      within(navigation).getByRole('status', { name: 'Loading Practice Navigation' }),
    ).toHaveAttribute('aria-busy', 'true')

    await user.click(
      within(navigation).getByRole('button', { name: 'Completion Records' }),
    )
    expect(history.location.pathname).toBe('/completion')
  })

  it('keeps Completion Records actionable when its catalog fails', async () => {
    await i18n.changeLanguage('en-US')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const history = renderAt('/feedback')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Practice' }))

    const navigation = await screen.findByRole('dialog', { name: 'Practice Navigation' })
    expect(within(navigation).getByRole('alert')).toHaveTextContent(
      'Unable to load Practice Navigation.',
    )

    await user.click(
      within(navigation).getByRole('button', { name: 'Completion Records' }),
    )
    expect(history.location.pathname).toBe('/completion')
  })
})
