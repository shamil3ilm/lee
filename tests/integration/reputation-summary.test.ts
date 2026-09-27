import { afterEach, describe, expect, it, vi } from 'vitest'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import { withAiUsage } from '@/lib/ai/usage'
import * as repQ from '@/lib/db/queries/companyReputation'
import * as riskQ from '@/lib/db/queries/riskAssessments'
import * as settingsQ from '@/lib/db/queries/reputationSettings'
import { refreshCompanyReputation } from '@/lib/reputation/refresh'
import { NO_WAIT } from '@/lib/reputation/rate-limit'
import { clearSummary, confirmSummary, draftSummary } from '@/lib/reputation/summary'
import { saveRating, removeRating } from '@/lib/reputation/ratings'
import { reputationCriteria } from '@/lib/reputation/criteria'
import { ReputationError } from '@/lib/reputation/errors'
import { checkGoogleRating, PLACES_HARD_MONTHLY_CAP } from '@/lib/reputation/places'
import { assessJob } from '@/lib/scam/service'
import { allSourceRoutes, fixtureFetch } from '@/tests/fixtures/reputation/fetch'
import { makeCompany, makeJob, makeUser } from '@/tests/factories'

const NOW = new Date('2026-09-27T09:00:00Z')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

async function seeded() {
  const u = await makeUser()
  const c = await makeCompany(u.id, { name: 'Acme Payments', domain: 'acmepay.com', isWatched: true })
  await refreshCompanyReputation(u.id, c.id, { fetchImpl: fixtureFetch(allSourceRoutes()), limiter: NO_WAIT, now: NOW })
  const rec = await repQ.get(u.id, c.id)
  const byCategory = (cat: string) => rec?.signals.find((s) => s.category === cat)?.id as string
  return { u, c, wage: byCategory('wage_theft'), layoffs: byCategory('layoffs'), funding: byCategory('funding') }
}

describe('AI summary draft', () => {
  it('drafts on demand through the AI client, citing only real signals, and saves nothing', async () => {
    const { u, c, wage } = await seeded()
    const ai = new FixtureAIProvider({
      summarizeReputation: (input) => ({
        pros: [{ text: 'Well funded', cites: [input.signals.find((s) => s.category === 'funding')!.id] }],
        cons: [{ text: 'Invented claim', cites: ['not-a-signal'] }],
        red_flags: [
          { category: 'unpaid_salaries', text: 'Salary delays reported in Dubai', cites: [wage], gcc_relevance: 'WPS delays' },
        ],
        gcc_note: 'Check WPS compliance.',
      }),
    })
    const spy = vi.spyOn(ai, 'summarizeReputation')
    const { result: draft } = await withAiUsage({ userId: u.id }, () => draftSummary(u.id, c.id, ai))
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ companyName: 'Acme Payments' }),
      expect.objectContaining({ userId: u.id, kind: 'company_reputation_summary' }),
    )
    expect(draft.cons).toEqual([])
    expect(draft.redFlags).toEqual([
      { category: 'unpaid_salaries', text: 'Salary delays reported in Dubai', cites: [wage], gccRelevance: 'WPS delays' },
    ])
    expect((await repQ.get(u.id, c.id))?.summary).toBeNull()
  })

  it('refuses to draft with nothing to cite', async () => {
    const u = await makeUser()
    const c = await makeCompany(u.id)
    await expect(draftSummary(u.id, c.id, new FixtureAIProvider())).rejects.toBeInstanceOf(ReputationError)
  })
})

describe('confirming a summary feeds scoring and Scam Shield', () => {
  it('rejects a claim without a valid source', async () => {
    const { u, c } = await seeded()
    await expect(
      confirmSummary(u.id, c.id, { pros: [{ text: 'Made up', cites: [] }], cons: [], redFlags: [], gccNote: '' }),
    ).rejects.toThrow('Every claim needs a source')
    await expect(
      confirmSummary(u.id, c.id, { pros: [{ text: 'Made up', cites: ['ghost'] }], cons: [], redFlags: [], gccNote: '' }),
    ).rejects.toThrow('Every claim needs a source')
  })

  it('a confirmed wage-theft flag raises the company’s postings in Scam Shield; clearing it lowers them', async () => {
    const { u, c, wage, layoffs } = await seeded()
    const job = await makeJob(u.id, c.id, {
      title: 'Backend Engineer',
      sourceUrl: 'https://acmepay.com/careers/1',
      descriptionMd: 'Build payment APIs in Go. Interviews: recruiter call, system design.',
    })
    const before = await assessJob(u.id, job.id)
    expect(before?.signals).toEqual([])

    await confirmSummary(
      u.id,
      c.id,
      {
        pros: [],
        cons: [],
        redFlags: [
          { category: 'unpaid_salaries', text: 'Salaries reported unpaid for 3 months', cites: [wage], gccRelevance: '' },
          { category: 'layoffs', text: '12% laid off', cites: [layoffs], gccRelevance: '' },
        ],
        gccNote: '',
      },
      NOW,
    )
    const after = await riskQ.get(u.id, 'job', job.id)
    const signals = after?.signals as Array<{ id: string; weight: number; label: string }>
    expect(signals.map((s) => s.id)).toEqual(['reputation.wage_theft_reports'])
    expect(after?.score).toBe((before?.score ?? 0) + 20)
    expect(signals[0]?.label).toContain('Salaries reported unpaid for 3 months')

    await clearSummary(u.id, c.id)
    expect((await riskQ.get(u.id, 'job', job.id))?.signals).toEqual([])
  })

  it('confirmed data moves the environment and company-structure criteria, with evidence', async () => {
    const { u, c, wage } = await seeded()
    const unknown = reputationCriteria({ ratings: [], summary: null, facts: null }, NOW)
    expect(unknown.map((x) => x.score)).toEqual([null, null])

    await saveRating(u.id, c.id, { site: 'glassdoor', rating: 2.5, summary: 'Salary delays mentioned often' }, NOW)
    await confirmSummary(
      u.id,
      c.id,
      {
        pros: [],
        cons: [{ text: 'Long hours', cites: ['user:glassdoor'] }],
        redFlags: [{ category: 'unpaid_salaries', text: 'Unpaid salaries reported', cites: [wage], gccRelevance: '' }],
        gccNote: '',
      },
      NOW,
    )
    const rec = await repQ.get(u.id, c.id)
    const [env, structure] = reputationCriteria(
      { ratings: rec?.userRatings ?? [], summary: rec?.summary ?? null, facts: rec?.facts ?? null },
      NOW,
    )
    // base (2.5−1)/4 → 38; −4 con, −20 unpaid salaries
    expect(env).toMatchObject({ score: 14, base: 38 })
    expect(env?.evidence.map((e) => e.label)).toEqual([
      'Your glassdoor rating: 2.5/5',
      '1 confirmed con(s)',
      'Red flag you confirmed: Unpaid salaries / wage theft',
    ])
    // 50 + 10 (founded 2011, 15 y) + 10 (1,450 people) − 20
    expect(structure?.score).toBe(50)
    expect(structure?.confidence).toBe(0.8)
  })

  it('ratings: one per site, replaced on save, removable', async () => {
    const { u, c } = await seeded()
    await saveRating(u.id, c.id, { site: 'glassdoor', rating: 3, summary: '' }, NOW)
    const next = await saveRating(u.id, c.id, { site: 'glassdoor', rating: 4.25, summary: 'Better', url: 'https://www.glassdoor.com/x' }, NOW)
    expect(next).toEqual([
      { site: 'glassdoor', rating: 4.3, summary: 'Better', url: 'https://www.glassdoor.com/x', recordedAt: NOW.toISOString() },
    ])
    await expect(saveRating(u.id, c.id, { site: 'glassdoor', rating: 9 })).rejects.toThrow('Rating is 1–5.')
    await expect(saveRating(u.id, c.id, { site: 'glassdoor', rating: 3, url: 'javascript:alert(1)' })).rejects.toThrow()
    expect(await removeRating(u.id, c.id, 'glassdoor')).toEqual([])
  })
})

describe('Google Places (optional)', () => {
  function placesFetch() {
    return fixtureFetch([
      { match: (u) => u.pathname.endsWith('places:searchText'), body: { places: [{ id: 'ChIJacme' }] } },
      {
        match: (u) => u.pathname.endsWith('/places/ChIJacme'),
        body: { displayName: { text: 'Acme Payments' }, rating: 3.7, userRatingCount: 41, reviews: [] },
      },
    ])
  }

  it('is off by default and sends nothing', async () => {
    const u = await makeUser()
    const c = await makeCompany(u.id)
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-key')
    const f = placesFetch()
    await expect(checkGoogleRating(u.id, c.id, { fetchImpl: f, limiter: NO_WAIT })).resolves.toMatchObject({
      ok: false,
      reason: 'disabled',
    })
    expect(f.calls).toHaveLength(0)
  })

  it('stores only the place id and stops at the monthly cap', async () => {
    const u = await makeUser()
    const c = await makeCompany(u.id, { name: 'Acme Payments' })
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-key')
    await settingsQ.savePlaces(u.id, { placesEnabled: true, placesMonthlyCap: 3 })
    const f = placesFetch()
    const first = await checkGoogleRating(u.id, c.id, { fetchImpl: f, limiter: NO_WAIT, now: NOW })
    expect(first).toMatchObject({ ok: true, callsUsed: 2, place: { rating: 3.7, count: 41 } })
    const rec = await repQ.get(u.id, c.id)
    expect(rec?.placesPlaceId).toBe('ChIJacme')
    expect(JSON.stringify(rec)).not.toContain('3.7')

    // Place id cached → one call; then the budget (3) is spent.
    expect(await checkGoogleRating(u.id, c.id, { fetchImpl: f, limiter: NO_WAIT, now: NOW })).toMatchObject({ ok: true, callsUsed: 3 })
    expect(await checkGoogleRating(u.id, c.id, { fetchImpl: f, limiter: NO_WAIT, now: NOW })).toMatchObject({
      ok: false,
      reason: 'cap_reached',
    })
    expect(f.calls).toHaveLength(3)

    // A new month starts from zero.
    const next = await checkGoogleRating(u.id, c.id, { fetchImpl: f, limiter: NO_WAIT, now: new Date('2026-10-01T00:00:00Z') })
    expect(next).toMatchObject({ ok: true, callsUsed: 1 })
  })

  it('never exceeds the hard cap whatever the user sets', async () => {
    const u = await makeUser()
    await settingsQ.savePlaces(u.id, { placesEnabled: true, placesMonthlyCap: 100_000 })
    const month = '2026-09'
    await settingsQ.savePlaces(u.id, {})
    for (let i = 0; i < 3; i++) await settingsQ.reservePlacesCall(u.id, month, PLACES_HARD_MONTHLY_CAP)
    // Jump the counter to the hard cap and try once more.
    const { db } = await import('@/lib/db/client')
    const { reputationSettings } = await import('@/lib/db/schema')
    await db.update(reputationSettings).set({ placesCalls: PLACES_HARD_MONTHLY_CAP })
    expect(await settingsQ.reservePlacesCall(u.id, month, PLACES_HARD_MONTHLY_CAP)).toBeNull()
  })
})
