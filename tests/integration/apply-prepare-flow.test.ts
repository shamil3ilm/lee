import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { accounts, activities, applications, documents, shortlistEntries } from '@/lib/db/schema'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import { AISkippedError } from '@/lib/ai/signal'
import * as profileQ from '@/lib/db/queries/profile'
import * as prepsQ from '@/lib/db/queries/applicationPreps'
import * as discQ from '@/lib/db/queries/discoveries'
import { saveResumeProfile } from '@/lib/resume/service'
import { createVariant } from '@/lib/variants/service'
import { buildShortlistForUser } from '@/lib/apply/shortlist'
import { confirmVariant, coverStep, saveChecklist, skipStep, startPrepare, tailorStep } from '@/lib/apply/prepare'
import { markApplied } from '@/lib/apply/applied'
import { completeFollowup, dueFollowups } from '@/lib/apply/followups'
import { prepareBatch } from '@/lib/apply/batch'
import { weekFunnel } from '@/lib/apply/funnel'
import { syncGmail } from '@/lib/gmail/sync'
import type { GmailThreadFull } from '@/lib/gmail/adapter'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'
import { makeDiscovery, makeSource, makeUser } from '@/tests/factories'

const DAY = 24 * 60 * 60 * 1000
const originalFetch = globalThis.fetch

const DESCRIPTION = [
  'We build payment APIs with PHP, Laravel and MySQL.',
  'Please include a cover letter and a link to your GitHub.',
  'How many years have you worked with Laravel?',
].join('\n')

async function setup() {
  const u = await makeUser()
  await profileQ.upsert(u.id, {
    timezone: 'UTC',
    headline: 'Backend Engineer',
    skills: ['PHP', 'Laravel', 'MySQL'],
    followupDays: 7,
    links: [{ id: 'gh', label: 'GitHub', url: 'https://github.com/example', kind: 'github' }],
  })
  await saveResumeProfile(u.id, syntheticProfile())
  const variant = await createVariant(u.id, { region: 'remote', roleFamily: 'backend' })
  const src = await makeSource(u.id, { kind: 'greenhouse' })
  const disc = await makeDiscovery(u.id, src.id, {
    matchScore: 85,
    regions: ['remote'],
    normalized: {
      kind: 'job',
      title: 'Backend Engineer (PHP)',
      companyName: 'Payco',
      companyDomain: 'payco.example',
      remoteType: 'remote',
      descriptionMd: DESCRIPTION,
      applyUrl: 'https://boards.greenhouse.io/payco/jobs/1',
      techStack: ['php', 'laravel'],
    },
  })
  return { u, variant, src, disc }
}

function reply(threadId: string): GmailThreadFull {
  return {
    id: threadId,
    messages: [
      {
        id: `${threadId}-1`,
        threadId,
        snippet: 'Thanks for applying',
        internalDate: '1700000000000',
        payload: { headers: [{ name: 'From', value: 'Talent <talent@payco.example>' }, { name: 'Subject', value: 'Your application' }] },
      },
    ],
  }
}

beforeEach(() => {
  ;(globalThis as { fetch: typeof fetch }).fetch = originalFetch
})
afterEach(() => {
  ;(globalThis as { fetch: typeof fetch }).fetch = originalFetch
  vi.restoreAllMocks()
})

describe('prepare application, end to end (AI fixtures)', () => {
  it('variant → tailored CV → cover letter → checklist → mark applied → follow-up → a reply cancels it', async () => {
    const { u, variant, disc } = await setup()
    const ai = new FixtureAIProvider()
    await buildShortlistForUser(u.id)

    // Prepare creates the application (Saved) once.
    const started = await startPrepare(u.id, { discoveryId: disc.id })
    expect(started.created).toBe(true)
    const again = await startPrepare(u.id, { discoveryId: disc.id })
    expect(again).toEqual({ applicationId: started.applicationId, created: false })
    const appId = started.applicationId
    const [app] = await db.select().from(applications).where(eq(applications.id, appId))
    expect(app?.status).toBe('saved')
    expect((await discQ.getById(u.id, disc.id))?.status).toBe('saved')
    const [entry] = await db.select().from(shortlistEntries).where(eq(shortlistEntries.discoveryId, disc.id))
    expect(entry?.state).toBe('preparing')

    // 1. Variant
    const p1 = await confirmVariant(u.id, appId, variant.id)
    expect(p1.variant).toEqual({ status: 'done', variantId: variant.id, version: variant.currentVersion })

    // 2. Tailored CV from the variant, with the CV Score delta.
    const t = await tailorStep(u.id, appId, ai)
    const [tailored] = await db.select().from(documents).where(eq(documents.id, t.documentId))
    expect(tailored?.kind).toBe('tailored_cv')
    expect(tailored?.aiGenerationMeta).toMatchObject({ resumeVariantId: variant.id })
    expect(typeof t.scoreBefore).toBe('number')
    expect(typeof t.scoreAfter).toBe('number')
    expect(t.progress.tailor).toMatchObject({ status: 'done', documentId: t.documentId, version: 1 })

    // 3. Cover letter with the ticked link.
    const c = await coverStep(u.id, appId, ai, ['gh'])
    expect(c.progress.cover).toMatchObject({ status: 'done', linkIds: ['gh'] })

    // 4. Checklist → prepared.
    const p4 = await saveChecklist(u.id, appId, ['apply', 'doc:cv'], true)
    expect(p4.checklist).toEqual({ status: 'done', checked: ['apply', 'doc:cv'] })
    const prepared = await prepsQ.get(u.id, appId)
    expect(prepared?.preparedAt).toBeInstanceOf(Date)

    // 5. Mark applied two days ago → stage moves, versions recorded, nudge scheduled.
    const now = new Date()
    const day = new Date(now.getTime() - 2 * DAY).toISOString().slice(0, 10)
    const applied = await markApplied(u.id, appId, day, now)
    const [after] = await db.select().from(applications).where(eq(applications.id, appId))
    expect(after?.status).toBe('applied')
    expect(after?.appliedAt?.toISOString()).toBe(`${day}T12:00:00.000Z`)
    expect(applied.progress.applied).toMatchObject({
      variantId: variant.id,
      variantVersion: variant.currentVersion,
      documents: [
        { id: t.documentId, kind: 'tailored_cv', version: 1 },
        { id: c.documentId, kind: 'cover_letter', version: 1 },
      ],
    })
    const dueDay = new Date(new Date(`${day}T12:00:00Z`).getTime() + 7 * DAY).toISOString().slice(0, 10)
    expect(applied.followupDueAt?.toISOString()).toBe(`${dueDay}T09:00:00.000Z`)
    expect((await prepsQ.get(u.id, appId))?.followupStatus).toBe('pending')

    // Idempotent: marking again keeps one status change.
    await markApplied(u.id, appId, day, now)
    const changes = await db
      .select()
      .from(activities)
      .where(and(eq(activities.applicationId, appId), eq(activities.kind, 'status_change')))
    expect(changes.filter((a) => (a.payload as { to?: string }).to === 'applied')).toHaveLength(1)

    // Due after 7 days, not before.
    expect(await dueFollowups(u.id, now)).toEqual([])
    const due = await dueFollowups(u.id, new Date(now.getTime() + 8 * DAY))
    expect(due.map((d) => d.applicationId)).toEqual([appId])

    // The funnel counts this week's steps.
    const funnel = await weekFunnel(u.id, now)
    expect(funnel.shortlisted).toBeGreaterThanOrEqual(1)
    expect(funnel.prepared).toBe(1)

    // A Gmail-matched reply cancels the pending nudge.
    await db.insert(accounts).values({
      userId: u.id,
      type: 'oauth',
      provider: 'google',
      providerAccountId: `google-${u.id}`,
      access_token: 'AT',
      refresh_token: 'RT',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'Bearer',
      scope: 'openid email profile gmail.readonly',
    })
    const r = await syncGmail({
      userId: u.id,
      adapters: { listThreads: async () => [{ id: 't1', historyId: '1', snippet: '' }], getThread: async () => reply('t1') },
    })
    expect(r.matched).toBe(1)
    const cancelled = await prepsQ.get(u.id, appId)
    expect(cancelled?.followupStatus).toBe('cancelled')
    expect(await dueFollowups(u.id, new Date(now.getTime() + 8 * DAY))).toEqual([])
    expect((await weekFunnel(u.id, now)).replied).toBe(1)
  })

  it('every step can be skipped and the flow resumes where it stopped', async () => {
    const { u, disc } = await setup()
    const { applicationId } = await startPrepare(u.id, { discoveryId: disc.id })
    await skipStep(u.id, applicationId, 'variant')
    await skipStep(u.id, applicationId, 'tailor')
    const resumed = await prepsQ.get(u.id, applicationId)
    expect(Object.keys(resumed!.progress)).toEqual(['variant', 'tailor'])
    expect(resumed?.preparedAt).toBeNull()
    await skipStep(u.id, applicationId, 'cover')
    await skipStep(u.id, applicationId, 'checklist')
    expect((await prepsQ.get(u.id, applicationId))?.preparedAt).toBeInstanceOf(Date)
  })

  it('refuses a future applied date, and a done follow-up is not rescheduled', async () => {
    const { u, disc } = await setup()
    const { applicationId } = await startPrepare(u.id, { discoveryId: disc.id })
    const tomorrow = new Date(Date.now() + DAY).toISOString().slice(0, 10)
    await expect(markApplied(u.id, applicationId, tomorrow)).rejects.toThrow(/future/)
    const today = new Date().toISOString().slice(0, 10)
    const first = await markApplied(u.id, applicationId, today)
    expect(await completeFollowup(u.id, applicationId)).toBe(1)
    const second = await markApplied(u.id, applicationId, today)
    expect(second.followupDueAt?.getTime()).toBe(first.followupDueAt?.getTime())
    expect((await prepsQ.get(u.id, applicationId))?.followupStatus).toBe('done')
  })

  it('a signal-gated AI step stays open with the reason', async () => {
    const { u, disc } = await setup()
    const { applicationId } = await startPrepare(u.id, { discoveryId: disc.id })
    const ai = new FixtureAIProvider({
      tailorCV: () => {
        throw new AISkippedError('test_skip', 'Not enough to tailor from.', 'Add more.')
      },
    })
    await expect(tailorStep(u.id, applicationId, ai)).rejects.toBeInstanceOf(AISkippedError)
    expect((await prepsQ.get(u.id, applicationId))?.progress.tailor).toBeUndefined()
  })

  it('batch-prepares up to three, with the suggested variant and links', async () => {
    const { u, variant, src, disc } = await setup()
    const more = await Promise.all(
      [1, 2, 3].map((i) =>
        makeDiscovery(u.id, src.id, {
          matchScore: 70,
          normalized: { kind: 'job', title: `Backend Engineer ${i}`, companyName: `Co ${i}`, companyDomain: `co${i}.example`, descriptionMd: DESCRIPTION, applyUrl: `https://co${i}.example/j` },
        }),
      ),
    )
    const items = await prepareBatch(u.id, [disc.id, ...more.map((m) => m.id)], {
      ai: new FixtureAIProvider(),
      deadline: Date.now() + 60_000,
    })
    expect(items).toHaveLength(3)
    expect(items.every((i) => i.status === 'prepared')).toBe(true)
    const prep = await prepsQ.get(u.id, items[0]!.applicationId!)
    expect(prep?.progress.variant?.variantId).toBe(variant.id)
    expect(prep?.progress.cover?.linkIds).toEqual(['gh'])
    // Nothing applied or sent: still Saved.
    const [app] = await db.select().from(applications).where(eq(applications.id, items[0]!.applicationId!))
    expect(app?.status).toBe('saved')
  })
})
