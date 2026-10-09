import { describe, expect, it, vi } from 'vitest'
import { db, getPgliteClient } from '@/lib/db/client'
import { activities, documents } from '@/lib/db/schema'
import { findFollowupCandidates, recordFollowupNudges } from '@/lib/followups/service'
import { makeApplication, makeCompany, makeJob, makeUser } from '@/tests/factories'

const DAY = 24 * 60 * 60 * 1000
// A Monday in the past (so real-time nudges count as recent); applied the
// Friday before last = 6 business days: the check-in is due.
const NOW = new Date('2026-09-21T10:00:00Z')

async function captureSql<T>(fn: () => Promise<T>): Promise<{ result: T; sqls: string[] }> {
  const spy = vi.spyOn(getPgliteClient()!, 'query')
  try {
    const result = await fn()
    return { result, sqls: spy.mock.calls.map((c) => String(c[0])) }
  } finally {
    spy.mockRestore()
  }
}

async function seed(n: number) {
  const u = await makeUser()
  const co = await makeCompany(u.id)
  const apps = []
  for (let i = 0; i < n; i++) {
    const j = await makeJob(u.id, co.id)
    apps.push(await makeApplication(u.id, j.id, { status: 'applied', appliedAt: new Date(NOW.getTime() - 10 * DAY) }))
  }
  return { userId: u.id, apps }
}

describe('follow-up candidates without N+1', () => {
  it('uses a constant number of queries and never loads full document content', async () => {
    const { userId, apps } = await seed(8)
    // One app already has a check-in draft (old day-7 cadence), one has a live email thread.
    await db.insert(documents).values({
      userId,
      applicationId: apps[0]!.id,
      kind: 'outreach_followup_email',
      title: 'Follow-up',
      content: { body: 'x'.repeat(5000), daysSince: 7 },
    })
    await db.insert(activities).values({ userId, applicationId: apps[1]!.id, kind: 'email', payload: {}, createdAt: new Date(NOW.getTime() - DAY) })

    const { result, sqls } = await captureSql(() => findFollowupCandidates(userId, NOW))
    expect(result.map((c) => c.applicationId).sort()).toEqual(apps.slice(2).map((a) => a.id).sort())
    // Before: 1 + 2 per candidate app (17 here). Now: apps, cadence settings, drafts, emails.
    expect(sqls.length).toBeLessThanOrEqual(4)
    const docQueries = sqls.filter((s) => /from "documents"/i.test(s))
    expect(docQueries).toHaveLength(1)
    expect(docQueries[0]).not.toMatch(/"documents"\."content"\s*(,|from)/i)
  })

  it('recordFollowupNudges inserts one nudge per candidate per day, checking all apps in one query', async () => {
    const { userId, apps } = await seed(6)
    const first = await recordFollowupNudges(userId, NOW)
    expect(first).toBe(6)
    const { result: second, sqls } = await captureSql(() => recordFollowupNudges(userId, NOW))
    expect(second).toBe(0)
    expect(sqls.filter((s) => /followup_recommended/.test(s) || /"kind" = \$/.test(s)).length).toBeLessThanOrEqual(3)
    expect(sqls.length).toBeLessThanOrEqual(6)
    const nudges = (await db.select().from(activities)).filter((a) => a.kind === 'followup_recommended')
    expect(nudges).toHaveLength(apps.length)
    expect(nudges[0]?.payload).toMatchObject({ daysSince: 6, step: 1 })
  })
})
