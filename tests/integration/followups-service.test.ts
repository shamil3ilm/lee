import { describe, it, expect } from 'vitest'
import {
  alreadyNudgedRecently,
  findFollowupCandidates,
} from '@/lib/followups/service'
import { db } from '@/lib/db/client'
import { activities, documents } from '@/lib/db/schema'
import * as profileQ from '@/lib/db/queries/profile'
import {
  makeApplication,
  makeCompany,
  makeJob,
  makeUser,
} from '@/tests/factories'

const MS_PER_DAY = 24 * 60 * 60 * 1000
// A Monday; business days are Monday to Friday (lib/followups/cadence.ts).
const NOW = new Date('2026-10-19T10:00:00Z')

async function seed(
  email: string,
  appliedOn: string | null,
  opts: { status?: string; company?: string; location?: string } = {},
) {
  const u = await makeUser(email)
  const co = await makeCompany(u.id, { name: opts.company ?? 'Stripe' })
  const j = await makeJob(u.id, co.id, { title: 'Staff Payments Engineer', location: opts.location ?? 'Bengaluru, India' })
  const app = await makeApplication(u.id, j.id, {
    status: opts.status ?? 'applied',
    ...(appliedOn ? { appliedAt: new Date(`${appliedOn}T10:00:00Z`) } : {}),
  })
  return { u, co, j, app }
}

function draft(userId: string, applicationId: string, content: Record<string, unknown>) {
  return db.insert(documents).values({
    userId,
    applicationId,
    kind: 'outreach_followup_email',
    version: 1,
    title: 'Follow-up',
    content: { kind: 'followup_email', applicationId, body: 'x', tone: 'friendly', wordCount: 1, ...content },
  })
}

describe('findFollowupCandidates (two notes in business days, then stop)', () => {
  it('returns nothing when appliedAt is null', async () => {
    const { u } = await seed('fup-null@x.com', null)
    expect(await findFollowupCandidates(u.id, NOW)).toHaveLength(0)
  })

  it('waits for 5 business days before the check-in', async () => {
    const { u } = await seed('fup-young@x.com', '2026-10-15')
    expect(await findFollowupCandidates(u.id, NOW)).toHaveLength(0)
  })

  it('suggests the check-in at 5 business days', async () => {
    const { u, app } = await seed('fup-5@x.com', '2026-10-12')
    const result = await findFollowupCandidates(u.id, NOW)
    expect(result).toEqual([expect.objectContaining({ applicationId: app.id, step: 1, daysSince: 5 })])
  })

  it('suggests the final note at 10 business days, and still at day 45', async () => {
    const { u } = await seed('fup-10@x.com', '2026-10-05')
    expect((await findFollowupCandidates(u.id, NOW))[0]).toMatchObject({ step: 2, daysSince: 10 })
    const late = await seed('fup-45@x.com', null)
    await makeApplication(late.u.id, late.j.id, { status: 'applied', appliedAt: new Date(NOW.getTime() - 45 * MS_PER_DAY) })
    expect((await findFollowupCandidates(late.u.id, NOW))[0]?.step).toBe(2)
  })

  it('a GCC posting through an agency gets the check-in at 3 business days', async () => {
    const agency = await seed('fup-gcc-agency@x.com', '2026-10-14', { company: 'Example Gulf Recruitment LLC', location: 'Dubai, UAE' })
    expect((await findFollowupCandidates(agency.u.id, NOW))[0]).toMatchObject({ step: 1, daysSince: 3 })
    const direct = await seed('fup-gcc-direct@x.com', '2026-10-14', { company: 'Example Pay FZ-LLC', location: 'Dubai, UAE' })
    expect(await findFollowupCandidates(direct.u.id, NOW)).toHaveLength(0)
  })

  it('follows the user’s own marks', async () => {
    const { u } = await seed('fup-custom@x.com', '2026-10-12')
    await profileQ.upsert(u.id, { followupDays: 7, followupSecondDays: 12 })
    expect(await findFollowupCandidates(u.id, NOW)).toHaveLength(0)
  })

  it('excludes interview / offer / rejected statuses and includes screen', async () => {
    for (const status of ['interview', 'offer', 'rejected', 'withdrawn']) {
      const { u } = await seed(`fup-status-${status}@x.com`, '2026-10-05', { status })
      expect(await findFollowupCandidates(u.id, NOW)).toHaveLength(0)
    }
    const { u } = await seed('fup-screen@x.com', '2026-10-05', { status: 'screen' })
    expect(await findFollowupCandidates(u.id, NOW)).toHaveLength(1)
  })

  it('skips a step already drafted; after the final note it stops', async () => {
    const one = await seed('fup-dup@x.com', '2026-10-12')
    await draft(one.u.id, one.app.id, { daysSince: 5, followupStep: 1 })
    expect(await findFollowupCandidates(one.u.id, NOW)).toHaveLength(0)

    const two = await seed('fup-next@x.com', '2026-10-05')
    await draft(two.u.id, two.app.id, { daysSince: 5, followupStep: 1 })
    expect((await findFollowupCandidates(two.u.id, NOW))[0]?.step).toBe(2)
    await draft(two.u.id, two.app.id, { daysSince: 10, followupStep: 2 })
    expect(await findFollowupCandidates(two.u.id, NOW)).toHaveLength(0)
  })

  it('reads drafts from the old 7/14/21/30 cadence', async () => {
    const { u, app } = await seed('fup-legacy@x.com', '2026-10-05')
    await draft(u.id, app.id, { daysSince: 7 })
    expect((await findFollowupCandidates(u.id, NOW))[0]?.step).toBe(2)
    await draft(u.id, app.id, { daysSince: 21 })
    expect(await findFollowupCandidates(u.id, NOW)).toHaveLength(0)
  })

  it('skips when recent inbound email activity exists', async () => {
    const { u, app } = await seed('fup-email@x.com', '2026-10-05')
    await db.insert(activities).values({
      userId: u.id,
      applicationId: app.id,
      kind: 'email',
      payload: { subject: 'Following up' },
      createdAt: new Date(NOW.getTime() - MS_PER_DAY),
    })
    expect(await findFollowupCandidates(u.id, NOW)).toHaveLength(0)
  })
})

describe('alreadyNudgedRecently', () => {
  it('returns false when no nudge exists', async () => {
    const { u, app } = await seed('nudge-none@x.com', '2026-10-05')
    expect(await alreadyNudgedRecently(u.id, app.id)).toBe(false)
  })

  it('returns true after a fresh nudge activity', async () => {
    const { u, app } = await seed('nudge-fresh@x.com', '2026-10-05')
    await db.insert(activities).values({
      userId: u.id,
      applicationId: app.id,
      kind: 'followup_recommended',
      payload: { daysSince: 10, step: 2 },
    })
    expect(await alreadyNudgedRecently(u.id, app.id)).toBe(true)
  })

  it('returns false for a stale (>24h) nudge', async () => {
    const { u, app } = await seed('nudge-stale@x.com', '2026-10-05')
    // Insert then backdate the createdAt.
    const [row] = await db
      .insert(activities)
      .values({
        userId: u.id,
        applicationId: app.id,
        kind: 'followup_recommended',
        payload: { daysSince: 8, step: 1 },
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
