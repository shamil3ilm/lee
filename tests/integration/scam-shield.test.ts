import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeUser } from '@/tests/factories'
import { db } from '@/lib/db/client'
import { discoveries as discTable, jobRiskAssessments, scamDomainCache } from '@/lib/db/schema'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import * as profileQ from '@/lib/db/queries/profile'
import * as sourcesQ from '@/lib/db/queries/sources'
import * as discQ from '@/lib/db/queries/discoveries'
import * as jobsQ from '@/lib/db/queries/jobs'
import * as riskQ from '@/lib/db/queries/riskAssessments'
import * as allowQ from '@/lib/db/queries/scamAllowList'
import { promoteJobDiscovery, runDiscoveryCycleForUser } from '@/lib/discovery/service'
import * as adapters from '@/lib/discovery/adapters'
import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from '@/lib/discovery/adapters/types'
import {
  assessDiscovery,
  ensureJobAssessment,
  reassessStaleDiscoveries,
  setUserVerdict,
} from '@/lib/scam/service'
import { RULES_VERSION } from '@/lib/scam/version'

function stubAdapter(items: DiscoveryItem[]): void {
  const fake: DiscoveryAdapter = { kind: 'greenhouse', fetch: async () => items }
  vi.spyOn(adapters, 'getAdapter').mockImplementation((k: string) => (k === 'greenhouse' ? fake : null))
}

function job(id: string, over: Partial<NormalizedJob>): DiscoveryItem {
  return {
    sourceItemId: id,
    raw: { id },
    normalized: {
      kind: 'job',
      title: 'Engineer',
      companyName: 'Acme',
      descriptionMd: 'Build things.',
      applyUrl: `https://boards.greenhouse.io/acme/jobs/${id}`,
      techStack: [],
      raw: {},
      ...over,
    },
  }
}

const legit = job('legit-1', {
  title: 'Senior Backend Engineer',
  companyName: 'Acme',
  companyDomain: 'acme.com',
  descriptionMd: 'Design and run our payments APIs in Go. 5+ years experience. Interviews: recruiter call, system design.',
})

const scam = job('scam-1', {
  title: 'Work From Home Data Entry',
  companyName: 'Brightpath Global',
  companyDomain: 'brightpath-global.com',
  applyUrl: 'https://brightpath-global.com/apply',
  descriptionMd:
    'No experience needed, earn ₹3000 per day from home. Pay a refundable registration fee of Rs. 999. ' +
    'Contact HR on WhatsApp +91 90000 00000. Mail hr@brightpath-global.com',
})

const scamSibling = job('scam-2', {
  title: 'Typist',
  companyName: 'Brightpath Global',
  companyDomain: 'brightpath-global.com',
  applyUrl: 'https://brightpath-global.com/apply2',
  descriptionMd: 'Simple copy-paste work. Pay the joining fee of Rs. 500. Contact on Telegram @bp_hr. Limited slots!',
})

async function setup(items: DiscoveryItem[], opts: { net?: boolean } = {}) {
  const u = await makeUser()
  await profileQ.upsert(u.id, {
    headline: 'BE',
    skills: ['go', 'postgres'],
    industries: ['fintech'],
    scamNetChecks: opts.net ?? false,
  })
  await sourcesQ.create(u.id, { name: 'Acme GH', kind: 'greenhouse', config: { company: 'acme' } })
  stubAdapter(items)
  await runDiscoveryCycleForUser({ userId: u.id, ai: new FixtureAIProvider() })
  const rows = await db.select().from(discTable).where(eq(discTable.userId, u.id))
  const bySourceId = new Map(rows.map((r) => [r.sourceJobId, r]))
  return { userId: u.id, byId: (id: string) => bySourceId.get(id)! }
}

function rdapResponse(date: string): Response {
  return new Response(JSON.stringify({ events: [{ eventAction: 'registration', eventDate: date }] }), {
    status: 200,
  })
}

describe('Scam Shield pipeline', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('assesses every new job discovery on ingest', async () => {
    const { userId, byId } = await setup([legit, scam])
    const legitRow = await riskQ.get(userId, 'discovery', byId('legit-1').id)
    const scamRow = await riskQ.get(userId, 'discovery', byId('scam-1').id)
    expect(legitRow).toMatchObject({ level: 'safe', rulesVersion: RULES_VERSION, userVerdict: null })
    expect(scamRow).toMatchObject({ level: 'likely_scam', rulesVersion: RULES_VERSION })
    expect(scamRow!.score).toBeGreaterThanOrEqual(55)
    const ids = (scamRow!.signals as Array<{ id: string }>).map((s) => s.id)
    expect(ids).toEqual(expect.arrayContaining(['money.upfront_fee', 'channel.messaging_only']))
  })

  it('quarantines likely scams: hidden from the default inbox, listed under the filter, never deleted', async () => {
    const { userId, byId } = await setup([legit, scam])
    const inbox = await discQ.list(userId, { status: 'new' })
    expect(inbox.map((d) => d.sourceJobId)).toEqual(['legit-1'])
    const quarantined = await discQ.list(userId, { quarantine: 'only' })
    expect(quarantined.map((d) => d.sourceJobId)).toEqual(['scam-1'])
    expect(await discQ.countQuarantined(userId)).toBe(1)
    expect(await discQ.countNew(userId)).toBe(1)
    const all = await discQ.list(userId, { quarantine: 'include' })
    expect(all).toHaveLength(2)
    expect(byId('scam-1').status).toBe('new')
  })

  it('does not call the network when checks are off (the default)', async () => {
    const fetchSpy = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchSpy)
    await setup([scam])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('with checks on: looks domains up once, caches them, and a young domain adds risk', async () => {
    const fetchSpy = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.startsWith('https://rdap.org/')) return rdapResponse(new Date(Date.now() - 10 * 86_400_000).toISOString())
      return new Response(JSON.stringify({ Status: 0, Answer: [{ type: 15, data: '10 mx.brightpath-global.com.' }] }))
    })
    vi.stubGlobal('fetch', fetchSpy)
    const { userId, byId } = await setup([legit, scam], { net: true })
    const row = await riskQ.get(userId, 'discovery', byId('scam-1').id)
    expect((row!.signals as Array<{ id: string }>).map((s) => s.id)).toContain('sender.young_domain')
    const cached = await db.select().from(scamDomainCache)
    expect(cached.map((c) => c.domain).sort()).toEqual(['acme.com', 'brightpath-global.com'])
    const brightpath = cached.find((c) => c.domain === 'brightpath-global.com')!
    expect(brightpath).toMatchObject({ ageStatus: 'ok', mxStatus: 'ok', hasMx: true })
    const calls = fetchSpy.mock.calls.length

    // A second assessment of the same domain is served from the cache.
    await assessDiscovery(userId, byId('scam-1').id, { net: 'fetch' })
    expect(fetchSpy.mock.calls.length).toBe(calls)
  })

  it('network failures never block ingest or raise risk', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')))
    const { userId, byId } = await setup([legit], { net: true })
    const row = await riskQ.get(userId, 'discovery', byId('legit-1').id)
    expect(row).toMatchObject({ level: 'safe', score: 0 })
    const [cached] = await db.select().from(scamDomainCache)
    expect(cached).toMatchObject({ domain: 'acme.com', ageStatus: 'error' })
  })

  it('"Not a scam" un-quarantines, remembers the domain/company, and frees siblings', async () => {
    const { userId, byId } = await setup([legit, scam, scamSibling])
    expect(await discQ.countQuarantined(userId)).toBe(2)

    const row = await setUserVerdict(userId, 'discovery', byId('scam-1').id, 'not_scam')
    expect(row.userVerdict).toBe('not_scam')
    expect(row.level).toBe('likely_scam') // the rule level itself is never lowered

    const allow = await allowQ.list(userId)
    expect(allow.map((a) => `${a.kind}:${a.value}`).sort()).toEqual([
      'company:brightpath global',
      'domain:brightpath-global.com',
    ])
    expect(await discQ.countQuarantined(userId)).toBe(0)
    const sibling = await riskQ.get(userId, 'discovery', byId('scam-2').id)
    expect(sibling).toMatchObject({ allowListed: true, userVerdict: null, level: 'likely_scam' })

    // New postings from the allow-listed domain arrive already un-quarantined.
    const next = job('scam-3', { ...(scam.normalized as NormalizedJob) })
    stubAdapter([next])
    await runDiscoveryCycleForUser({ userId, ai: new FixtureAIProvider() })
    const [third] = await db.select().from(discTable).where(eq(discTable.sourceJobId, 'scam-3'))
    expect((await riskQ.get(userId, 'discovery', third!.id))?.allowListed).toBe(true)
  })

  it('"Confirmed scam" keeps an item quarantined even at caution level', async () => {
    const caution = job('caution-1', {
      companyName: 'Acme',
      descriptionMd: 'Urgent hiring! Contact HR on WhatsApp for details.',
    })
    const { userId, byId } = await setup([caution])
    const before = await riskQ.get(userId, 'discovery', byId('caution-1').id)
    expect(before?.level).toBe('caution')
    expect(await discQ.countQuarantined(userId)).toBe(0)
    await setUserVerdict(userId, 'discovery', byId('caution-1').id, 'confirmed_scam')
    expect(await discQ.countQuarantined(userId)).toBe(1)
    expect(await allowQ.list(userId)).toEqual([])
  })

  it('verdicts are scoped to the owner', async () => {
    const { byId } = await setup([scam])
    const other = await makeUser()
    await expect(setUserVerdict(other.id, 'discovery', byId('scam-1').id, 'not_scam')).rejects.toThrow(
      'assessment not found',
    )
  })

  it('re-assesses rows written by an older rules version (and pre-Scam-Shield rows)', async () => {
    const { userId, byId } = await setup([legit, scam])
    const scamId = byId('scam-1').id
    await db
      .update(jobRiskAssessments)
      .set({ rulesVersion: 'scam-0.0.1', level: 'safe', score: 0 })
      .where(eq(jobRiskAssessments.targetId, scamId))
    await db.delete(jobRiskAssessments).where(eq(jobRiskAssessments.targetId, byId('legit-1').id))

    expect(await reassessStaleDiscoveries(userId)).toBe(2)
    expect(await riskQ.get(userId, 'discovery', scamId)).toMatchObject({
      rulesVersion: RULES_VERSION,
      level: 'likely_scam',
    })
    expect(await riskQ.get(userId, 'discovery', byId('legit-1').id)).not.toBeNull()
    expect(await reassessStaleDiscoveries(userId)).toBe(0)
  })

  it('keeps the user verdict across re-assessment', async () => {
    const { userId, byId } = await setup([scam])
    await setUserVerdict(userId, 'discovery', byId('scam-1').id, 'confirmed_scam')
    await assessDiscovery(userId, byId('scam-1').id)
    expect((await riskQ.get(userId, 'discovery', byId('scam-1').id))?.userVerdict).toBe('confirmed_scam')
  })

  it('assesses the job created by promoting a discovery, and re-assesses after the job changes', async () => {
    const { userId, byId } = await setup([legit])
    const { application } = await promoteJobDiscovery({ userId, discoveryId: byId('legit-1').id })
    const first = await riskQ.get(userId, 'job', application.jobId)
    expect(first).toMatchObject({ level: 'safe', rulesVersion: RULES_VERSION })

    expect((await ensureJobAssessment(userId, application.jobId))?.id).toBe(first!.id)

    await jobsQ.update(userId, application.jobId, {
      descriptionMd: 'Pay a security deposit of Rs. 5000. Send your Aadhaar card on WhatsApp. No interview required.',
    })
    const after = await ensureJobAssessment(userId, application.jobId)
    expect(after?.level).toBe('likely_scam')
  })
})
