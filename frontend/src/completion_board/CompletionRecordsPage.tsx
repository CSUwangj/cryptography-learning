import React from 'react'
import { CombinedGraphQLErrors } from '@apollo/client'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { NotFound } from 'ui'
import { useCompletionBoardQuery } from './data'
import { mapCompletionBoard } from './map'
import type { CompletionRecordsMatrix } from './domain'
import type { CompletionRouteParams } from './routes'

const NOT_FOUND_CODES = new Set([
  'COMPLETION_NOT_CONFIGURED',
  'INVALID_COURSE_RUN_ID',
])

const visuallyHidden: React.CSSProperties = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: 1,
  margin: -1,
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  width: 1,
  whiteSpace: 'nowrap',
}

const graphqlErrorCode = (error: unknown): string | undefined => {
  if (!CombinedGraphQLErrors.is(error)) {
    return undefined
  }
  for (const graphQLError of error.errors) {
    const code = graphQLError.extensions?.code
    if (typeof code === 'string') {
      return code
    }
  }
  return undefined
}

const isNotFoundError = (error: unknown): boolean => {
  const code = graphqlErrorCode(error)
  return code !== undefined && NOT_FOUND_CODES.has(code)
}

const MatrixTable: React.FC<{ matrix: CompletionRecordsMatrix }> = ({
  matrix,
}) => {
  const { t } = useTranslation()
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th scope="col">{t('completion.student')}</th>
            {matrix.labIds.map((labId) => (
              <th key={labId} scope="col">
                {labId}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.studentId}>
              <th scope="row">{row.studentId}</th>
              {row.cells.map((cell, index) => {
                const labId = matrix.labIds[index]
                const recorded = cell === 'recorded'
                return (
                  <td key={labId}>
                    <span aria-hidden="true">{recorded ? '✓' : '—'}</span>
                    <span style={visuallyHidden}>
                      {recorded
                        ? t('completion.cellRecorded')
                        : t('completion.cellNotRecorded')}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const PageChrome: React.FC<{
  courseRunId: string
  children?: React.ReactNode
}> = ({ courseRunId, children }) => {
  const { t } = useTranslation()
  return (
    <section>
      <h1>{t('completion.title')}</h1>
      <p>
        {t('completion.courseRun')}: {courseRunId}
      </p>
      <p>{t('completion.disclaimer')}</p>
      {children}
    </section>
  )
}

const ErrorWithRetry: React.FC<{ onRetry: () => void }> = ({ onRetry }) => {
  const { t } = useTranslation()
  return (
    <div>
      <p>{t('completion.error')}</p>
      <button type="button" onClick={onRetry}>
        {t('completion.retry')}
      </button>
    </div>
  )
}

export const CompletionRecordsPage: React.FC = () => {
  const { t } = useTranslation()
  const { courseRunId } = useParams<CompletionRouteParams>()
  const { data, loading, error, refetch } = useCompletionBoardQuery(courseRunId)
  const onRetry = () => {
    void refetch()
  }

  if (error !== undefined && isNotFoundError(error)) {
    return <NotFound />
  }

  if (loading && !data) {
    return (
      <div role="status" aria-busy="true" aria-label={t('completion.loading')}>
        {t('completion.loading')}
      </div>
    )
  }

  if (error && !data) {
    return <ErrorWithRetry onRetry={onRetry} />
  }

  if (!data) {
    return null
  }

  const mapped = mapCompletionBoard(data)
  if (!mapped.ok) {
    return <ErrorWithRetry onRetry={onRetry} />
  }

  const { matrix } = mapped
  return (
    <PageChrome courseRunId={matrix.courseRunId}>
      {loading ? (
        <div
          role="status"
          aria-live="polite"
          aria-label={t('completion.refreshing')}
        >
          {t('completion.refreshing')}
        </div>
      ) : null}
      {error ? (
        <div role="alert">
          <p>{t('completion.stale')}</p>
          <button type="button" onClick={onRetry}>
            {t('completion.retry')}
          </button>
        </div>
      ) : null}
      {matrix.rows.length === 0 ? (
        <p>{t('completion.empty', { courseRunId: matrix.courseRunId })}</p>
      ) : (
        <MatrixTable matrix={matrix} />
      )}
    </PageChrome>
  )
}
