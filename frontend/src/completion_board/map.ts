import type { CompletionBoardQuery } from '../transport/generated/graphql'
import type {
  CompletionCell,
  MapCompletionBoardResult,
} from './domain'

export const mapCompletionBoard = (
  data: CompletionBoardQuery,
): MapCompletionBoardResult => {
  const board = data.completionBoard
  if (board.courseRunId === '') {
    return { ok: false }
  }
  if (board.students.some((student) => student.studentId === '')) {
    return { ok: false }
  }
  if (
    board.students.some((student) =>
      student.completedLabIds.some((labId) => labId === ''),
    )
  ) {
    return { ok: false }
  }
  const seenStudents = new Set<string>()
  for (const student of board.students) {
    if (seenStudents.has(student.studentId)) {
      return { ok: false }
    }
    seenStudents.add(student.studentId)
    const seenLabs = new Set<string>()
    for (const labId of student.completedLabIds) {
      if (seenLabs.has(labId)) {
        return { ok: false }
      }
      seenLabs.add(labId)
    }
  }

  const labIds = Array.from(
    new Set(board.students.flatMap((student) => student.completedLabIds)),
  ).sort()

  const rows = board.students.map((student) => {
    const recorded = new Set(student.completedLabIds)
    const cells: CompletionCell[] = labIds.map((labId) =>
      recorded.has(labId) ? 'recorded' : 'notRecorded',
    )
    return { studentId: student.studentId, cells }
  })

  return {
    ok: true,
    matrix: {
      courseRunId: board.courseRunId,
      labIds,
      rows,
    },
  }
}
