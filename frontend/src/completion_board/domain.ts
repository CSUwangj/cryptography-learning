/** Local Completion Records types — not generated GraphQL shapes. */

export type CompletionCell = 'recorded' | 'notRecorded'

export type CompletionRecordsMatrix = {
  courseRunId: string
  labIds: string[]
  rows: Array<{
    studentId: string
    cells: CompletionCell[]
  }>
}

export type MapCompletionBoardResult =
  | { ok: true; matrix: CompletionRecordsMatrix }
  | { ok: false }
