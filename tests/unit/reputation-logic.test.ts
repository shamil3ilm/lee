import { describe, expect, it } from 'vitest'
import { mergeSignals, SIGNAL_CAPS } from '@/lib/reputation/merge'
import { companyStructureCriterion, environmentCriterion, reputationCriteria } from '@/lib/reputation/criteria'
import { sanitizeDraft, buildSummaryInput } from '@/lib/reputation/summary'
import { reputationDeepLinks } from '@/lib/reputation/deep-links'
import { isoWeek } from '@/lib/reputation/schedule'
import { buildReputationLookup, scamFlagsOf } from '@/lib/reputation/scam-link'
import { assessScam } from '@/lib/scam/engine'
import { toPlaceRating } from '@/lib/reputation/places'
import { buildReputationView } from '@/lib/reputation/view'
import type { ConfirmedSummary, ReputationSignal, UserRating } from '@/lib/reputation/types'
import type { ReputationRecord } from '@/lib/db/queries/companyReputation'

const NOW = new Date('2026-09-27T00:00:00Z')

function sig(over: Partial<ReputationSignal>): ReputationSignal {
  return {
    id: 'x',
    source: 'gdelt',
    kind: 'news',
    title: 'Acme news',
    url: 'https://n.example/a',
    date: '2026-09-01',
    category: 'other',
    value: null,
    ...over,
  }
}

const summary = (over: Partial<ConfirmedSummary> = {}): ConfirmedSummary => ({
  pros: [],
  cons: [],
  redFlags: [],
  gccNote: '',
  confirmedAt: NOW.toISOString(),
  ...over,
})

describe('mergeSignals', () => {
  it('keeps a failed source’s stored items and unions answered sources, newest first', () => {
    const existing = [
      sig({ id: 'g-old', date: '2026-05-01' }),
      sig({ id: 'h-old', source: 'hn', kind: 'hn_mention', date: '2026-04-01' }),
    ]
    const merged = mergeSignals(existing, { gdelt: [sig({ id: 'g-new', date: '2026-09-10' })] }, NOW)
    expect(merged.map((s) => s.id)).toEqual(['h-old', 'g-new', 'g-old'])
  })

  it('prefers the fresh copy of a duplicate id and drops items older than two years', () => {
    const existing = [sig({ id: 'a', title: 'old title' }), sig({ id: 'ancient', date: '2023-01-01' })]
    const merged = mergeSignals(existing, { gdelt: [sig({ id: 'a', title: 'new title' })] }, NOW)
    expect(merged).toHaveLength(1)
    expect(merged[0]?.title).toBe('new title')
  })

  it('caps each source', () => {
    const many = Array.from({ length: 40 }, (_, i) => sig({ id: `g${i}`, date: `2026-08-${String((i % 28) + 1).padStart(2, '0')}` }))
    expect(mergeSignals([], { gdelt: many }, NOW)).toHaveLength(SIGNAL_CAPS.gdelt)
  })
})

describe('criteria', () => {
  const rating = (site: UserRating['site'], r: number): UserRating => ({ site, rating: r, summary: '', url: null, recordedAt: NOW.toISOString() })

  it('is Unknown (null, zero confidence) with no confirmed input', () => {
    const [env, structure] = reputationCriteria({ ratings: [], summary: null, facts: null }, NOW)
    expect(env).toMatchObject({ criterion: 'environment', score: null, confidence: 0 })
    expect(structure).toMatchObject({ criterion: 'company_structure', score: null, confidence: 0 })
  })

  it('environment: ratings set the base; confirmed flags and cons subtract, explained line by line', () => {
    const env = environmentCriterion({
      ratings: [rating('glassdoor', 3), rating('ambitionbox', 4)],
      summary: summary({
        cons: [{ text: 'Long hours', cites: ['user:glassdoor'] }],
        redFlags: [
          { category: 'toxic_culture', text: 'Blame culture', cites: ['user:glassdoor'], gccRelevance: '' },
          { category: 'toxic_culture', text: 'Shouting', cites: ['user:ambitionbox'], gccRelevance: '' },
        ],
      }),
      facts: null,
    })
    // avg 3.5 → base 63; −4 (1 con) −15 (toxic culture, once)
    expect(env.base).toBe(63)
    expect(env.score).toBe(44)
    expect(env.evidence.map((e) => e.effect)).toEqual([0, 0, -4, -15])
    expect(env.confidence).toBe(0.8)
  })

  it('company structure: Wikidata age and size add; fraud and wage theft subtract', () => {
    const facts = {
      wikidataId: 'Q1', label: 'Acme', description: null, founded: '2001', headquarters: null,
      industry: null, employees: 1450, website: null, wikipediaUrl: null,
    }
    const calm = companyStructureCriterion({ ratings: [], summary: null, facts }, NOW)
    expect(calm.score).toBe(75) // 50 + 15 (25 years) + 10 (1,450 people)
    const flagged = companyStructureCriterion(
      {
        ratings: [],
        facts,
        summary: summary({
          redFlags: [
            { category: 'fraud', text: 'Reported fraud', cites: ['g1'], gccRelevance: '' },
            { category: 'unpaid_salaries', text: 'Salaries unpaid', cites: ['g2'], gccRelevance: '' },
          ],
        }),
      },
      NOW,
    )
    expect(flagged.score).toBe(25)
    expect(flagged.evidence.at(-1)).toMatchObject({ label: 'Red flag you confirmed: Unpaid salaries / wage theft', effect: -20 })
  })
})

describe('sanitizeDraft', () => {
  it('drops claims that cite nothing known and strips unknown cites', () => {
    const draft = sanitizeDraft(
      {
        pros: [{ text: 'Raised funding', cites: ['g1', 'made-up'] }, { text: 'Invented', cites: ['nope'] }],
        cons: [{ text: '   ', cites: ['g1'] }],
        red_flags: [{ category: 'fraud', text: 'Fraud reported', cites: ['g2'], gcc_relevance: ' Visa tied to employer ' }],
        gcc_note: ' note ',
      },
      new Set(['g1', 'g2']),
    )
    expect(draft).toEqual({
      pros: [{ text: 'Raised funding', cites: ['g1'] }],
      cons: [],
      redFlags: [{ category: 'fraud', text: 'Fraud reported', cites: ['g2'], gccRelevance: 'Visa tied to employer' }],
      gccNote: 'note',
    })
  })

  it('buildSummaryInput exposes signals and the user’s ratings as citable items', () => {
    const record: ReputationRecord = {
      companyId: 'c', signals: [sig({ id: 'g1', category: 'layoffs' })], sourceStatus: {}, facts: null,
      userRatings: [{ site: 'glassdoor', rating: 2.5, summary: 'Salary delays', url: null, recordedAt: NOW.toISOString() }],
      summary: null, placesPlaceId: null, fetchedAt: null,
    }
    const input = buildSummaryInput('Acme', record)
    expect(input.signals.map((s) => s.id)).toEqual(['g1', 'user:glassdoor'])
    expect(input.signals[1]?.title).toBe('2.5/5 — Salary delays')
  })
})

describe('Scam Shield reputation boost', () => {
  const posting = {
    title: 'Backend Engineer',
    company: 'Acme Payments',
    description: 'Build our payment APIs in Go. Interviews: recruiter call, system design.',
    applyUrl: 'https://acmepay.com/careers/1',
    companyDomain: 'acmepay.com',
  }

  it('adds explainable reputation signals only for confirmed fraud / wage theft', () => {
    const base = assessScam(posting)
    const lookup = buildReputationLookup([
      {
        companyId: 'c', name: 'Acme Payments LLC', domain: 'acmepay.com',
        record: {
          companyId: 'c', signals: [], sourceStatus: {}, facts: null, userRatings: [], placesPlaceId: null, fetchedAt: null,
          summary: summary({
            redFlags: [
              { category: 'fraud', text: 'Founder charged with fraud (Reuters)', cites: ['g1'], gccRelevance: '' },
              { category: 'unpaid_salaries', text: 'Salaries unpaid for 3 months', cites: ['g2'], gccRelevance: '' },
              { category: 'layoffs', text: 'Layoffs', cites: ['g3'], gccRelevance: '' },
            ],
          }),
        },
      },
    ])
    const boosted = assessScam(posting, null, lookup(posting))
    const ids = boosted.signals.filter((s) => s.group === 'reputation').map((s) => s.id)
    expect(ids).toEqual(['reputation.fraud_reports', 'reputation.wage_theft_reports'])
    expect(boosted.score).toBe(base.score + 50)
    expect(boosted.level).not.toBe('safe')
    const fraud = boosted.signals.find((s) => s.id === 'reputation.fraud_reports')
    expect(fraud?.label).toContain('Founder charged with fraud')
    expect(fraud?.evidence).toEqual([{ field: 'company', start: 0, text: 'Acme Payments' }])
  })

  it('matches by domain, and never fires for other companies or without flags', () => {
    const record = {
      companyId: 'c', signals: [], sourceStatus: {}, facts: null, userRatings: [], placesPlaceId: null, fetchedAt: null,
      summary: summary({ redFlags: [{ category: 'fraud' as const, text: 'x', cites: ['g'], gccRelevance: '' }] }),
    }
    const lookup = buildReputationLookup([{ companyId: 'c', name: 'Different Name', domain: 'acmepay.com', record }])
    expect(lookup(posting)?.flags).toHaveLength(1)
    expect(lookup({ ...posting, company: 'Globex', companyDomain: 'globex.com' })).toBeNull()
    expect(scamFlagsOf(summary({ redFlags: [{ category: 'toxic_culture', text: 't', cites: ['g'], gccRelevance: '' }] }))).toEqual([])
  })
})

describe('buildReputationView', () => {
  it('formats US dates, marks alarming news, lists citations and the Places budget left', () => {
    const view = buildReputationView({
      companyId: 'c',
      companyName: 'Acme',
      record: {
        companyId: 'c',
        signals: [sig({ id: 'g1', category: 'wage_theft', date: '2026-09-10' }), sig({ id: 'g2', category: 'funding' })],
        sourceStatus: { gdelt: { ok: false, at: '2026-09-27T09:00:00.000Z', count: 0, error: 'gdelt: HTTP 503' } },
        facts: null,
        userRatings: [{ site: 'glassdoor', rating: 3, summary: '', url: null, recordedAt: NOW.toISOString() }],
        summary: null,
        placesPlaceId: null,
        fetchedAt: NOW,
      },
      settings: { placesEnabled: true, placesMonthlyCap: 100, placesMonth: '2026-09', placesCalls: 40 },
      placesHardCap: 900,
      now: NOW,
    })
    expect(view.signals[0]).toMatchObject({ dateLabel: 'Sep 10, 2026', alarming: true })
    expect(view.signals[1]?.alarming).toBe(false)
    expect(view.statuses.map((s) => s.state)).toEqual(['never', 'error', 'never'])
    expect(view.citations['user:glassdoor']).toBe('Your glassdoor notes (3/5)')
    expect(view.places).toEqual({ enabled: true, capLeft: 60 })
    expect(view.criteria[0]?.score).toBe(50)
  })
})

describe('deep links and helpers', () => {
  it('builds review-site, community and GCC registry links without fetching anything', () => {
    const groups = reputationDeepLinks('Acme & Sons')
    expect(groups.map((g) => g.id)).toEqual(['reviews', 'community', 'gcc'])
    const glassdoor = groups[0]?.links.find((l) => l.id === 'glassdoor')
    expect(glassdoor?.url).toBe('https://www.glassdoor.com/Search/results.htm?keyword=Acme%20%26%20Sons')
    expect(groups.flatMap((g) => g.links).every((l) => l.url.startsWith('https://'))).toBe(true)
  })

  it('isoWeek follows ISO-8601', () => {
    expect(isoWeek(new Date('2026-09-27T12:00:00Z'))).toBe('2026-W39')
    expect(isoWeek(new Date('2027-01-01T00:00:00Z'))).toBe('2026-W53')
  })

  it('toPlaceRating keeps attribution and caps reviews', () => {
    const place = toPlaceRating({
      displayName: { text: 'Acme' },
      rating: 3.9,
      userRatingCount: 120,
      googleMapsUri: 'https://maps.google.com/?cid=1',
      reviews: Array.from({ length: 7 }, (_, i) => ({
        rating: 4,
        text: { text: `r${i}` },
        relativePublishTimeDescription: 'a month ago',
        authorAttribution: { displayName: `A${i}`, uri: 'https://maps.google.com/u' },
      })),
    })
    expect(place).toMatchObject({ name: 'Acme', rating: 3.9, count: 120 })
    expect(place.reviews).toHaveLength(5)
    expect(place.reviews[0]).toMatchObject({ author: 'A0', text: 'r0', relativeTime: 'a month ago' })
  })
})
