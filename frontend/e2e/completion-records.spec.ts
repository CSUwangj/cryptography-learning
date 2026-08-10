import { expect, test } from '@playwright/test'

const relayUrl = process.env.COMPLETION_RELAY_URL
const courseRun = process.env.COMPLETION_COURSE_RUN ?? '2026-acceptance'
const labId = process.env.COMPLETION_LAB ?? 'affine'
const studentId = process.env.COMPLETION_STUDENT ?? '20260001'

const disclaimer =
  'These records are unofficial. Student IDs are self-asserted and unauthenticated.'

const forbiddenFieldPatterns = [
  /\bgrade\b/i,
  /\branking\b/i,
  /\btotal\b/i,
  /\bpercentage\b/i,
  /completedAt/i,
  /receivedAt/i,
  /signedEvidence/i,
  /public_key/i,
  /\bkid\b/i,
]

test.describe('Completion Records relay-to-board (#49)', () => {
  test.skip(
    !relayUrl,
    'COMPLETION_RELAY_URL is required; run via acceptance/completion/run.sh'
  )
  test.use({ locale: 'en-US' })

  test('two identical relay submissions yield one matrix record', async ({
    page,
    request,
  }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await request.post(`${relayUrl}/api/completions`, {
        data: { lab: labId, student: studentId },
        headers: { 'Content-Type': 'application/json' },
      })
      expect(response.status(), `relay attempt ${attempt + 1}`).toBe(200)
      expect(await response.json()).toEqual({ status: 'recorded' })
    }

    await page.goto('/completion')

    await expect(
      page.getByRole('heading', { name: 'Completion Records', level: 1 })
    ).toBeVisible()
    await expect(page.getByText(`Course Run: ${courseRun}`)).toBeVisible()
    await expect(page.getByText(disclaimer)).toBeVisible()

    const table = page.getByRole('table')
    await expect(table).toBeVisible()
    await expect(table.getByRole('columnheader', { name: labId })).toBeVisible()
    await expect(table.getByRole('rowheader', { name: studentId })).toBeVisible()
    await expect(table.getByRole('columnheader')).toHaveCount(2)
    await expect(table.getByRole('rowheader')).toHaveCount(1)
    await expect(table.getByText('✓')).toHaveCount(1)
    await expect(table.getByText('—')).toHaveCount(0)

    const bodyText = await page.locator('body').innerText()
    for (const pattern of forbiddenFieldPatterns) {
      expect(bodyText, `forbidden field pattern ${pattern}`).not.toMatch(pattern)
    }

    expect(pageErrors).toEqual([])
  })
})
