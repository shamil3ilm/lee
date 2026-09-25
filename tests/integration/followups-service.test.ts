import { describe, it, expect } from 'vitest'
import {
  alreadyNudgedRecently,
  findFollowupCandidates,
} from '@/lib/followups/service'
import { db } from '@/lib/db/client'
import { activities, documents } from '@/lib/db/schema'
import {
  makeApplication,
  makeCompany,
  makeJob,
  makeUser,
} from '@/tests/factories'

const MS_PER_DAY = 24 * 60 * 60 * 1000

async function seed(email: string, daysAgoApplied: number, status = 'applied') {
  const u = await makeUser(email)
  const co = await makeCompany(u.id, { name: 'Stripe' })
  const j = await makeJob(u.id, co.id, { title: 'Staff Payments Engineer' })
  const app = await makeApplication(u.id, j.id, {
    status,
    appliedAt: new Date(Date.now() - daysAgoApplied * MS_PER_DAY),
  })
  return { u, co, j, app }
}

describe('findFollowupCandidates', () => {
  it('returns nothing when appliedAt is null', async () => {
    const u = await makeUser('fup-null@x.com')
    const co = await makeCompany(u.id)
    const j = await makeJob(u.id, co.id)
    await makeApplication(u.id, j.id, { status: 'applied' })
    const result = await findFollowupCandidates(u.id)
    expect(result).toHaveLength(0)
  })

  it('skips applications younger than 7 days', async () => {
    const { u } = await seed('fup-young@x.com', 3)
    const result = await findFollowupCandidates(u.id)
    expect(result).toHaveLength(0)
  })

  it('suggests 7-day bucket for a week-old application', async () => {
    const { u, app } = await seed('fup-7@x.com', 8)
    const result = await findFollowupCandidates(u.id)
    expect(result).toHaveLength(1)
    expect(result[0]?.applicationId).toBe(app.id)
    expect(result[0]?.suggestedInterval).toBe(7)
  })

  it('suggests the highest crossed interval', async () => {
    const { u } = await seed('fup-25@x.com', 25)
    const result = await findFollowupCandidates(u.id)
    expect(result[0]?.suggestedInterval).toBe(21)
  })

  it('suggests 30-day bucket at day 45', async () => {
    const { u } = await seed('fup-45@x.com', 45)
    const result = await findFollowupCandidates(u.id)
    expect(result[0]?.suggestedInterval).toBe(30)
  })

  it('excludes interview / offer / rejected statuses', async () => {
    for (const status of ['interview', 'offer', 'rejected', 'withdrawn']) {
      const { u } = await seed(`fup-status-${status}@x.com`, 10, status)
      const result = await findFollowupCandidates(u.id)
      expect(result).toHaveLength(0)
    }
  })

  it('includes screen status', async () => {
    const { u } = await seed('fup-screen@x.com', 10, 'screen')
    const result = await findFollowupCandidates(u.id)
    expect(result).toHaveLength(1)
  })

  it('skips when a follow-up doc for that interval already exists', async () => {
    const { u, app } = await seed('fup-dup@x.com', 10)
    await db.insert(documents).values({
      userId: u.id,
      applicationId: app.id,
      kind: 'outreach_followup_email',
      version: 1,
      title: 'Follow-up day 7',
      content: { kind: 'followup_email', applicationId: app.id, body: 'x', tone: 'friendly', wordCount: 1, daysSince: 7 },
    })
    const result = await findFollowupCandidates(u.id)
    expect(result).toHaveLength(0)
  })

  it('still nudges when a follow-up for a different interval exists', async () => {
    const { u, app } = await seed('fup-diff@x.com', 20)
    // Day 7 doc exists but user is now at day 20 (bucket 14) — still nudge.
    await db.insert(documents).values({
      userId: u.id,
      applicationId: app.id,
      kind: 'outreach_followup_email',
      version: 1,
      title: 'Follow-up day 7',
      content: { kind: 'followup_email', applicationId: app.id, body: 'x', tone: 'friendly', wordCount: 1, daysSince: 7 },
    })
    const result = await findFollowupCandidates(u.id)
    expect(result).toHaveLength(1)
    expect(result[0]?.suggestedInterval).toBe(14)
  })

  it('skips when recent inbound email activity exists', async () => {
    const { u, app } = await seed('fup-email@x.com', 10)
    await db.insert(activities).values({
      userId: u.id,
      applicationId: app.id,
      kind: 'email',
      payload: { subject: 'Following up' },
    })
    const result = await findFollowupCandidates(u.id)
    expect(result).toHaveLength(0)
  })
})

describe('alreadyNudgedRecently', () => {
  it('returns false when no nudge exists', async () => {
    const { u, app } = await seed('nudge-none@x.com', 10)
    expect(await alreadyNudgedRecently(u.id, app.id)).toBe(false)
  })

  it('returns true after a fresh nudge activity', async () => {
    const { u, app } = await seed('nudge-fresh@x.com', 10)
    await db.insert(activities).values({
      userId: u.id,
      applicationId: app.id,
      kind: 'followup_recommended',
      payload: { daysSince: 10, suggestedInterval: 7 },
    })
    expect(await alreadyNudgedRecently(u.id, app.id)).toBe(true)
  })

  it('returns false for a stale (>24h) nudge', async () => {
    const { u, app } = await seed('nudge-stale@x.com', 10)
    // Insert then backdate the createdAt.
    const [row] = await db
      .insert(activities)
      .values({
        userId: u.id,
        applicationId: app.id,
        kind: 'followup_recommended',
        payload: { daysSince: 8, suggestedInterval: 7 },
      })
      .returning()
    if (!row) throw new Error('failed to seed activity')
    // Force a >24h-old createdAt via direct SQL update.
    const twoDaysAgo = new Date(Date.now() - 2 * MS_PER_DAY)
    const { eq } = await import('drizzle-orm')
    await db
      .update(activities)
      .set({ createdAt: twoDaysAgo })
      .where(eq(activities.id, row.id))
    expect(await alreadyNudgedRecently(u.id, app.id)).toBe(false)
  })
})
