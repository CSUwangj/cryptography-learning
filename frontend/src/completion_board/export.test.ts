import { afterEach, describe, expect, it, vi } from 'vitest'
import { completionRecordsCsv, downloadCompletionRecordsCsv } from './export'

const matrix = {
  courseRunId: 'spring-2026',
  labIds: ['alpha'],
  rows: [{
    studentId: 'student-one',
    cells: [{ state: 'recorded' as const, completedAt: '2026-10-12T08:15:30Z' }],
  }],
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('completionRecordsCsv', () => {
  it('writes exact legacy-compatible UTF-8 CSV records', () => {
    expect(completionRecordsCsv({
      courseRunId: matrix.courseRunId,
      labIds: ['zeta', 'alpha'],
      rows: [
        {
          studentId: 'student,one',
          cells: [
            { state: 'notRecorded' },
            { state: 'recorded', completedAt: '2026-10-12T08:15:30Z' },
          ],
        },
        {
          studentId: 'student-two',
          cells: [
            { state: 'recorded', completedAt: '2026-10-11T23:05:06Z' },
            { state: 'notRecorded' },
          ],
        },
      ],
    })).toBe(
      '\uFEFFname,alpha,zeta\r\n"student,one",2026-10-12 08:15:30,\r\nstudent-two,,2026-10-11 23:05:06\r\n',
    )
  })

  it('escapes quotes and line breaks in every field', () => {
    expect(completionRecordsCsv({
      courseRunId: 'run',
      labIds: ['lab"one', 'lab\ntwo'],
      rows: [{
        studentId: 'student"\n',
        cells: [
          { state: 'notRecorded' },
          { state: 'notRecorded' },
        ],
      }],
    })).toBe('\uFEFFname,\"lab\ntwo\",\"lab\"\"one\"\r\n\"student\"\"\n\",,\r\n')
  })

  it('creates named browser download from serialized Blob', async () => {
    let downloadedBlob: Blob | undefined
    let downloadedFilename: string | undefined
    vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
      downloadedBlob = value as Blob
      return 'blob:test'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloadedFilename = this.download
    })

    downloadCompletionRecordsCsv(matrix)

    expect(click).toHaveBeenCalledOnce()
    expect(downloadedFilename).toBe('completion-records-spring-2026.csv')
    expect(downloadedBlob).toBeDefined()
    expect(downloadedBlob).toEqual(expect.any(Blob))
    expect(document.querySelector('a')).toBeNull()
  })
})
