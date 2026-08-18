import type { CompletionBoardQuery } from '../transport/generated/graphql'
import type {
  CompletionCell,
  MapCompletionBoardResult,
} from './domain'

const isCanonicalUtcRfc3339 = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) {
    return false
  }
  const year = Number(value.slice(0, 4))
  if (year < 1 || year > 9999) {
    return false
  }
  const parsed = new Date(value)
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString() === value.replace(/Z$/, '.000Z')
  )
}

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
      student.completions.some(
        (completion) =>
          completion.labId === '' || !isCanonicalUtcRfc3339(completion.completedAt),
      ),
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
    for (const completion of student.completions) {
      if (seenLabs.has(completion.labId)) {
        return { ok: false }
      }
      seenLabs.add(completion.labId)
    }
  }

  const labIds = Array.from(
    new Set(
      board.students.flatMap((student) =>
        student.completions.map((completion) => completion.labId),
      ),
    ),
  ).sort()

  const rows = board.students.map((student) => {
    const recordsByLabId = new Map(
      student.completions.map((completion) => [completion.labId, completion]),
    )
    const cells: CompletionCell[] = labIds.map((labId) =>
      recordsByLabId.has(labId)
        ? { state: 'recorded', completedAt: recordsByLabId.get(labId)!.completedAt }
        : { state: 'notRecorded' },
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
