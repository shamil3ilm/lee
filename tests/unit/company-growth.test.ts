import { describe, expect, it } from 'vitest'
import { engineeringSignal, headcountSignal, hiringSignal, momentumSignal, newsSignal, stageSignal, batchYear, relChange } from '@/lib/company-discovery/growth/signals'
import { tailwindSignal } from '@/lib/company-discovery/growth/tailwind'
import { combineGrowth, growthChipText, growthFitNudge, growthFitPoints } from '@/lib/company-discovery/growth/combine'
import { companyGrowth, parseSnapshots, withSnapshot, type GrowthCompany } from '@/lib/company-discovery/growth/score'
import { underTheRadar } from '@/lib/company-discovery/growth/visibility'
import { growthForPosting, growthIndex } from '@/lib/company-discovery/growth/postings'
import { commitWindows, headcountQuery, parseHeadcounts, summarizeRepos } from '@/lib/company-discovery/growth/fetch'
import { GROWTH_WEIGHTS, type GrowthSignal } from '@/lib/company-discovery/growth/types'
import { companyFit, type FitContext } from '@/lib/company-discovery/fit'

/** Synthetic companies only; dates relative to NOW. */
const NOW = new Date('2026-10-09T09:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10)

describe('hiring velocity', () => {
  it('3 → 8 open roles is strong growth relative to the company itself', () => {
    const s = hiringSignal({ snapshots: [{ d: daysAgo(91), n: 3 }, { d: daysAgo(30), n: 5 }, { d: daysAgo(1), n: 8 }], boardLabel: 'Lever' }, NOW)
    expect(s.score).toBeGreaterThanOrEqual(90)
    expect(s.confidence).toBe('high')
    expect(s.detail).toBe('8 open roles now; 5 about 30 days ago, 3 about 90 days ago')
    expect(s.source).toBe('Lever job board, weekly counts')
  })

  it('a big company adding 10 roles to 300 is about flat; shrinking scores low', () => {
    expect(hiringSignal({ snapshots: [{ d: daysAgo(90), n: 300 }, { d: daysAgo(0), n: 310 }] }, NOW).score).toBeLessThan(56)
    expect(hiringSignal({ snapshots: [{ d: daysAgo(30), n: 10 }, { d: daysAgo(2), n: 3 }] }, NOW).score).toBeLessThan(25)
  })

  it('falls back to postings first seen, and is unknown with one count or none', () => {
    const p = hiringSignal({ snapshots: [], jobsRecent30: 4, jobsPrior60: 2 }, NOW)
    expect(p.score).toBeGreaterThan(70)
    expect(p.source).toMatch(/Postings lee collected/)
    expect(hiringSignal({ snapshots: [{ d: daysAgo(1), n: 4 }] }, NOW).score).toBeNull()
    expect(hiringSignal({ snapshots: [] }, NOW).score).toBeNull()
    // A stale latest count is not "now".
    expect(hiringSignal({ snapshots: [{ d: daysAgo(120), n: 1 }, { d: daysAgo(40), n: 9 }] }, NOW).score).toBeNull()
  })

  it('snapshots: one per week, 26 weeks kept, lenient parse', () => {
    const at = (n: number) => new Date(`${daysAgo(n)}T09:00:00Z`)
    let snaps = withSnapshot([], 3, at(200))
    snaps = withSnapshot(snaps, 4, at(14))
    // A second count within the week replaces the first.
    snaps = withSnapshot(snaps, 5, at(10))
    snaps = withSnapshot(snaps, 6, at(3))
    snaps = withSnapshot(snaps, 7, NOW)
    // The 200-day-old count fell out of the 26-week window.
    expect(snaps).toEqual([{ d: daysAgo(10), n: 5 }, { d: daysAgo(0), n: 7 }])
    expect(parseSnapshots([{ d: '2026-01-01', n: 2 }, { d: 'x', n: 1 }, null])).toEqual([{ d: '2026-01-01', n: 2 }])
  })
})

describe('news, headcount, engineering, momentum, stage, tailwind', () => {
  it('news: each kind of event counts once (press volume never adds), negatives subtract, none is unknown', () => {
    const funding = { c: 'funding', d: daysAgo(40), u: 'https://news.example/a', t: 'Acme raises $5M seed' }
    const one = newsSignal([funding], NOW)
    const many = newsSignal([funding, { ...funding, u: 'https://news.example/b' }, { ...funding, u: 'https://news.example/c' }], NOW)
    expect(one.score).toBe(75)
    expect(many.score).toBe(one.score)
    expect(newsSignal([{ c: 'layoffs', d: daysAgo(10), u: 'u', t: 'Acme lays off staff' }], NOW).score).toBe(20)
    expect(newsSignal([{ ...funding, d: daysAgo(400) }], NOW).score).toBeNull()
    expect(newsSignal([], NOW).score).toBeNull()
  })

  it('headcount: dated counts give a yearly rate; a size band alone is context, unknown', () => {
    const s = headcountSignal([{ y: 2023, n: 40 }, { y: 2025, n: 90 }], '51-200', NOW)
    expect(s.score).toBeGreaterThan(85)
    expect(s.confidence).toBe('high')
    const band = headcountSignal([], '51-200', NOW)
    expect(band).toMatchObject({ score: null, source: 'Stated size band' })
  })

  it('engineering: commits vs the company’s own past; stars are never scored', () => {
    const base = { at: daysAgo(1), c90: 120, cp90: 40, nr90: 2, nrp90: 0, stars: 3 }
    const rising = engineeringSignal(base, 'acme-example')
    expect(rising.score).toBeGreaterThan(85)
    expect(engineeringSignal({ ...base, stars: 50_000 }, 'acme-example').score).toBe(rising.score)
    expect(engineeringSignal({ ...base, c90: 10, cp90: 60, nr90: 0 }, 'x').score).toBeLessThan(25)
    expect(engineeringSignal(undefined, undefined).score).toBeNull()
  })

  it('momentum: launches and the HN mention trend (not the count)', () => {
    expect(momentumSignal({ launches: [{ d: daysAgo(20), u: 'https://acme.example/blog', t: 'Acme Studio 2.0' }] }, NOW).score).toBe(62)
    const big = momentumSignal({ launches: [], hn: { at: daysAgo(1), r: 10, p: 10 } }, NOW)
    expect(big.score).toBe(50)
    expect(momentumSignal({ launches: [], hn: { at: daysAgo(1), r: 1, p: 0 } }, NOW).score).toBeNull()
  })

  it('stage: young + funded + any accelerator (no YC premium); unknown without a year or cohort', () => {
    expect(batchYear('W24')).toBe(2024)
    expect(batchYear('Summer 2023')).toBe(2023)
    const yc = stageSignal({ founded: 2023, ycBatch: 'W24', sourceTags: [], funded: true }, NOW)
    const f6 = stageSignal({ founded: 2023, sourceTags: ['directory:flat6labs'], funded: true }, NOW)
    expect(yc.score).toBe(f6.score)
    expect(yc.score).toBeGreaterThanOrEqual(85)
    expect(stageSignal({ founded: 1980, sourceTags: [], funded: false }, NOW).score).toBe(45)
    expect(stageSignal({ sourceTags: [], funded: false }, NOW).score).toBeNull()
    // A park or accelerator listing alone (no year) says nothing about growth.
    expect(stageSignal({ sourceTags: ['directory:qstp'], funded: false }, NOW).score).toBeNull()
    expect(stageSignal({ sourceTags: ['directory:flat6labs'], funded: false }, NOW).score).toBeNull()
  })

  it('tailwind: ZATCA e-invoicing in Saudi, GCC fintech; none for an unknown sector', () => {
    expect(tailwindSignal(['einvoicing'], ['riyadh'])).toMatchObject({ score: 75, confidence: 'low' })
    expect(tailwindSignal(['payments'], ['kuwait-city']).score).toBe(65)
    expect(tailwindSignal([], ['dubai']).score).toBeNull()
  })
})

describe('combiner', () => {
  const sig = (kind: GrowthSignal['kind'], score: number | null, confidence: GrowthSignal['confidence'] = 'medium'): GrowthSignal => ({ kind, score, detail: '', source: '', date: null, confidence })

  it('weights add up to 100 and only known signals are averaged', () => {
    expect(Object.values(GROWTH_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100)
    const r = combineGrowth([sig('hiring', 90, 'high'), sig('news', null), sig('engineering', 70), sig('tailwind', 65, 'low')])
    expect(r.score).toBe(Math.round((30 * 90 + 17 * 70 + 7 * 65) / (30 + 17 + 7)))
  })

  it('unknown never counts as zero: adding unknown signals changes confidence, not the score', () => {
    const a = combineGrowth([sig('hiring', 80, 'high')])
    const b = combineGrowth([sig('hiring', 80, 'high'), sig('news', null), sig('headcount', null), sig('engineering', null)])
    expect(b.score).toBe(a.score)
    expect(a.score).toBe(80)
  })

  it('confidence grows with known, trustworthy signals; tailwind alone is no score', () => {
    expect(combineGrowth([sig('hiring', 80, 'high'), sig('engineering', 70), sig('news', 75), sig('headcount', 60)]).confidence).toBe('high')
    expect(combineGrowth([sig('hiring', 80, 'high'), sig('engineering', 70)]).confidence).toBe('medium')
    expect(combineGrowth([sig('momentum', 60, 'low')]).confidence).toBe('low')
    expect(combineGrowth([sig('tailwind', 70, 'low')]).score).toBeNull()
    expect(growthChipText(78, 'high')).toBe('Growth 78 · high confidence')
    expect(growthChipText(null, null)).toBe('Growth unknown')
  })

  it('fit points: neutral 5 when unknown, pulled to neutral by confidence; the job nudge is ±5 at medium/high only', () => {
    expect(growthFitPoints(null, null)).toBe(5)
    expect(growthFitPoints(100, 'high')).toBe(10)
    expect(growthFitPoints(100, 'low')).toBe(7)
    expect(growthFitPoints(0, 'high')).toBe(0)
    expect(growthFitNudge(78, 'high')).toBe(3)
    expect(growthFitNudge(45, 'medium')).toBe(-1)
    expect(growthFitNudge(95, 'low')).toBe(0)
    expect(growthFitNudge(null, 'high')).toBe(0)
  })
})

describe('fame-neutral ranking', () => {
  const CTX: FitContext = { targetRegions: ['kerala'], preferredRegions: [], targetFamilies: ['backend'], readySkills: ['php'], companyStages: [] }
  const small: GrowthCompany = {
    regionIds: ['kochi', 'kerala', 'in'],
    industry: ['software'],
    sizeBand: '11-50',
    atsKind: 'lever',
    sourceTags: ['directory:infopark'],
    evidence: { githubLogin: 'lagoon-example', github: { at: daysAgo(2), c90: 140, cp90: 60, nr90: 2, nrp90: 0, stars: 4 }, openRoles: 8 },
    roleSnapshots: [{ d: daysAgo(92), n: 3 }, { d: daysAgo(31), n: 5 }, { d: daysAgo(2), n: 8 }],
  }
  const famous: GrowthCompany = {
    regionIds: ['thiruvananthapuram', 'kerala', 'in'],
    industry: ['it_services'],
    sizeBand: '1000+',
    atsKind: 'workday',
    sourceTags: ['seed', 'wikidata'],
    evidence: { wikidataId: 'Q999', headcount: [{ y: 2024, n: 20000 }, { y: 2025, n: 20100 }], hn: { at: daysAgo(3), r: 9, p: 10 }, news: { at: daysAgo(3), ev: [] }, github: { at: daysAgo(2), c90: 300, cp90: 310, nr90: 0, nrp90: 0, stars: 40_000 } },
    roleSnapshots: [{ d: daysAgo(90), n: 300 }, { d: daysAgo(30), n: 305 }, { d: daysAgo(1), n: 302 }],
  }

  it('a small company with no Wikidata entry and no news, rising roles and active GitHub, scores high growth and outranks a famous flat one', () => {
    const g1 = companyGrowth(small, NOW)
    const g2 = companyGrowth(famous, NOW)
    expect(g1.score).toBeGreaterThanOrEqual(75)
    expect(g1.signals.find((s) => s.kind === 'news')!.score).toBeNull()
    expect(g2.score!).toBeLessThan(g1.score!)
    const fit = (c: GrowthCompany, g: { score: number | null; confidence: string }) =>
      companyFit({ name: 'x', regionIds: c.regionIds, industry: c.industry, stage: null, atsKind: c.atsKind, careersUrl: null, evidence: c.evidence, growth: g }, CTX).score
    expect(fit(small, g1)).toBeGreaterThan(fit(famous, g2))
    const v = underTheRadar({ fitScore: fit(small, g1), growthScore: g1.score, sourceTags: small.sourceTags, evidence: small.evidence })
    expect(v.gem).toBe(true)
    expect(v.reasons).toEqual(expect.arrayContaining(['No Wikidata entry or press coverage found', `Growth ${g1.score}`]))
  })

  it('a seed, Wikidata or press-covered company is never "under the radar"', () => {
    expect(underTheRadar({ fitScore: 90, growthScore: 90, sourceTags: ['seed'], evidence: {} }).gem).toBe(false)
    expect(underTheRadar({ fitScore: 90, growthScore: 90, sourceTags: ['github'], evidence: { wikidataId: 'Q1' } }).gem).toBe(false)
    expect(underTheRadar({ fitScore: 90, growthScore: 90, sourceTags: ['github'], evidence: { github: { at: 'x', c90: 1, cp90: 1, nr90: 0, nrp90: 0, stars: 900 } } }).gem).toBe(false)
    expect(underTheRadar({ fitScore: 40, growthScore: 90, sourceTags: ['github'], evidence: {} }).gem).toBe(false)
    // A large employer no list happens to name is not a hidden gem either.
    expect(underTheRadar({ fitScore: 70, growthScore: 70, sourceTags: ['directory:technopark'], evidence: { openRoles: 92 } }).gem).toBe(false)
    expect(underTheRadar({ fitScore: 70, growthScore: null, sourceTags: ['directory:technopark'], evidence: { openRoles: 9 } }).gem).toBe(true)
  })
})

describe('growth facts parsing and postings', () => {
  it('repos → new repos, stars and the active ones; participation → 13-week windows', () => {
    const r = summarizeRepos(
      [
        { name: 'api', fork: false, created_at: daysAgo(30), pushed_at: daysAgo(1), stargazers_count: 3 },
        { name: 'web', created_at: daysAgo(120), pushed_at: daysAgo(10), stargazers_count: 1 },
        { name: 'fork', fork: true, created_at: daysAgo(5), pushed_at: daysAgo(1), stargazers_count: 100 },
        { name: 'old', created_at: daysAgo(900), pushed_at: daysAgo(400) },
      ],
      NOW,
    )
    expect(r).toEqual({ nr90: 1, nrp90: 1, stars: 104, active: ['api', 'web'] })
    const weeks = [...Array(26).fill(1), ...Array(13).fill(2), ...Array(13).fill(5)]
    expect(commitWindows({ all: weeks })).toEqual({ c90: 65, cp90: 26 })
    expect(commitWindows({})).toBeNull()
  })

  it('Wikidata dated employee counts, one per year', () => {
    expect(headcountQuery(['Q1', 'bad', 'Q2'])).toContain('VALUES ?item { wd:Q1 wd:Q2 }')
    const E = 'http://www.wikidata.org/entity/'
    const m = parseHeadcounts({
      results: {
        bindings: [
          { item: { value: `${E}Q1` }, n: { value: '40' }, t: { value: '2023-01-01T00:00:00Z' } },
          { item: { value: `${E}Q1` }, n: { value: '90' }, t: { value: '2025-06-01T00:00:00Z' } },
          { item: { value: `${E}Q1` }, n: { value: '85' }, t: { value: '2025-01-01T00:00:00Z' } },
        ],
      },
    })
    expect(m.get('Q1')).toEqual([{ y: 2023, n: 40 }, { y: 2025, n: 90 }])
  })

  it('postings find their employer’s growth by domain, name or the listed legal name', () => {
    const index = growthIndex([
      { domain: 'carestack.com', normalized: { name: 'CareStack' }, evidence: { listedAs: 'Good Methods Software Solutions (P) Ltd' }, growthScore: 72, growthConfidence: 'medium' },
      { domain: null, normalized: { name: 'Unknown Growth' }, evidence: {}, growthScore: null, growthConfidence: null },
    ])
    expect(growthForPosting({ companyName: 'Anything', companyDomain: 'carestack.com' }, index)).toEqual({ score: 72, confidence: 'medium' })
    expect(growthForPosting({ companyName: 'Good Methods Software Solutions Pvt Ltd', companyDomain: null }, index)?.score).toBe(72)
    expect(growthForPosting({ companyName: 'Unknown Growth', companyDomain: null }, index)).toBeNull()
    expect(relChange(8, 3, 2)).toBeCloseTo(5 / 3)
  })
})
