import { describe, expect, it } from 'vitest'
import { mapCompletionBoard } from './map'
import type { CompletionBoardQuery } from '../transport/generated/graphql'

describe('Completion Board mapper (#48)', () => {
  it('transposes students and completed Lab IDs into a matrix of cell states', () => {
    const data: CompletionBoardQuery = {
      completionBoard: {
        courseRunId: 'spring-2026',
        students: [
          { studentId: 'alice', completedLabIds: ['caesar'] },
          { studentId: 'bob', completedLabIds: ['affine', 'caesar'] },
        ],
      },
    }

    expect(mapCompletionBoard(data)).toEqual({
      ok: true,
      matrix: {
        courseRunId: 'spring-2026',
        labIds: ['affine', 'caesar'],
        rows: [
          { studentId: 'alice', cells: ['notRecorded', 'recorded'] },
          { studentId: 'bob', cells: ['recorded', 'recorded'] },
        ],
      },
    })
  })

  it('uses lexicographically sorted observed Lab IDs as columns', () => {
    const data: CompletionBoardQuery = {
      completionBoard: {
        courseRunId: 'run-1',
        students: [
          { studentId: 's1', completedLabIds: ['zeta', 'alpha'] },
          { studentId: 's2', completedLabIds: ['mu'] },
        ],
      },
    }

    expect(mapCompletionBoard(data)).toEqual({
      ok: true,
      matrix: {
        courseRunId: 'run-1',
        labIds: ['alpha', 'mu', 'zeta'],
        rows: [
          { studentId: 's1', cells: ['recorded', 'notRecorded', 'recorded'] },
          { studentId: 's2', cells: ['notRecorded', 'recorded', 'notRecorded'] },
        ],
      },
    })
  })

  it('preserves backend student row order', () => {
    const data: CompletionBoardQuery = {
      completionBoard: {
        courseRunId: 'run-2',
        students: [
          { studentId: 'zoe', completedLabIds: ['lab-a'] },
          { studentId: 'amy', completedLabIds: ['lab-a'] },
        ],
      },
    }

    expect(mapCompletionBoard(data)).toEqual({
      ok: true,
      matrix: {
        courseRunId: 'run-2',
        labIds: ['lab-a'],
        rows: [
          { studentId: 'zoe', cells: ['recorded'] },
          { studentId: 'amy', cells: ['recorded'] },
        ],
      },
    })
  })

  it('maps an empty board to empty rows and columns', () => {
    const data: CompletionBoardQuery = {
      completionBoard: {
        courseRunId: 'empty-run',
        students: [],
      },
    }

    expect(mapCompletionBoard(data)).toEqual({
      ok: true,
      matrix: {
        courseRunId: 'empty-run',
        labIds: [],
        rows: [],
      },
    })
  })

  it('rejects an empty Course Run ID', () => {
    const data: CompletionBoardQuery = {
      completionBoard: {
        courseRunId: '',
        students: [{ studentId: 'alice', completedLabIds: ['caesar'] }],
      },
    }

    expect(mapCompletionBoard(data)).toEqual({ ok: false })
  })

  it('rejects an empty Student ID', () => {
    const data: CompletionBoardQuery = {
      completionBoard: {
        courseRunId: 'run-1',
        students: [{ studentId: '', completedLabIds: ['caesar'] }],
      },
    }

    expect(mapCompletionBoard(data)).toEqual({ ok: false })
  })

  it('rejects an empty Lab ID', () => {
    const data: CompletionBoardQuery = {
      completionBoard: {
        courseRunId: 'run-1',
        students: [{ studentId: 'alice', completedLabIds: [''] }],
      },
    }

    expect(mapCompletionBoard(data)).toEqual({ ok: false })
  })

  it('rejects duplicate Student ID rows', () => {
    const data: CompletionBoardQuery = {
      completionBoard: {
        courseRunId: 'run-1',
        students: [
          { studentId: 'alice', completedLabIds: ['caesar'] },
          { studentId: 'alice', completedLabIds: ['affine'] },
        ],
      },
    }

    expect(mapCompletionBoard(data)).toEqual({ ok: false })
  })

  it('rejects duplicate Lab IDs within one student row', () => {
    const data: CompletionBoardQuery = {
      completionBoard: {
        courseRunId: 'run-1',
        students: [
          { studentId: 'alice', completedLabIds: ['caesar', 'caesar'] },
        ],
      },
    }

    expect(mapCompletionBoard(data)).toEqual({ ok: false })
  })

  it('maps only Course Run, Student, Lab, and cell-state data', () => {
    const data = {
      completionBoard: {
        courseRunId: 'run-1',
        students: [
          {
            studentId: 'alice',
            completedLabIds: ['caesar'],
            name: 'Alice',
            grade: 'A',
          },
        ],
        ranking: [{ studentId: 'alice', score: 99 }],
        signedEvidence: 'token',
      },
    } as unknown as CompletionBoardQuery

    const result = mapCompletionBoard(data)

    expect(result).toEqual({
      ok: true,
      matrix: {
        courseRunId: 'run-1',
        labIds: ['caesar'],
        rows: [{ studentId: 'alice', cells: ['recorded'] }],
      },
    })
    expect(result.ok && Object.keys(result.matrix).sort()).toEqual([
      'courseRunId',
      'labIds',
      'rows',
    ])
    expect(result.ok && Object.keys(result.matrix.rows[0]).sort()).toEqual([
      'cells',
      'studentId',
    ])
  })
})
