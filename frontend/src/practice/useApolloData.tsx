import React, { useCallback, useEffect } from 'react'
import type { ErrorLike } from '@apollo/client'
import { Loading, ShowError } from 'ui'

type QueryDataResult<TData> = {
  data: TData | undefined
  error?: ErrorLike
  loading: boolean
  refetch: () => Promise<unknown>
  stopPolling: () => void
}

// Add pollInterval to useQuery options when stop polling is need
export const useApolloData = <TData,>(
  res: QueryDataResult<TData>,
  render: (data: TData) => React.ReactElement,
  renderError?: (error: ErrorLike) => React.ReactElement,
  stopPollingWhen?: (data: TData) => boolean
): React.ReactElement => {
  const { data, error, loading, refetch, stopPolling } = res
  const onRefetch = useCallback(() => { void refetch() }, [refetch])
  useEffect(() => {
    if (stopPollingWhen && data && stopPollingWhen(data)) {
      stopPolling()
    }
  }, [data, stopPollingWhen, stopPolling])
  if (loading) {
    return React.createElement(Loading)
  }
  if (error) {
    if (renderError) {
      return renderError(error)
    } else {
      return React.createElement(
        ShowError,
        {
          error: error instanceof Error ? error : new Error(error.message),
          onRefetch
        }
      )
    }
  }
  if (!data) {
    throw new Error()
  }
  return render(data)
}
