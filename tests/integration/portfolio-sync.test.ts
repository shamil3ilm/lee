import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { queueJobs } from '@/lib/db/schema'
import * as keysQ from '@/lib/db/queries/labProviderKeys'
import * as publishQ from '@/lib/db/queries/portfolioPublish'
import { logger } from '@/lib/logger'
import { canEditPublicFacts } from '@/lib/portfolio/lock'
import { serializeProfileJson, toJsonResume, type JsonDoc } from '@/lib/portfolio/map'
import { clearOrphans, pullPortfolio } from '@/lib/portfolio/pull'
import { loadSyncStatus } from '@/lib/portfolio/sync-status'
import { drain } from '@/lib/queue/drain'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { scheduleDailyJobs } from '@/lib/queue/scheduler'
import { getResumeProfile, PublicFactsLockedError, saveResumeProfile } from '@/lib/resume/service'
import type { ResumeProfile } from '@/lib/resume/types'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'
import { fakeGitHub, type FakeGitHub } from '@/tests/fixtures/fake-github'
import { makeUser } from '@/tests/factories'

const TOKEN = 'github_pat_11SYNTHETIC0000000000_abcdefghijklmnopqrstuvwxyz0123456789'
const TARGET = { owner: 'example-asha', repo: 'portfolio', path: 'profile.json' }
const NOW = new Date('2026-10-09T08:00:00Z')
const MIN = 60 * 1000
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a JSON document the tests edit freely
type Loose = Record<string, any>

const META = { version: '1.0.0', lastModified: '2026-10-01T00:00:00Z' }

let gh: FakeGitHub

function file(profile: ResumeProfile, edit?: (d: Loose) => void): string {
  const doc = JSON.parse(JSON.stringify(toJsonResume(profile, META))) as Loose
  edit?.(doc)
  return serializeProfileJson(doc as JsonDoc)
}

/** A user whose lee profile is the synthetic one, with a repo + token and the given profile.json. */
async function setup(initial?: string): Promise<string> {
  const me = await makeUser()
  await saveResumeProfile(me.id, syntheticProfile())
  await publishQ.saveConfig(me.id, { repo: `${TARGET.owner}/${TARGET.repo}`, branch: 'main', path: TARGET.path })
  await keysQ.upsert(me.id, 'github_portfolio', TOKEN)
  gh = fakeGitHub({ ...TARGET, token: TOKEN, initial })
  vi.stubGlobal('fetch', gh.fetch)
  return me.id
}

const reads = (): number => gh.requests.filter((q) => q.method === 'GET' && q.url.includes('/contents/')).length

beforeEach(() => {
  delete process.env.GITHUB_API_URL
  delete process.env.PORTFOLIO_PULL_THROTTLE_MS
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('pullPortfolio', () => {
  it('applies the portfolio, records the sha, logs counts only and never writes to the repo', async () => {
    const userId = await setup(file(syntheticProfile(), (d) => (d.basics.label = 'Payments Engineer')))
    const info = vi.spyOn(logger, 'info')
    const r = await pullPortfolio(userId, { trigger: 'open', now: NOW })
    expect(r).toMatchObject({ status: 'pulled', sections: 1 })
    expect((await getResumeProfile(userId)).profile.basics.label).toBe('Payments Engineer')
    const state = await publishQ.get(userId)
    expect(state).toMatchObject({ pulledSha: gh.sha(), pullSource: 'github', pullError: null })
    expect(state?.pulledAt?.toISOString()).toBe(NOW.toISOString())
    expect(state?.lastPullDiff).toEqual([expect.objectContaining({ section: 'basics' })])
    expect(gh.puts).toHaveLength(0)
    const logged = JSON.stringify(info.mock.calls.filter(([e]) => e === 'portfolio_pull'))
    expect(logged).toContain('"sections":1')
    expect(logged).not.toContain('Payments')
    expect(logged).not.toContain(TOKEN)
    const status = await loadSyncStatus(userId)
    expect(status).toMatchObject({ locked: true, editUrl: 'https://github.com/example-asha/portfolio/edit/main/profile.json' })
    expect(status.pulledLabel).toMatch(/Oct 9/)
  })

  it('throttles the on-open check to ~10 minutes; an unchanged sha applies nothing', async () => {
    const userId = await setup(file(syntheticProfile()))
    await pullPortfolio(userId, { trigger: 'open', now: NOW })
    const before = reads()
    expect(await pullPortfolio(userId, { trigger: 'open', now: new Date(NOW.getTime() + 5 * MIN) })).toEqual({ status: 'throttled' })
    expect(reads()).toBe(before)
    expect(await pullPortfolio(userId, { trigger: 'open', now: new Date(NOW.getTime() + 11 * MIN) })).toEqual({ status: 'unchanged' })
    expect(reads()).toBe(before + 1)
    // Sync now skips the throttle.
    expect((await pullPortfolio(userId, { trigger: 'manual', now: new Date(NOW.getTime() + 12 * MIN), ignoreThrottle: true, reapply: true })).status).toBe('pulled')
  })

  it('keeps the lee-only overlay (readiness, wordings, private items) when the portfolio changes', async () => {
    const userId = await setup(file(syntheticProfile()))
    await pullPortfolio(userId, { trigger: 'open', now: NOW })
    const { profile } = await getResumeProfile(userId)
    // Overlay edits are allowed while public facts are locked.
    const withOverlay: ResumeProfile = {
      ...profile,
      projects: profile.projects.map((p) => ({ ...p, depth: 'learning' as const, interviewReady: false, domainReady: false, studyNotes: 'Revise.' })),
      work: [
        { ...profile.work[0]!, highlights: profile.work[0]!.highlights.map((h, i) => (i === 0 ? { ...h, alternates: [{ id: 'alt-1', text: 'Idempotent payouts API in Go at 2M+ requests per day', source: 'user' as const }] } : h)) },
        ...profile.work.slice(1),
        { ...profile.work[1]!, id: 'w-hidden', name: 'Hidden Co', highlights: [], visibility: { _item: 'private' } },
      ],
    }
    await saveResumeProfile(userId, withOverlay)
    gh.editByHand(file(syntheticProfile(), (d) => {
      d.basics.summary = 'Edited on GitHub.'
      d.projects[0].description = 'A double-entry ledger library in Go'
    }))
    const r = await pullPortfolio(userId, { trigger: 'open', now: new Date(NOW.getTime() + 11 * MIN) })
    expect(r).toMatchObject({ status: 'pulled', sections: 2 })
    const after = (await getResumeProfile(userId)).profile
    expect(after.basics.summary).toBe('Edited on GitHub.')
    expect(after.projects[0]).toMatchObject({ id: 'pr-ledger', description: 'A double-entry ledger library in Go', depth: 'learning', interviewReady: false, studyNotes: 'Revise.' })
    expect(after.work[0]!.highlights[0]!.alternates).toHaveLength(1)
    expect(after.work.some((w) => w.id === 'w-hidden')).toBe(true)
  })

  it('lists the overlay of items the portfolio removed, and clears it on request', async () => {
    const userId = await setup(file(syntheticProfile()))
    await pullPortfolio(userId, { trigger: 'open', now: NOW })
    const { profile } = await getResumeProfile(userId)
    await saveResumeProfile(userId, { ...profile, projects: profile.projects.map((p) => ({ ...p, depth: 'ai_assisted' as const, interviewReady: false, domainReady: true })) })
    gh.editByHand(file(syntheticProfile(), (d) => (d.projects = [])))
    const r = await pullPortfolio(userId, { trigger: 'daily', now: new Date(NOW.getTime() + 60 * MIN) })
    expect(r).toMatchObject({ status: 'pulled' })
    expect((await getResumeProfile(userId)).profile.projects).toEqual([])
    const { orphans } = await loadSyncStatus(userId)
    expect(orphans.find((o) => o.id === 'pr-ledger')).toMatchObject({ kind: 'project', label: 'Open Ledger', overlay: { depth: 'ai_assisted', domainReady: true } })
    expect(await clearOrphans(userId, 'pr-ledger')).toBe(1)
    expect((await loadSyncStatus(userId)).orphans.some((o) => o.id === 'pr-ledger')).toBe(false)
  })

  it('a missing profile.json applies nothing and leaves lee editable', async () => {
    const userId = await setup()
    expect(await pullPortfolio(userId, { trigger: 'open', now: NOW })).toEqual({ status: 'missing' })
    expect(await canEditPublicFacts(userId)).toBe(true)
    const p = syntheticProfile()
    await expect(saveResumeProfile(userId, { ...p, basics: { ...p.basics, label: 'Still editable' } })).resolves.toBeTruthy()
  })

  it('records a GitHub failure without touching the profile', async () => {
    const userId = await setup(file(syntheticProfile(), (d) => (d.basics.label = 'Never applied')))
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    const r = await pullPortfolio(userId, { trigger: 'open', now: NOW })
    expect(r.status).toBe('error')
    expect((await getResumeProfile(userId)).profile.basics.label).toBe('Backend Engineer')
    expect((await publishQ.get(userId))?.pullError).toBeTruthy()
  })

  it('falls back to <canonical origin>/profile.json, and only that host, without a repository', async () => {
    const me = await makeUser()
    await saveResumeProfile(me.id, syntheticProfile())
    const seen: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        seen.push(url)
        return new Response(file(syntheticProfile(), (d) => (d.basics.label = 'From the site')), { status: 200, headers: { 'content-type': 'application/json' } })
      }),
    )
    const r = await pullPortfolio(me.id, { trigger: 'open', now: NOW })
    expect(r).toMatchObject({ status: 'pulled' })
    expect(seen).toEqual(['https://asha.example.dev/profile.json'])
    expect((await getResumeProfile(me.id)).profile.basics.label).toBe('From the site')
    expect((await publishQ.get(me.id))?.pulledSha).toMatch(/^site:[0-9a-f]{40}$/)
  })

  it('is off with neither a repository nor a canonical URL', async () => {
    const me = await makeUser()
    const p = syntheticProfile()
    await saveResumeProfile(me.id, { ...p, portfolio: { ...p.portfolio, canonical: '' } })
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    expect(await pullPortfolio(me.id, { trigger: 'open', now: NOW })).toEqual({ status: 'off' })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('public facts are read-only once synced (PROFILE_EDIT_IN_LEE off)', () => {
  it('refuses a public-fact change server-side; overlay and private items still save', async () => {
    const userId = await setup(file(syntheticProfile()))
    await pullPortfolio(userId, { trigger: 'open', now: NOW })
    expect(await canEditPublicFacts(userId)).toBe(false)
    const { profile } = await getResumeProfile(userId)
    await expect(saveResumeProfile(userId, { ...profile, basics: { ...profile.basics, label: 'Edited in lee' } })).rejects.toBeInstanceOf(PublicFactsLockedError)
    await expect(saveResumeProfile(userId, { ...profile, work: profile.work.slice(0, 1) })).rejects.toThrow('Your portfolio is the source')
    // Readiness, a private item and a private field are lee's.
    const overlay = {
      ...profile,
      basics: { ...profile.basics, noticePeriod: '2 months' },
      projects: profile.projects.map((p) => ({ ...p, interviewReady: false })),
      certificates: [...profile.certificates, { id: 'c-private', name: 'Internal course', issuer: '', date: '', url: '', visibility: { _item: 'private' as const } }],
    }
    await expect(saveResumeProfile(userId, overlay)).resolves.toBeTruthy()
    expect(gh.puts).toHaveLength(0)
  })
})

describe('daily portfolio sync job', () => {
  it('is planned once a day for users with a repository and pulls when drained', async () => {
    const userId = await setup(file(syntheticProfile(), (d) => (d.basics.label = 'Daily Engineer')))
    // A past day, so the queued job is due now.
    const day = new Date('2026-01-05T09:00:00Z')
    await scheduleDailyJobs(day)
    await scheduleDailyJobs(new Date(day.getTime() + 60 * MIN))
    const jobs = await db.select().from(queueJobs).where(eq(queueJobs.type, JOB_TYPES.portfolioPull))
    expect(jobs.filter((j) => j.userId === userId)).toHaveLength(1)
    await drain({ userId, types: [JOB_TYPES.portfolioPull], budgetMs: 30_000, concurrency: 1 })
    expect((await getResumeProfile(userId)).profile.basics.label).toBe('Daily Engineer')
    expect((await publishQ.get(userId))?.pulledSha).toBe(gh.sha())
  })
})
