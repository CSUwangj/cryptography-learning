import { describe, expect, it } from 'vitest'
import { mapCompletionBoard } from './map'
import type { CompletionBoardQuery } from '../transport/generated/graphql'

const completion = (labId: string, completedAt = '2026-10-12T08:15:30Z') => ({
  labId,
  completedAt,
})

describe('Completion Board mapper (#53)', () => {
  it('transposes students and Completion Records into timestamped cell states', () => {
    const data: CompletionBoardQuery = {
      completionBoard: {
        courseRunId: 'spring-2026',
        students: [
          { studentId: 'alice', completions: [completion('caesar')] },
          {
            studentId: 'bob',
            completions: [
              completion('affine', '2026-10-11T08:15:30Z'),
              completion('caesar'),
            ],
          },
        ],
      },
    }

    expect(mapCompletionBoard(data)).toEqual({
      ok: true,
      matrix: {
        courseRunId: 'spring-2026',
        labIds: ['affine', 'caesar'],
        rows: [
          {
            studentId: 'alice',
            cells: [
              { state: 'notRecorded' },
              { state: 'recorded', completedAt: '2026-10-12T08:15:30Z' },
            ],
          },
          {
            studentId: 'bob',
            cells: [
              { state: 'recorded', completedAt: '2026-10-11T08:15:30Z' },
              { state: 'recorded', completedAt: '2026-10-12T08:15:30Z' },
            ],
          },
        ],
      },
    })
  })

  it('uses lexicographically sorted observed Lab IDs and preserves student order', () => {
    const data: CompletionBoardQuery = {
      completionBoard: {
        courseRunId: 'run-1',
        students: [
          {
            studentId: 'zoe',
            completions: [completion('zeta'), completion('alpha')],
          },
          { studentId: 'amy', completions: [completion('mu')] },
        ],
      },
    }

    const result = mapCompletionBoard(data)

    expect(result.ok && result.matrix.labIds).toEqual(['alpha', 'mu', 'zeta'])
    expect(result.ok && result.matrix.rows.map((row) => row.studentId)).toEqual([
      'zoe',
      'amy',
    ])
  })

  it('maps an empty board to empty rows and columns', () => {
    expect(
      mapCompletionBoard({
        completionBoard: { courseRunId: 'empty-run', students: [] },
      }),
    ).toEqual({
      ok: true,
      matrix: { courseRunId: 'empty-run', labIds: [], rows: [] },
    })
  })

  it.each([
    ['empty Course Run ID', { courseRunId: '', students: [] }],
    [
      'empty Student ID',
      { courseRunId: 'run-1', students: [{ studentId: '', completions: [] }] },
    ],
    [
      'empty Lab ID',
      {
        courseRunId: 'run-1',
        students: [{ studentId: 'alice', completions: [completion('')] }],
      },
    ],
    [
      'malformed Completion Time',
      {
        courseRunId: 'run-1',
        students: [
          {
            studentId: 'alice',
            completions: [completion('caesar', '2026-10-12T08:15:30+00:00')],
          },
        ],
      },
    ],
    [
      'Completion Time outside supported year range',
      {
        courseRunId: 'run-1',
        students: [
          {
            studentId: 'alice',
            completions: [completion('caesar', '0000-01-01T00:00:00Z')],
          },
        ],
      },
    ],
  ])('rejects %s', (_reason, completionBoard) => {
    expect(
      mapCompletionBoard({ completionBoard } as CompletionBoardQuery),
    ).toEqual({ ok: false })
  })

  it('rejects duplicate Student/Lab pairs without returning a partial matrix', () => {
    expect(
      mapCompletionBoard({
        completionBoard: {
          courseRunId: 'run-1',
          students: [
            { studentId: 'alice', completions: [completion('caesar')] },
            { studentId: 'alice', completions: [completion('affine')] },
          ],
        },
      }),
    ).toEqual({ ok: false })
    expect(
      mapCompletionBoard({
        completionBoard: {
          courseRunId: 'run-1',
          students: [
            {
              studentId: 'alice',
              completions: [completion('caesar'), completion('caesar')],
            },
          ],
        },
      }),
    ).toEqual({ ok: false })
  })

  it('maps only Course Run, Student, Lab, and Completion Time data', () => {
    const data = {
      completionBoard: {
        courseRunId: 'run-1',
        students: [
          {
            studentId: 'alice',
            completions: [completion('caesar')],
            name: 'Alice',
            grade: 'A',
          },
        ],
        ranking: [{ studentId: 'alice', score: 99 }],
        signedEvidence: 'token',
      },
    } as unknown as CompletionBoardQuery

    const result = mapCompletionBoard(data)

    expect(result.ok && Object.keys(result.matrix).sort()).toEqual([
      'courseRunId',
      'labIds',
      'rows',
    ])
    expect(result.ok && result.matrix.rows[0]).toEqual({
      studentId: 'alice',
      cells: [{ state: 'recorded', completedAt: '2026-10-12T08:15:30Z' }],
    })
  })
})
