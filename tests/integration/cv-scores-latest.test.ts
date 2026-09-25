import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import * as s from '@/lib/db/schema'
import * as documentsQ from '@/lib/db/queries/documents'
import * as cvScoresQ from '@/lib/db/queries/cvScores'
import { makeUser } from '@/tests/factories'

const BASE = new Date('2026-09-01T09:00:00Z').getTime()
const H = 60 * 60 * 1000

async function addScore(userId: string, documentId: string | null, overall: number, hour: number, mode = 'general') {
  await db.insert(s.cvScores).values({
    userId,
    documentId,
    sourceKind: 'master_cv',
    overall,
    grade: 'C',
    mode,
    scores: {},
    dimensions: {},
    findings: [],
    scorerVersion: 'test',
    createdAt: new Date(BASE + hour * H),
  })
}

async function makeCv(userId: string, title: string) {
  return documentsQ.create(userId, { kind: 'master_cv', title, content: {} })
}

describe('cvScoresQ.latestByDocuments', () => {
  it('returns [] for an empty id list without querying', async () => {
    const u = await makeUser()
    expect(await cvScoresQ.latestByDocuments(u.id, [])).toEqual([])
  })

  it('returns only the newest score per document, in one call', async () => {
    const u = await makeUser()
    const a = await makeCv(u.id, 'A')
    const b = await makeCv(u.id, 'B')
    const unscored = await makeCv(u.id, 'C')
    await addScore(u.id, a.id, 50, 0)
    await addScore(u.id, a.id, 77, 2, 'jd')
    await addScore(u.id, a.id, 60, 1)
    await addScore(u.id, b.id, 88, 0)

    const rows = await cvScoresQ.latestByDocuments(u.id, [a.id, b.id, unscored.id])
    const byId = Object.fromEntries(rows.map((r) => [r.documentId, r]))
    expect(rows).toHaveLength(2)
    expect(byId[a.id]).toMatchObject({ overall: 77, mode: 'jd' })
    expect(byId[b.id]).toMatchObject({ overall: 88, mode: 'general' })
    expect(byId[unscored.id]).toBeUndefined()
  })

  it('never returns another user\'s scores for the same document id', async () => {
    const u = await makeUser()
    const other = await makeUser()
    const doc = await makeCv(u.id, 'Mine')
    await addScore(other.id, doc.id, 99, 0)
    expect(await cvScoresQ.latestByDocuments(u.id, [doc.id])).toEqual([])
  })
})

describe('cvScoresQ.hasAny', () => {
  it('is false for a fresh user and true after any score, scoped per user', async () => {
    const u = await makeUser()
    const other = await makeUser()
    expect(await cvScoresQ.hasAny(u.id)).toBe(false)
    await addScore(other.id, null, 60, 0)
    expect(await cvScoresQ.hasAny(u.id)).toBe(false)
    await addScore(u.id, null, 60, 0)
    expect(await cvScoresQ.hasAny(u.id)).toBe(true)
  })
})
