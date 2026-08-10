import { useQuery } from '@apollo/client/react'
import { CompletionBoardDocument } from '../transport/generated/graphql'
import type { CompletionBoardQuery } from '../transport/generated/graphql'

type CompletionBoardQueryResult = {
  data: CompletionBoardQuery | undefined
  error: Error | undefined
  loading: boolean
  refetch: () => Promise<unknown>
}

/** Load Completion Board transport data for the Completion Records page. */
export const useCompletionBoardQuery = (
  courseRunId: string | undefined,
): CompletionBoardQueryResult => {
  const variables =
    courseRunId === undefined || courseRunId === ''
      ? {}
      : { courseRunId }

  const result = useQuery(CompletionBoardDocument, {
    variables,
    fetchPolicy: 'cache-and-network',
    notifyOnNetworkStatusChange: true,
  })

  return {
    data: result.data,
    error: result.error as Error | undefined,
    loading: result.loading,
    refetch: result.refetch,
  }
}
