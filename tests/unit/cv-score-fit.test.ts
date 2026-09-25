import { describe, expect, it } from 'vitest'
import {
  CV_FIT_TARGET,
  overallLabel,
  pickScoringDocument,
  toCvFitView,
  toDocScoreMap,
  type ScoreRowLike,
} from '@/lib/cv-score/fit'

function row(overrides: Partial<ScoreRowLike> = {}): ScoreRowLike {
  return {
    id: 'r1',
    overall: 64,
    grade: 'D',
    mode: 'jd',
    sourceLabel: 'Tailored CV v2',
    scores: {
      total: { score: 64 },
      roleMatch: { score: 70 },
      skillsMatch: { score: 55 },
      experienceMatch: { score: null },
      ats: { score: 81 },
      impact: { score: 60 },
      readability: { score: 90 },
      structure: { score: 75 },
    },
    createdAt: new Date('2026-09-20T10:00:00Z'),
    ...overrides,
  }
}

describe('toCvFitView', () => {
  it('returns null when there is no history', () => {
    expect(toCvFitView([])).toBeNull()
  })

  it('shows the job-match headlines for a jd score', () => {
    const view = toCvFitView([row()])
    expect(view).toMatchObject({ overall: 64, label: 'Total Match', delta: null, createdAt: '2026-09-20T10:00:00.000Z' })
    expect(view?.headlines.map((h) => [h.key, h.score])).toEqual([
      ['roleMatch', 70],
      ['skillsMatch', 55],
      ['experienceMatch', null],
      ['ats', 81],
    ])
  })

  it('shows the quality headlines for a general score', () => {
    const view = toCvFitView([row({ mode: 'general' })])
    expect(view?.label).toBe('CV Quality')
    expect(view?.headlines.map((h) => h.key)).toEqual(['ats', 'impact', 'readability', 'structure'])
  })

  it('computes the delta against the previous run in the same mode only', () => {
    const view = toCvFitView([
      row({ overall: 72 }),
      row({ id: 'g', overall: 90, mode: 'general' }),
      row({ id: 'r0', overall: 58 }),
    ])
    expect(view?.delta).toBe(14)
  })

  it('tolerates malformed scores json', () => {
    const view = toCvFitView([row({ scores: null })])
    expect(view?.headlines.every((h) => h.score === null)).toBe(true)
    const odd = toCvFitView([row({ scores: { roleMatch: 'x', skillsMatch: { score: 'nope' } } })])
    expect(odd?.headlines.every((h) => h.score === null)).toBe(true)
  })
})

describe('pickScoringDocument', () => {
  const doc = (id: string, kind: string) => ({ id, kind, title: id })

  it('prefers the newest tailored CV, then a LaTeX CV, then the master CV', () => {
    expect(pickScoringDocument([doc('m', 'master_cv'), doc('t2', 'tailored_cv'), doc('t1', 'tailored_cv')])?.id).toBe('t2')
    expect(pickScoringDocument([doc('m', 'master_cv'), doc('l', 'latex_cv')])?.id).toBe('l')
    expect(pickScoringDocument([doc('c', 'cover_letter'), doc('m', 'master_cv')])?.id).toBe('m')
  })

  it('returns null when there is no CV', () => {
    expect(pickScoringDocument([doc('c', 'cover_letter')])).toBeNull()
    expect(pickScoringDocument([])).toBeNull()
  })
})

describe('helpers', () => {
  it('labels overall scores by mode', () => {
    expect(overallLabel('jd')).toBe('Total Match')
    expect(overallLabel('general')).toBe('CV Quality')
  })

  it('maps latest-per-document rows to a lookup', () => {
    expect(toDocScoreMap([{ documentId: 'a', overall: 80, mode: 'jd' }])).toEqual({ a: { overall: 80, mode: 'jd' } })
  })

  it('targets a Total Match of 70', () => {
    expect(CV_FIT_TARGET).toBe(70)
  })
})
