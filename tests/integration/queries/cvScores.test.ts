import { describe, expect, it } from 'vitest'
import * as cvScoresQ from '@/lib/db/queries/cvScores'
import { makeApplication, makeJob, makeUser } from '@/tests/factories'

function row(overall: number, applicationId: string | null = null) {
  return {
    documentId: null,
    applicationId,
    sourceKind: 'upload',
    sourceLabel: 'cv.pdf',
    overall,
    grade: 'B',
    mode: applicationId ? 'jd' : 'general',
    scores: { total: { score: overall } },
    dimensions: {},
    findings: [],
    scorerVersion: '1.0.0',
  }
}

describe('cvScores queries', () => {
  it('history is oldest-first, filtered and user-scoped', async () => {
    const u = await makeUser()
    const other = await makeUser()
    const job = await makeJob(u.id, null)
    const app = await makeApplication(u.id, job.id)
    const a = await cvScoresQ.create(u.id, row(60, app.id))
    const b = await cvScoresQ.create(u.id, row(70, app.id))
    await cvScoresQ.create(u.id, row(80))
    const hist = await cvScoresQ.history(u.id, { applicationId: app.id })
    expect(hist.map((r) => r.id)).toEqual([a.id, b.id])
    expect((await cvScoresQ.latestForApplication(u.id, app.id))!.id).toBe(b.id)
    expect(await cvScoresQ.history(other.id, { applicationId: app.id })).toEqual([])
    expect(await cvScoresQ.getById(other.id, a.id)).toBeNull()
    expect(await cvScoresQ.listByApplication(u.id, app.id, 1)).toHaveLength(1)
  })
})
