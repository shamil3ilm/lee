import { describe, expect, it } from 'vitest'
import { buildShortlist, freshnessReason, rankCandidate, RANK_WEIGHTS, type RankCandidate, type RankContext } from '@/lib/apply/rank'

const NOW = new Date('2026-10-07T08:00:00Z')
const DAY = 24 * 60 * 60 * 1000

function cand(over: Partial<RankCandidate> = {}): RankCandidate {
  return {
    id: over.id ?? '00000000-0000-4000-8000-000000000001',
    matchScore: 80,
    fitScore: null,
    regions: [],
    families: [],
    notes: {},
    postedAt: null,
    createdAt: new Date(NOW.getTime() - 20 * DAY),
    riskLevel: 'safe',
    quarantined: false,
    filtered: false,
    reputation: null,
    feedback: [],
    ...over,
  }
}

const CTX: RankContext = { now: NOW, targetFamilies: ['backend'], targetRegions: ['ae', 'gcc', 'remote'] }

const labels = (r: { reasons: { label: string }[] }): string[] => r.reasons.map((x) => x.label)

describe('rankCandidate (composite with reasons)', () => {
  it('adds every part as a reason and sums them into the score', () => {
    const r = rankCandidate(
      cand({
        matchScore: 80,
        families: ['backend'],
        regions: ['ae', 'gcc'],
        notes: { infos: ['pay: AED 20,000/mo'], boosts: ['visa / relocation offered'] },
        postedAt: new Date(NOW.getTime() - 2 * DAY),
        reputation: { environment: 80, stability: 70 },
      }),
      CTX,
    )
    expect(labels(r)).toEqual([
      'AI 80',
      'Role: Backend',
      'Region: UAE',
      'Company environment 80, stability 70',
      'Pay stated (AED 20,000/mo)',
      'visa / relocation offered',
      'Posted 2 days ago',
    ])
    // 40 + 12 + 8 + 5 + 3 + 3 + 7
    expect(r.score).toBe(78)
    expect(r.reasons.reduce((s, x) => s + x.points, 0)).toBe(78)
  })

  it('treats a posting with neither score as neutral and says so', () => {
    const r = rankCandidate(cand({ matchScore: null, fitScore: null }), CTX)
    expect(r.reasons[0]).toEqual({ kind: 'match', label: 'Not scored yet', points: RANK_WEIGHTS.unscoredMatch })
  })

  it('uses the deterministic Match Score when the AI score is absent (never the flat 25)', () => {
    const r = rankCandidate(cand({ matchScore: null, fitScore: 72 }), CTX)
    expect(r.reasons[0]).toEqual({ kind: 'match', label: 'Match 72', points: 36 })
    const weak = rankCandidate(cand({ matchScore: null, fitScore: 20 }), CTX)
    expect(weak.reasons[0]?.points).toBe(10)
  })

  it('blends Match and AI as their mean when both exist', () => {
    const r = rankCandidate(cand({ matchScore: 80, fitScore: 72 }), CTX)
    expect(r.reasons[0]).toEqual({ kind: 'match', label: 'Match 72 · AI 80', points: 38 })
  })

  it('lowers pay below the range once, not twice (the soft-rule chip is the same fact)', () => {
    const r = rankCandidate(cand({ notes: { penalties: ['pay: AED 5,000/mo, below your range'] } }), CTX)
    expect(r.reasons.filter((x) => x.kind === 'pay')).toEqual([{ kind: 'pay', label: 'Pay below your range', points: -10 }])
    expect(r.reasons.some((x) => x.kind === 'rule')).toBe(false)
  })

  it('caps soft-rule penalties at -15 and boosts at +6', () => {
    const r = rankCandidate(
      cand({ notes: { penalties: ['a', 'b', 'c', 'd'], boosts: ['x', 'y', 'z'] } }),
      CTX,
    )
    const rules = r.reasons.filter((x) => x.kind === 'rule')
    expect(rules.filter((x) => x.points < 0).reduce((s, x) => s + x.points, 0)).toBe(-15)
    expect(rules.filter((x) => x.points > 0).reduce((s, x) => s + x.points, 0)).toBe(6)
  })

  it('ignores unknown reputation and clamps confirmed reputation to ±10', () => {
    expect(rankCandidate(cand({ reputation: { environment: null, stability: null } }), CTX).reasons.some((x) => x.kind === 'reputation')).toBe(false)
    const bad = rankCandidate(cand({ reputation: { environment: 0, stability: null } }), CTX)
    expect(bad.reasons.find((x) => x.kind === 'reputation')?.points).toBe(-10)
  })

  it('applies Scam Shield caution and feedback penalties', () => {
    const r = rankCandidate(cand({ riskLevel: 'caution', feedback: [{ points: -15, label: 'You passed on this company' }] }), CTX)
    expect(labels(r)).toContain('Scam Shield: caution')
    expect(labels(r)).toContain('You passed on this company')
    expect(r.score).toBe(40 - 5 - 15)
  })

  it('clamps the score to 0–100', () => {
    const low = rankCandidate(cand({ matchScore: 0, feedback: [{ points: -15, label: 'x' }] }), CTX)
    expect(low.score).toBe(0)
  })
})

describe('freshnessReason', () => {
  it('uses the posting date when known, else when lee found it', () => {
    expect(freshnessReason(new Date(NOW.getTime() - 1000), NOW, NOW)).toEqual({ kind: 'fresh', label: 'Posted today', points: 10 })
    expect(freshnessReason(null, new Date(NOW.getTime() - 6 * DAY), NOW)).toEqual({ kind: 'fresh', label: 'Found 6 days ago', points: 4 })
    expect(freshnessReason(null, new Date(NOW.getTime() - 30 * DAY), NOW)).toBeNull()
  })

  it('ignores a posting date in the future', () => {
    expect(freshnessReason(new Date(NOW.getTime() + 5 * DAY), new Date(NOW.getTime() - DAY), NOW)?.label).toBe('Found yesterday')
  })
})

describe('buildShortlist', () => {
  it('never shortlists a quarantined or filtered posting, however strong', () => {
    const list = buildShortlist(
      [
        cand({ id: 'a', matchScore: 99, quarantined: true }),
        cand({ id: 'b', matchScore: 99, filtered: true }),
        cand({ id: 'c', matchScore: 40 }),
      ],
      CTX,
      5,
    )
    expect(list.map((r) => r.id)).toEqual(['c'])
  })

  it('ranks unscored-by-AI postings by their Match Score', () => {
    const list = buildShortlist(
      [
        cand({ id: 'low', matchScore: null, fitScore: 30 }),
        cand({ id: 'high', matchScore: null, fitScore: 85 }),
        cand({ id: 'mid', matchScore: 60, fitScore: null }),
      ],
      CTX,
      3,
    )
    expect(list.map((r) => r.id)).toEqual(['high', 'mid', 'low'])
  })

  it('keeps the top n by score with ranks, and breaks ties deterministically', () => {
    const list = buildShortlist(
      [
        cand({ id: 'b', matchScore: 60 }),
        cand({ id: 'a', matchScore: 60 }),
        cand({ id: 'c', matchScore: 90 }),
        cand({ id: 'd', matchScore: 10 }),
      ],
      CTX,
      3,
    )
    expect(list.map((r) => [r.id, r.rank])).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ])
  })

  it('puts the match first among the display reasons, then the biggest effects', () => {
    const [top] = buildShortlist([cand({ families: ['backend'], riskLevel: 'caution' })], CTX, 1)
    expect(top?.reasons.map((r) => r.kind)).toEqual(['match', 'fit', 'risk'])
  })
})
