import type { CompletionRecordsMatrix } from './domain'

const escapeCsvField = (value: string): string => {
  if (!/[",\r\n]/.test(value)) {
    return value
  }
  return `"${value.replace(/"/g, '""')}"`
}

const formatUtcCompletionTime = (value: string): string =>
  new Date(value).toISOString().slice(0, 19).replace('T', ' ')

/** Serialize one Academic Register matrix using summary.py's legacy CSV contract. */
export const completionRecordsCsv = (matrix: CompletionRecordsMatrix): string => {
  const columns = matrix.labIds
    .map((labId, index) => ({ labId, index }))
    .sort((left, right) =>
      left.labId < right.labId ? -1 : left.labId > right.labId ? 1 : 0,
    )
  const header = ['name', ...columns.map(({ labId }) => labId)].map(escapeCsvField).join(',')
  const rows = matrix.rows.map((row) => [
    row.studentId,
    ...columns.map(({ index }) => {
      const cell = row.cells[index]
      return cell?.state === 'recorded' ? formatUtcCompletionTime(cell.completedAt) : ''
    }),
  ].map(escapeCsvField).join(','))

  return `\uFEFF${[header, ...rows].join('\r\n')}\r\n`
}

export const downloadCompletionRecordsCsv = (matrix: CompletionRecordsMatrix): void => {
  if (typeof URL.createObjectURL !== 'function') {
    return
  }
  const blob = new Blob([completionRecordsCsv(matrix)], {
    type: 'text/csv;charset=utf-8',
  })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = `completion-records-${matrix.courseRunId}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  if (typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(objectUrl)
  }
}
