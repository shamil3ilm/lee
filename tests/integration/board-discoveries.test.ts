import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { aiCallLogs, applications, discoveries, jobRiskAssessments } from '@/lib/db/schema'
import * as discQ from '@/lib/db/queries/discoveries'
import { moveDiscovery, saveDiscovery } from '@/app/(authed)/discoveries/actions'
import { makeUser, makeSource, makeDiscovery } from '@/tests/factories'

const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

beforeEach(() => sessionMock.mockReset())

function jobNormalized(slug: string) {
  return {
    kind: 'job',
    title: `Engineer ${slug}`,
    companyName: 'Acme',
    companyDomain: 'acme.example',
    applyUrl: `https://acme.example/jobs/${slug}`,
    techStack: ['go'],
    descriptionMd: 'Build things.',
  }
}

async function statusOf(id: string): Promise<string | undefined> {
  const [r] = await db.select({ status: discoveries.status }).from(discoveries).where(eq(discoveries.id, id))
  return r?.status
}

describe('moveDiscovery (triage board)', () => {
  it('shortlists, returns to New and dismisses with the implicit signal', async () => {
    const me = await makeUser()
    const src = await makeSource(me.id)
    const [call] = await db
      .insert(aiCallLogs)
      .values({ userId: me.id, provider: 'groq', kind: 'score_job', status: 'ok' })
      .returning()
    const d = await makeDiscovery(me.id, src.id, { scoredByCallId: call!.id })
    sessionMock.mockResolvedValue(me.id)

    expect(await moveDiscovery(d.id, 'shortlisted')).toEqual({ success: true })
    expect(await statusOf(d.id)).toBe('shortlisted')
    expect(await moveDiscovery(d.id, 'new')).toEqual({ success: true })
    expect(await statusOf(d.id)).toBe('new')

    expect(await moveDiscovery(d.id, 'dismissed')).toEqual({ success: true })
    expect(await statusOf(d.id)).toBe('dismissed')
    const [dismissedLog] = await db.select().from(aiCallLogs).where(eq(aiCallLogs.id, call!.id))
    expect(dismissedLog?.userAction).toBe('dismissed')

    // Restoring from Dismissed clears the negative signal.
    expect(await moveDiscovery(d.id, 'shortlisted')).toEqual({ success: true })
    const [restoredLog] = await db.select().from(aiCallLogs).where(eq(aiCallLogs.id, call!.id))
    expect(restoredLog?.userAction).toBeNull()
  })

  it('moving to Applied promotes to an application, which then cannot move back', async () => {
    const me = await makeUser()
    const src = await makeSource(me.id)
    const d = await makeDiscovery(me.id, src.id, { status: 'shortlisted', normalized: jobNormalized('a1') })
    sessionMock.mockResolvedValue(me.id)

    expect(await moveDiscovery(d.id, 'saved')).toEqual({ success: true })
    const [row] = await db.select().from(discoveries).where(eq(discoveries.id, d.id))
    expect(row?.status).toBe('saved')
    expect(row?.savedApplicationId).toBeTruthy()
    const apps = await db.select().from(applications).where(eq(applications.userId, me.id))
    expect(apps).toHaveLength(1)

    const back = await moveDiscovery(d.id, 'new')
    expect(back).toEqual({ error: expect.stringContaining('already in your pipeline') })
    expect(await statusOf(d.id)).toBe('saved')
  })

  it('the inbox Save button works for shortlisted roles too', async () => {
    const me = await makeUser()
    const src = await makeSource(me.id)
    const d = await makeDiscovery(me.id, src.id, { status: 'shortlisted', normalized: jobNormalized('s1') })
    sessionMock.mockResolvedValue(me.id)
    expect(await saveDiscovery(d.id)).toEqual({ success: true })
    expect(await statusOf(d.id)).toBe('saved')
  })

  it('validates input and scopes by user', async () => {
    const me = await makeUser()
    const other = await makeUser()
    const src = await makeSource(other.id)
    const theirs = await makeDiscovery(other.id, src.id)
    sessionMock.mockResolvedValue(me.id)
    expect(await moveDiscovery(theirs.id, 'banana')).toEqual({ error: 'Invalid move.' })
    expect(await moveDiscovery('x', 'new')).toEqual({ error: 'Invalid move.' })
    expect(await moveDiscovery(theirs.id, 'dismissed')).toEqual({ error: 'Discovery not found.' })
    expect(await statusOf(theirs.id)).toBe('new')
  })
})

describe('discovery board queries', () => {
  it('counts per status without quarantined rows and lists a capped column', async () => {
    const me = await makeUser()
    const src = await makeSource(me.id)
    await makeDiscovery(me.id, src.id)
    await makeDiscovery(me.id, src.id)
    const scam = await makeDiscovery(me.id, src.id)
    await makeDiscovery(me.id, src.id, { status: 'shortlisted' })
    await makeDiscovery(me.id, src.id, { status: 'dismissed' })
    await db.insert(jobRiskAssessments).values({
      userId: me.id,
      targetType: 'discovery',
      targetId: scam.id,
      score: 90,
      level: 'likely_scam',
      rulesVersion: 'test',
    })

    expect(await discQ.countByStatus(me.id)).toEqual({ new: 2, shortlisted: 1, saved: 0, dismissed: 1 })
    const firstNew = await discQ.list(me.id, { status: 'new', quarantine: 'exclude', limit: 1 })
    expect(firstNew).toHaveLength(1)
    expect(firstNew[0]!.id).not.toBe(scam.id)
    expect(firstNew[0]).toHaveProperty('savedApplicationId', null)
  })
})
