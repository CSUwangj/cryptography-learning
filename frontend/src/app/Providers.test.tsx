import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { overlaysProviderSpy } = vi.hoisted(() => ({
  overlaysProviderSpy: vi.fn(
    ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  ),
}))

vi.mock('@blueprintjs/core', async () => {
  const actual = await vi.importActual<typeof import('@blueprintjs/core')>('@blueprintjs/core')
  return {
    ...actual,
    OverlaysProvider: overlaysProviderSpy,
  }
})

vi.mock('transport', () => ({
  ApolloClientProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}))

vi.mock('./i18n', () => ({
  default: {
    language: 'en',
    languages: ['en'],
    changeLanguage: vi.fn(),
    t: (key: string) => key,
    on: vi.fn(),
    off: vi.fn(),
    loadNamespaces: vi.fn(),
    options: {},
    services: { resourceStore: { data: {} } },
  },
}))

import { Providers } from './Providers'

describe('Providers', () => {
  it('wraps children with Blueprint OverlaysProvider', () => {
    overlaysProviderSpy.mockClear()
    render(
      <Providers>
        <div data-testid="child">ready</div>
      </Providers>,
    )
    expect(overlaysProviderSpy).toHaveBeenCalled()
    expect(screen.getByTestId('child')).toHaveTextContent('ready')
  })
})
