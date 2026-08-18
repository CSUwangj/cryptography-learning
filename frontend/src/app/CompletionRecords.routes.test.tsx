import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryHistory, type MemoryHistory } from 'history'
import { Router } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { OverlaysProvider } from '@blueprintjs/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApolloClientProvider } from 'transport'
import i18n from './i18n'
import { Routes } from './routes'

const boardResponse = {
  data: {
    completionBoard: {
      courseRunId: 'spring-2026',
      students: [
        {
          studentId: 'alice',
          completions: [{ labId: 'caesar', completedAt: '2026-10-12T08:15:30Z' }],
        },
        {
          studentId: 'bob',
          completions: [
            { labId: 'affine', completedAt: '2026-10-11T08:15:30Z' },
            { labId: 'caesar', completedAt: '2026-10-12T08:15:30Z' },
          ],
        },
      ],
    },
  },
}

const emptyBoardResponse = {
  data: {
    completionBoard: {
      courseRunId: 'empty-run',
      students: [],
    },
  },
}

const historicalBoardResponse = {
  data: {
    completionBoard: {
      ...boardResponse.data.completionBoard,
      courseRunId: 'fall-2025',
    },
  },
}

const historicalEmptyBoardResponse = {
  data: {
    completionBoard: {
      courseRunId: 'fall-2025',
      students: [],
    },
  },
}

const renderAt = (path: string, history?: MemoryHistory) => {
  const routerHistory =
    history ?? createMemoryHistory({ initialEntries: [path] })
  const view = render(
    <I18nextProvider i18n={i18n}>
      <Router history={routerHistory}>
        <OverlaysProvider>
          <ApolloClientProvider>
            <Routes />
          </ApolloClientProvider>
        </OverlaysProvider>
      </Router>
    </I18nextProvider>,
  )
  return { ...view, history: routerHistory }
}

describe('Completion Records routes (#48)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the Completion Records matrix for the configured Course Run at /completion', async () => {
    await i18n.changeLanguage('en-US')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(boardResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderAt('/completion')

    expect(
      await screen.findByRole('heading', { name: 'Completion Records' }),
    ).toBeInTheDocument()

    const table = await screen.findByRole('table')
    expect(await screen.findByRole('button', { name: 'Export CSV' })).toBeEnabled()
    expect(within(table).getByRole('rowheader', { name: 'alice' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'affine' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'caesar' })).toBeInTheDocument()
    expect(within(table).getAllByLabelText('Recorded').length).toBeGreaterThan(0)
    expect(within(table).getAllByText('Not recorded').length).toBeGreaterThan(0)
    const recordedMarker = within(table).getAllByLabelText('Recorded')[0]
    recordedMarker.focus()
    const expectedTime = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(new Date('2026-10-12T08:15:30Z'))
    expect(
      await screen.findByText(`Completion Time: ${expectedTime}`),
    ).toBeInTheDocument()
    expect(table).not.toHaveTextContent('2026-10-12T08:15:30Z')
    expect(
      screen.getByText(/These records are unofficial/),
    ).toBeInTheDocument()
    const totals = screen.getByRole('group', { name: 'Completion Record totals' })
    expect(within(totals).getByRole('group', { name: 'Students: 2' })).toBeInTheDocument()
    expect(within(totals).getByRole('group', { name: 'Observed Labs: 2' })).toBeInTheDocument()
    expect(
      within(totals).getByRole('group', { name: 'Completion Records: 3' }),
    ).toBeInTheDocument()
    expect(within(totals).getAllByRole('group')).toHaveLength(3)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as {
      variables?: Record<string, unknown>
    }
    expect(body.variables?.courseRunId ?? null).toBeNull()
  })

  it('passes a known historical Course Run ID from /completion/:courseRunId', async () => {
    await i18n.changeLanguage('en-US')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            completionBoard: {
              courseRunId: 'fall-2025',
              students: [
                {
                  studentId: 'carol',
                  completions: [
                    { labId: 'rsa', completedAt: '2026-10-12T08:15:30Z' },
                  ],
                },
              ],
            },
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderAt('/completion/fall-2025')

    expect(
      await screen.findByRole('heading', { name: 'Completion Records' }),
    ).toBeInTheDocument()
    expect(await screen.findByText(/fall-2025/)).toBeInTheDocument()
    expect(await screen.findByRole('rowheader', { name: 'carol' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Export CSV' })).toBeEnabled()

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as {
      variables?: Record<string, unknown>
    }
    expect(body.variables?.courseRunId).toBe('fall-2025')
  })

  it.each([
    {
      name: 'initial loading',
      fetch: () => new Promise<Response>(() => undefined),
      waitFor: () => screen.findByRole('status', { name: 'Loading Completion Records' }),
    },
    {
      name: 'initial failure',
      fetch: () => Promise.reject(new TypeError('Failed to fetch')),
      waitFor: () => screen.findByText('Unable to load Completion Records.'),
    },
    {
      name: 'malformed data',
      fetch: () => Promise.resolve(new Response(JSON.stringify({
        data: { completionBoard: { courseRunId: '', students: [] } },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
      waitFor: () => screen.findByText('Unable to load Completion Records.'),
    },
    {
      name: 'empty data',
      fetch: () => Promise.resolve(new Response(JSON.stringify(emptyBoardResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })),
      waitFor: () => screen.findByText('No Completion Records for empty-run'),
    },
  ])('disables Export CSV on historical route for $name', async ({ fetch, waitFor: waitForState }) => {
    await i18n.changeLanguage('en-US')
    vi.stubGlobal('fetch', vi.fn(fetch))

    renderAt('/completion/fall-2025')

    await waitForState()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  })

  it('shows an always-visible Completion Records nav item that opens /completion', async () => {
    await i18n.changeLanguage('en-US')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(boardResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    const { history } = renderAt('/')
    const nav = await screen.findByRole('button', { name: 'Completion Records' })
    nav.click()

    expect(
      await screen.findByRole('heading', { name: 'Completion Records' }),
    ).toBeInTheDocument()
    expect(history.location.pathname).toBe('/completion')
  })

  it('renders Completion Records copy in zh-CN', async () => {
    await i18n.changeLanguage('zh-CN')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(boardResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    renderAt('/completion')

    expect(
      await screen.findByRole('heading', { name: '完成记录' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: '完成记录' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/这些记录为非正式记录/),
    ).toBeInTheDocument()
    const recordedMarker = (await screen.findAllByLabelText('已记录'))[0]
    recordedMarker.focus()
    expect(await screen.findByText(/^完成时间：/)).toBeInTheDocument()
    const totals = screen.getByRole('group', { name: '完成记录总计' })
    expect(within(totals).getByRole('group', { name: '学生：2' })).toBeInTheDocument()
    expect(within(totals).getByRole('group', { name: '已观察实验：2' })).toBeInTheDocument()
    expect(within(totals).getByRole('group', { name: '完成记录：3' })).toBeInTheDocument()
  })

  it('shows a localized empty state when the board has no students', async () => {
    await i18n.changeLanguage('en-US')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(emptyBoardResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    renderAt('/completion')

    expect(
      await screen.findByText('No Completion Records for empty-run'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Course Run/)).toBeInTheDocument()
    expect(
      screen.getByText(/These records are unofficial/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  })

  it('shows an accessible busy state while loading without cached data', async () => {
    await i18n.changeLanguage('en-US')
    let resolveFetch: ((value: Response) => void) | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve
          }),
      ),
    )

    renderAt('/completion')

    expect(
      await screen.findByRole('status', { name: 'Loading Completion Records' }),
    ).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('heading', { name: 'Completion Records' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()

    resolveFetch?.(
      new Response(JSON.stringify(boardResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    expect(
      await screen.findByRole('heading', { name: 'Completion Records' }),
    ).toBeInTheDocument()
  })

  it('renders the shared Not Found page for unknown client routes', async () => {
    await i18n.changeLanguage('en-US')
    renderAt('/no-such-page')

    expect(
      await screen.findByRole('heading', { name: 'Not Found' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('The page you requested could not be found.'),
    ).toBeInTheDocument()
  })

  it('maps COMPLETION_NOT_CONFIGURED to the shared Not Found page', async () => {
    await i18n.changeLanguage('en-US')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            errors: [
              {
                message: 'Completion is not configured',
                extensions: { code: 'COMPLETION_NOT_CONFIGURED' },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    )

    renderAt('/completion')

    expect(
      await screen.findByRole('heading', { name: 'Not Found' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Completion is not configured/)).not.toBeInTheDocument()
  })

  it('maps INVALID_COURSE_RUN_ID to the shared Not Found page', async () => {
    await i18n.changeLanguage('en-US')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            errors: [
              {
                message: 'bad id detail',
                extensions: { code: 'INVALID_COURSE_RUN_ID' },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    )

    renderAt('/completion/not-a-valid-id')

    expect(
      await screen.findByRole('heading', { name: 'Not Found' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/bad id detail/)).not.toBeInTheDocument()
  })

  it('shows a generic Completion Records error with Retry for COMPLETION_UNAVAILABLE', async () => {
    await i18n.changeLanguage('en-US')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            errors: [
              {
                message: 'sqlite locked details',
                extensions: { code: 'COMPLETION_UNAVAILABLE' },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    )

    renderAt('/completion')

    expect(
      await screen.findByText('Unable to load Completion Records.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Completion Records' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Retry' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/sqlite locked details/)).not.toBeInTheDocument()
  })

  it('shows a generic error for an initial network failure', async () => {
    await i18n.changeLanguage('en-US')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    renderAt('/completion')

    expect(
      await screen.findByText('Unable to load Completion Records.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument()
  })

  it('shows a generic error for an unknown GraphQL error code', async () => {
    await i18n.changeLanguage('en-US')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            errors: [
              {
                message: 'mystery boom',
                extensions: { code: 'SOMETHING_NEW' },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    )

    renderAt('/completion')

    expect(
      await screen.findByText('Unable to load Completion Records.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/mystery boom/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  })

  it('shows a generic error for malformed Completion Board data', async () => {
    await i18n.changeLanguage('en-US')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              completionBoard: {
                courseRunId: '',
                students: [
                  {
                    studentId: 'alice',
                    completions: [
                      { labId: 'caesar', completedAt: 'not-a-time' },
                    ],
                  },
                ],
              },
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    )

    renderAt('/completion')

    expect(
      await screen.findByText('Unable to load Completion Records.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  })

  it('keeps the matrix visible and announces refresh when cached data is revalidated', async () => {
    await i18n.changeLanguage('en-US')
    const history = createMemoryHistory({ initialEntries: ['/completion'] })
    let resolveRefresh: ((value: Response) => void) | undefined
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(boardResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveRefresh = resolve
          }),
      )
    vi.stubGlobal('fetch', fetchMock)

    renderAt('/completion', history)

    expect(await screen.findByRole('rowheader', { name: 'alice' })).toBeInTheDocument()

    history.push('/')
    await screen.findByRole('button', { name: 'Completion Records' })
    history.push('/completion')

    expect(await screen.findByRole('rowheader', { name: 'alice' })).toBeInTheDocument()
    expect(
      await screen.findByRole('status', { name: 'Refreshing Completion Records' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()

    resolveRefresh?.(
      new Response(JSON.stringify(boardResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await waitFor(() => {
      expect(
        screen.queryByRole('status', { name: 'Refreshing Completion Records' }),
      ).not.toBeInTheDocument()
    })
  })

  it('keeps an empty board visible and announces refresh when cached data is revalidated', async () => {
    await i18n.changeLanguage('en-US')
    const history = createMemoryHistory({ initialEntries: ['/completion'] })
    let resolveRefresh: ((value: Response) => void) | undefined
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(emptyBoardResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveRefresh = resolve
          }),
      )
    vi.stubGlobal('fetch', fetchMock)

    renderAt('/completion', history)

    expect(
      await screen.findByText('No Completion Records for empty-run'),
    ).toBeInTheDocument()

    history.push('/')
    await screen.findByRole('button', { name: 'Completion Records' })
    history.push('/completion')

    expect(
      await screen.findByText('No Completion Records for empty-run'),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('status', { name: 'Refreshing Completion Records' }),
    ).toBeInTheDocument()

    resolveRefresh?.(
      new Response(JSON.stringify(emptyBoardResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await waitFor(() => {
      expect(
        screen.queryByRole('status', { name: 'Refreshing Completion Records' }),
      ).not.toBeInTheDocument()
    })
  })

  it('keeps the matrix and shows a stale warning when refresh fails', async () => {
    await i18n.changeLanguage('en-US')
    const history = createMemoryHistory({ initialEntries: ['/completion'] })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(boardResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    renderAt('/completion', history)

    expect(await screen.findByRole('rowheader', { name: 'alice' })).toBeInTheDocument()

    history.push('/')
    await screen.findByRole('button', { name: 'Completion Records' })
    history.push('/completion')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Records may be out of date',
    )
    expect(screen.getByRole('rowheader', { name: 'alice' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  })

  it('disables Export CSV during and after a failed historical refresh', async () => {
    await i18n.changeLanguage('en-US')
    const history = createMemoryHistory({ initialEntries: ['/completion/fall-2025'] })
    let rejectRefresh: ((reason?: unknown) => void) | undefined
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(historicalBoardResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockImplementationOnce(
        () => new Promise<Response>((_resolve, reject) => {
          rejectRefresh = reject
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    renderAt('/completion/fall-2025', history)
    expect(await screen.findByRole('rowheader', { name: 'alice' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled()

    history.push('/')
    await screen.findByRole('button', { name: 'Completion Records' })
    history.push('/completion/fall-2025')

    expect(
      await screen.findByRole('status', { name: 'Refreshing Completion Records' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()

    rejectRefresh?.(new TypeError('Failed to fetch'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Records may be out of date',
    )
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  })

  it('keeps an empty board and shows a stale warning when refresh fails', async () => {
    await i18n.changeLanguage('en-US')
    const history = createMemoryHistory({ initialEntries: ['/completion'] })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(emptyBoardResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    renderAt('/completion', history)

    expect(
      await screen.findByText('No Completion Records for empty-run'),
    ).toBeInTheDocument()

    history.push('/')
    await screen.findByRole('button', { name: 'Completion Records' })
    history.push('/completion')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Records may be out of date',
    )
    expect(
      screen.getByText('No Completion Records for empty-run'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  })

  it('keeps a historical empty board and disables Export CSV after refresh failure', async () => {
    await i18n.changeLanguage('en-US')
    const history = createMemoryHistory({ initialEntries: ['/completion/fall-2025'] })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(historicalEmptyBoardResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    renderAt('/completion/fall-2025', history)
    expect(await screen.findByText('No Completion Records for fall-2025')).toBeInTheDocument()

    history.push('/')
    await screen.findByRole('button', { name: 'Completion Records' })
    history.push('/completion/fall-2025')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Records may be out of date',
    )
    expect(screen.getByText('No Completion Records for fall-2025')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  })

  it('recovers through Retry after an initial failure', async () => {
    await i18n.changeLanguage('en-US')
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(boardResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    renderAt('/completion')

    expect(
      await screen.findByText('Unable to load Completion Records.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()

    screen.getByRole('button', { name: 'Retry' }).click()

    expect(await screen.findByRole('rowheader', { name: 'alice' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled()
    expect(
      screen.queryByText('Unable to load Completion Records.'),
    ).not.toBeInTheDocument()
  })
})
