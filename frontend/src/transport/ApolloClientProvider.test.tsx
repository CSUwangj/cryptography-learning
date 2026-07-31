import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { useQuery } from '@apollo/client/react'
import { HelloDocument } from './generated/graphql'
import { ApolloClientProvider } from './ApolloClientProvider'

const HelloProbe: React.FC = () => {
  const { data, error, loading } = useQuery(HelloDocument)
  if (loading) {
    return <div data-testid="status">loading</div>
  }
  if (error) {
    return <div data-testid="status">error:{error.message}</div>
  }
  return <div data-testid="status">{data?.hello}</div>
}

describe('ApolloClientProvider (#16)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not open a WebSocket for GraphQL transport', async () => {
    const webSocketSpy = vi.fn()
    vi.stubGlobal('WebSocket', webSocketSpy)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { hello: 'hello cryptography' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    render(
      <ApolloClientProvider>
        <HelloProbe />
      </ApolloClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('hello cryptography')
    })
    expect(webSocketSpy).not.toHaveBeenCalled()
  })

  it('loads GraphQL operations over HTTP at /query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { hello: 'hello cryptography' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <ApolloClientProvider>
        <HelloProbe />
      </ApolloClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('hello cryptography')
    })

    expect(fetchMock).toHaveBeenCalled()
    const [uri, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(uri).toBe('/query')
    expect(init.method).toBe('POST')
  })
})
