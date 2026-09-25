import { describe, it, expect, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { applications, interviewStages, discoveries, sources, todos } from '@/lib/db/schema'
import * as profileQ from '@/lib/db/queries/profile'
import {
  alreadySentThisWeek,
  gatherPipelineSnapshot,
  isMondayUtc,
  sendWeeklyDigest,
} from '@/lib/digest/weekly'
import { renderWeeklyDigestHtml } from '@/lib/digest/email-template'
import {
  makeUser,
  makeCompany,
  makeJob,
  makeApplication,
} from '@/tests/factories'

const DAY_MS = 24 * 60 * 60 * 1000

describe('isMondayUtc', () => {
  it('true on Monday, false otherwise', () => {
    expect(isMondayUtc(new Date('2026-02-02T09:00:00Z'))).toBe(true) // Mon
    expect(isMondayUtc(new Date('2026-02-03T09:00:00Z'))).toBe(false) // Tue
    expect(isMondayUtc(new Date('2026-02-01T09:00:00Z'))).toBe(false) // Sun
  })
})

describe('alreadySentThisWeek', () => {
  it('null profile → false', () => {
    expect(alreadySentThisWeek(null)).toBe(false)
    expect(alreadySentThisWeek({ digestLastSentAt: null })).toBe(false)
  })

  it('sent this Monday → true even when called Thursday', () => {
    const monday = new Date('2026-02-02T08:00:00Z')
    const thursday = new Date('2026-02-05T09:00:00Z')
    expect(alreadySentThisWeek({ digestLastSentAt: monday }, thursday)).toBe(true)
  })

  it('sent previous Sunday (last week) → false on the following Monday', () => {
    const lastSunday = new Date('2026-02-01T20:00:00Z')
    const nextMonday = new Date('2026-02-02T09:00:00Z')
    expect(alreadySentThisWeek({ digestLastSentAt: lastSunday }, nextMonday)).toBe(false)
  })

  it('sent this Sunday, called same Sunday → true (still in same week)', () => {
    const sunday = new Date('2026-02-08T18:00:00Z')
    const sameSunday = new Date('2026-02-08T20:00:00Z')
    expect(alreadySentThisWeek({ digestLastSentAt: sunday }, sameSunday)).toBe(true)
  })
})

describe('gatherPipelineSnapshot', () => {
  it('summarizes applications, interviews, discoveries, and stale follow-ups', async () => {
    const u = await makeUser('digest-1@x.com')
    const c = await makeCompany(u.id, { name: 'Stripe' })
    const j1 = await makeJob(u.id, c.id, { title: 'A' })
    const j2 = await makeJob(u.id, c.id, { title: 'B' })
    const j3 = await makeJob(u.id, c.id, { title: 'Stale role' })

    const a1 = await makeApplication(u.id, j1.id, { status: 'applied' })
    const a2 = await makeApplication(u.id, j2.id, { status: 'interview' })
    const a3 = await makeApplication(u.id, j3.id, { status: 'applied' })

    // Stale: nextActionAt 30 days ago.
    await db
      .update(applications)
      .set({ nextActionAt: new Date(Date.now() - 30 * DAY_MS) })
      .where(eq(applications.id, a3.id))

    // Upcoming interview for a2.
    await db.insert(interviewStages).values({
      userId: u.id,
      applicationId: a2.id,
      kind: 'tech_screen',
      scheduledAt: new Date(Date.now() + 2 * DAY_MS),
    })

    // A discovery to surface.
    const [src] = await db
      .insert(sources)
      .values({ userId: u.id, name: 'HN', kind: 'hn', config: {} })
      .returning()
    if (!src) throw new Error('failed to create source')
    await db.insert(discoveries).values({
      userId: u.id,
      sourceId: src.id,
      sourceJobId: 'j-hn-1',
      raw: {},
      normalized: { title: 'Discovered Role', companyName: 'DiscoCo' },
      matchScore: 82,
      status: 'new',
    })

    const snap = await gatherPipelineSnapshot(u.id)
    expect(snap.userEmail).toBe('digest-1@x.com')
    expect(snap.totalApplications).toBe(3)
    expect(snap.applicationsByStatus.some((r) => r.status === 'applied' && r.count === 2)).toBe(true)
    expect(snap.upcomingInterviews).toHaveLength(1)
    expect(snap.upcomingInterviews[0]?.stageKind).toBe('tech_screen')
    expect(snap.topDiscoveries).toHaveLength(1)
    expect(snap.topDiscoveries[0]?.title).toBe('Discovered Role')
    expect(snap.staleApplications).toHaveLength(1)
    expect(snap.staleApplications[0]?.jobTitle).toBe('Stale role')

    // silence unused-var lints
    void a1
  })

  it('includes upcoming open todos within the next 7 days', async () => {
    const u = await makeUser('digest-todos@x.com')
    // Due tomorrow — included.
    await db.insert(todos).values({
      userId: u.id,
      title: 'Send CV',
      dueAt: new Date(Date.now() + 1 * DAY_MS),
    })
    // Due in 30 days — excluded.
    await db.insert(todos).values({
      userId: u.id,
      title: 'Long-term',
      dueAt: new Date(Date.now() + 30 * DAY_MS),
    })
    // Done — excluded.
    await db.insert(todos).values({
      userId: u.id,
      title: 'Completed',
      status: 'done',
      dueAt: new Date(Date.now() + 2 * DAY_MS),
    })
    const snap = await gatherPipelineSnapshot(u.id)
    expect(snap.upcomingTodos).toHaveLength(1)
    expect(snap.upcomingTodos[0]?.title).toBe('Send CV')
  })

  it('surfaces stages completed in the last 7 days with debrief flags', async () => {
    const u = await makeUser('digest-completed@x.com')
    const c = await makeCompany(u.id, { name: 'Stripe' })
    const j = await makeJob(u.id, c.id, { title: 'Payments' })
    const app = await makeApplication(u.id, j.id, { status: 'interview' })

    // Stage 1: completed 2 days ago, has quick notes only.
    const [stage1] = await db
      .insert(interviewStages)
      .values({
        userId: u.id,
        applicationId: app.id,
        kind: 'phone_screen',
        status: 'completed',
        debriefNotesMd: '## What went well\n- SQL question landed',
      })
      .returning()
    if (!stage1) throw new Error('stage1 insert failed')
    await db
      .update(interviewStages)
      .set({ updatedAt: new Date(Date.now() - 2 * DAY_MS) })
      .where(eq(interviewStages.id, stage1.id))

    // Stage 2: completed 3 days ago, has AI debrief document.
    const [stage2] = await db
      .insert(interviewStages)
      .values({
        userId: u.id,
        applicationId: app.id,
        kind: 'tech_screen',
        status: 'completed',
        debriefNotesMd: '- crushed it',
      })
      .returning()
    if (!stage2) throw new Error('stage2 insert failed')
    await db
      .update(interviewStages)
      .set({ updatedAt: new Date(Date.now() - 3 * DAY_MS) })
      .where(eq(interviewStages.id, stage2.id))
    // Emulate what the debrief service persists — a documents row whose
    // content.stageId points back to stage2.
    const { documents } = await import('@/lib/db/schema')
    await db.insert(documents).values({
      userId: u.id,
      applicationId: app.id,
      kind: 'interview_debrief',
      version: 1,
      title: 'Debrief',
      content: {
        stageId: stage2.id,
        applicationId: app.id,
        summary: 'x',
        wentWell: [],
        toImprove: [],
        questionsAsked: [],
        redFlags: [],
        followUpRecommendations: [],
        outcomeConfidence: 'unclear',
        reasoning: 'x',
      },
    })

    // Stage 3: completed 30 days ago — outside the window, should NOT appear.
    const [stage3] = await db
      .insert(interviewStages)
      .values({
        userId: u.id,
        applicationId: app.id,
        kind: 'onsite',
        status: 'completed',
      })
      .returning()
    if (!stage3) throw new Error('stage3 insert failed')
    await db
      .update(interviewStages)
      .set({ updatedAt: new Date(Date.now() - 30 * DAY_MS) })
      .where(eq(interviewStages.id, stage3.id))

    // Stage 4: still scheduled — should NOT appear.
    await db.insert(interviewStages).values({
      userId: u.id,
      applicationId: app.id,
      kind: 'final',
      status: 'scheduled',
    })

    const snap = await gatherPipelineSnapshot(u.id)
    expect(snap.completedStagesThisWeek).toHaveLength(2)
    const byKind = new Map(snap.completedStagesThisWeek.map((s) => [s.stageKind, s]))
    expect(byKind.get('phone_screen')?.hasDebrief).toBe(true)
    expect(byKind.get('phone_screen')?.hasAIDebrief).toBe(false)
    expect(byKind.get('tech_screen')?.hasDebrief).toBe(true)
    expect(byKind.get('tech_screen')?.hasAIDebrief).toBe(true)
  })

  it('scopes strictly by userId', async () => {
    const u1 = await makeUser('digest-scope-1@x.com')
    const u2 = await makeUser('digest-scope-2@x.com')
    const c = await makeCompany(u2.id)
    const j = await makeJob(u2.id, c.id)
    await makeApplication(u2.id, j.id, { status: 'applied' })

    const snap = await gatherPipelineSnapshot(u1.id)
    expect(snap.totalApplications).toBe(0)
    expect(snap.applicationsByStatus).toHaveLength(0)
  })
})

describe('sendWeeklyDigest', () => {
  it('sends via injected sendEmail and updates digestLastSentAt', async () => {
    const u = await makeUser('digest-send@x.com')
    const c = await makeCompany(u.id, { name: 'Stripe' })
    const j = await makeJob(u.id, c.id)
    await makeApplication(u.id, j.id, { status: 'applied' })

    type SendArgs = { userId: string; to: string; subject: string; htmlBody: string }
    const send = vi.fn(async (_args: SendArgs) => ({ messageId: 'msg-abc' }))
    const before = new Date()
    const { messageId, snapshot } = await sendWeeklyDigest({
      userId: u.id,
      sendEmail: send,
    })
    expect(messageId).toBe('msg-abc')
    expect(send).toHaveBeenCalledTimes(1)
    const arg = send.mock.calls[0]?.[0] as SendArgs | undefined
    expect(arg?.to).toBe('digest-send@x.com')
    expect(arg?.subject).toContain('Employ')
    expect(arg?.htmlBody).toContain('Your Employ week')
    expect(snapshot.totalApplications).toBe(1)

    const profile = await profileQ.get(u.id)
    expect(profile?.digestLastSentAt).not.toBeNull()
    expect(profile!.digestLastSentAt!.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000)
  })

  it('surfaces send errors without updating digestLastSentAt', async () => {
    const u = await makeUser('digest-fail@x.com')
    const send = vi.fn(async () => {
      throw new Error('boom')
    })
    await expect(
      sendWeeklyDigest({ userId: u.id, sendEmail: send }),
    ).rejects.toThrow(/boom/)
    const profile = await profileQ.get(u.id)
    expect(profile?.digestLastSentAt ?? null).toBeNull()
  })
})

describe('renderWeeklyDigestHtml', () => {
  it('produces valid HTML with all sections', async () => {
    const u = await makeUser('digest-render@x.com')
    const c = await makeCompany(u.id, { name: 'Stripe' })
    const j = await makeJob(u.id, c.id)
    await makeApplication(u.id, j.id, { status: 'applied' })
    const snap = await gatherPipelineSnapshot(u.id)
    const html = renderWeeklyDigestHtml(snap)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('Your Employ week')
    expect(html).toContain('Applications by status')
    expect(html).toContain('Upcoming interviews')
    expect(html).toContain('Top discoveries')
    expect(html).toContain('Stale follow-ups')
    expect(html).toContain('Upcoming this week')
    expect(html).toContain('Interviews this week')
    expect(html).toContain('/settings/notifications')
  })
})
