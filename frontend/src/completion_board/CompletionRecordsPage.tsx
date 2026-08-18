import React from 'react'
import { CombinedGraphQLErrors } from '@apollo/client'
import { Tooltip } from '@blueprintjs/core'
import styled from '@emotion/styled'
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

const formatCompletionTime = (value: string, language: string): string =>
  new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value))

const Register = styled.section`
  box-sizing: border-box;
  color: #26302c;
  margin: 0 auto;
  max-width: 1100px;
  padding: 40px clamp(16px, 4vw, 48px) 56px;
  width: 100%;
`

const Metadata = styled.p`
  border-bottom: 1px solid #a8aca7;
  color: #59635d;
  font-size: 0.8125rem;
  margin: 0;
  overflow-wrap: anywhere;
  padding-bottom: 12px;
`

const Heading = styled.h1`
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 3.25rem;
  font-weight: 600;
  margin: 24px 0 8px;

  @media (max-width: 480px) {
    font-size: 2rem;
  }
`

const Notice = styled.p`
  color: #59635d;
  line-height: 1.5;
  margin: 0;
  max-width: 42rem;
`

const DoubleRule = styled.div`
  border-bottom: 3px double #59635d;
  margin: 26px 0 20px;
`

const Totals = styled.dl`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0 0 26px;

  div { border-left: 2px solid #77ad91; padding-left: 10px; }
  dt { color: #59635d; font-size: 0.8125rem; }
  dd { font-family: Georgia, 'Times New Roman', serif; font-size: 2rem; margin: 3px 0 0; }

  @media (max-width: 480px) {
    gap: 10px;
    grid-template-columns: 1fr;
  }
`

const MatrixScroller = styled.div`
  overflow-x: auto;
  width: 100%;
`

const Matrix = styled.table`
  border-collapse: collapse;
  min-width: max-content;
  table-layout: fixed;
  width: max-content;

  col:first-of-type { width: 168px; }
  col:not(:first-of-type) { width: 120px; }
  th, td { border: 1px solid #c9ccc6; box-sizing: border-box; overflow-wrap: anywhere; padding: 11px 14px; text-align: center; }
  thead th { background: #eae7df; font-weight: 600; }
  tbody th { background: #f8f7f3; font-weight: 500; text-align: left; }
  th:first-of-type { left: 0; position: sticky; z-index: 1; }
  thead th:first-of-type { z-index: 2; }
  td { background: #fff; }
  td:has([aria-label]) { background: #e2f1e8; color: #1b6243; font-weight: 700; }
`

const MatrixTable: React.FC<{ matrix: CompletionRecordsMatrix }> = ({
  matrix,
}) => {
  const { t, i18n } = useTranslation()
  return (
    <MatrixScroller role="region" aria-label={t('completion.matrix')} tabIndex={0}>
      <Matrix>
        <colgroup>
          <col />
          {matrix.labIds.map((labId) => <col key={labId} />)}
        </colgroup>
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
                const recorded = cell.state === 'recorded'
                return (
                  <td key={labId}>
                    {recorded ? (
                      <Tooltip
                        content={t('completion.completionTime', {
                          time: formatCompletionTime(cell.completedAt, i18n.language),
                        })}
                      >
                        <span tabIndex={0} aria-label={t('completion.cellRecorded')}>
                          ✓
                        </span>
                      </Tooltip>
                    ) : (
                      <>
                        <span aria-hidden="true">—</span>
                        <span style={visuallyHidden}>{t('completion.cellNotRecorded')}</span>
                      </>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </Matrix>
    </MatrixScroller>
  )
}

const PageChrome: React.FC<{
  courseRunId: string
  matrix?: CompletionRecordsMatrix
  children?: React.ReactNode
}> = ({ courseRunId, matrix, children }) => {
  const { t } = useTranslation()
  const completionCount = matrix?.rows.reduce(
    (count, row) => count + row.cells.filter((cell) => cell.state === 'recorded').length,
    0,
  )
  return (
    <Register>
      <Metadata>
        {t('completion.courseRun')}: {courseRunId}
      </Metadata>
      <Heading>{t('completion.title')}</Heading>
      <Notice>{t('completion.disclaimer')}</Notice>
      <DoubleRule />
      {matrix && completionCount !== undefined ? (
        <Totals role="group" aria-label={t('completion.totals')}>
          <div role="group" aria-label={t('completion.total', { label: t('completion.students'), count: matrix.rows.length })}>
            <dt>{t('completion.students')}</dt><dd>{matrix.rows.length}</dd>
          </div>
          <div role="group" aria-label={t('completion.total', { label: t('completion.observedLabs'), count: matrix.labIds.length })}>
            <dt>{t('completion.observedLabs')}</dt><dd>{matrix.labIds.length}</dd>
          </div>
          <div role="group" aria-label={t('completion.total', { label: t('completion.records'), count: completionCount })}>
            <dt>{t('completion.records')}</dt><dd>{completionCount}</dd>
          </div>
        </Totals>
      ) : null}
      {children}
    </Register>
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
  const displayCourseRunId = courseRunId ?? t('completion.currentCourseRun') ?? ''
  const onRetry = () => {
    void refetch()
  }

  if (error !== undefined && isNotFoundError(error)) {
    return <NotFound />
  }

  if (loading && !data) {
    return (
      <PageChrome courseRunId={displayCourseRunId}>
        <div role="status" aria-busy="true" aria-label={t('completion.loading')}>
          {t('completion.loading')}
        </div>
      </PageChrome>
    )
  }

  if (error && !data) {
    return <PageChrome courseRunId={displayCourseRunId}><ErrorWithRetry onRetry={onRetry} /></PageChrome>
  }

  if (!data) {
    return null
  }

  const mapped = mapCompletionBoard(data)
  if (!mapped.ok) {
    return <PageChrome courseRunId={displayCourseRunId}><ErrorWithRetry onRetry={onRetry} /></PageChrome>
  }

  const { matrix } = mapped
  return (
    <PageChrome courseRunId={matrix.courseRunId} matrix={matrix}>
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
