/**
 * v12.0 — Impact & quantification (feeds the Impact headline score).
 *
 * score = 100 × (0.50 × min(1, quantified% / 60%)
 *              + 0.35 × strong-verb%
 *              + 0.15 × (1 − weak-opener%))
 */
import { makeFinding } from '../findings'
import { SCALE_WORDS, STRONG_VERBS_BASE, STRONG_VERBS_PAST, WEAK_OPENERS } from '../lexicon'
import { excerpt } from '../text'
import type { CvFinding, DimensionResult, ScorableCv, ScoreContext } from '../types'

export interface ImpactDetails {
  bullets: number
  quantified: number
  quantifiedRatio: number
  strongVerbRatio: number
  weakOpeners: number
}

const QUANT_TARGET = 0.6

/** Years ("2019") alone don't count as a metric. */
export function isQuantified(text: string): boolean {
  const noYears = text.replace(/\b(?:19|20)\d{2}\b/g, '')
  return /\d/.test(noYears) || /[$€£¥%]/.test(text) || SCALE_WORDS.test(text)
}

export function firstWord(text: string): string {
  return (text.trim().split(/\s+/)[0] ?? '').toLowerCase().replace(/[^a-z-]/g, '')
}

export function weakOpenerOf(text: string): string | null {
  const lower = text.trim().toLowerCase()
  const hits = WEAK_OPENERS.filter((w) => lower === w || lower.startsWith(`${w} `))
  if (hits.length === 0) return null
  return hits.sort((a, b) => b.length - a.length)[0]!
}

export function startsWithStrongVerb(text: string): boolean {
  const w = firstWord(text)
  return STRONG_VERBS_PAST.has(w) || STRONG_VERBS_BASE.has(w) || STRONG_VERBS_BASE.has(w.replace(/s$/, ''))
}

export function replacementVerb(opener: string): string {
  if (/^(responsible|in charge|tasked|handled|duties)/.test(opener)) return 'Owned'
  if (/^worked/.test(opener)) return 'Built'
  return 'Delivered'
}

/** Deterministic rewrite skeleton for a weak-opener bullet. */
export function rewriteSkeleton(text: string, opener: string): string {
  const rest = text.trim().slice(opener.length).trim().replace(/[.;]$/, '')
  return `Consider: "${replacementVerb(opener)} ${rest} — resulting in <measurable outcome: %, $, time saved, users>"`
}

/** Index of each experience bullet within its role (for fix payloads). */
function indexWithinRole(cv: ScorableCv): (number | undefined)[] {
  const counters = new Map<number, number>()
  return cv.bullets.map((b) => {
    if (b.roleIndex === undefined) return undefined
    const n = counters.get(b.roleIndex) ?? 0
    counters.set(b.roleIndex, n + 1)
    return n
  })
}

export function scoreImpact(
  cv: ScorableCv,
  ctx: Pick<ScoreContext, 'canAutofix'>,
): DimensionResult<ImpactDetails> {
  const total = cv.bullets.length
  if (total === 0) {
    return {
      score: 0,
      details: { bullets: 0, quantified: 0, quantifiedRatio: 0, strongVerbRatio: 0, weakOpeners: 0 },
      findings: [
        makeFinding('impact', {
          severity: 'critical',
          message: 'No achievement bullets found — recruiters scan bullets first.',
          suggestion: 'Under each role add 3–6 bullets that start with an action verb and end with a measurable outcome.',
        }),
      ],
    }
  }

  const within = indexWithinRole(cv)
  const findings: CvFinding[] = []
  let quantified = 0
  let strong = 0
  let weak = 0
  const plain: { text: string; section: string; i: number }[] = []

  cv.bullets.forEach((b, i) => {
    if (isQuantified(b.text)) quantified++
    const opener = weakOpenerOf(b.text)
    if (opener) {
      weak++
      const bulletIndex = within[i]
      findings.push(
        makeFinding(
          'impact',
          {
            severity: 'major',
            message: `Bullet opens with a weak phrase ("${opener}") — it describes a duty, not an outcome`,
            location: { section: b.section, index: i, excerpt: excerpt(b.text) },
            suggestion: rewriteSkeleton(b.text, opener),
            ...(b.roleIndex !== undefined && bulletIndex !== undefined
              ? { fix: { kind: 'rewrite_bullet' as const, roleIndex: b.roleIndex, bulletIndex } }
              : {}),
          },
          ctx.canAutofix,
        ),
      )
      return
    }
    if (startsWithStrongVerb(b.text)) strong++
    else plain.push({ text: b.text, section: b.section, i })
  })

  const quantifiedRatio = quantified / total
  const strongVerbRatio = strong / total
  const weakRatio = weak / total

  if (quantifiedRatio < QUANT_TARGET) {
    const firstUnquantified = cv.bullets.findIndex((b) => !isQuantified(b.text))
    const fb = cv.bullets[firstUnquantified]
    findings.push(
      makeFinding('impact', {
        severity: quantifiedRatio < 0.25 ? 'major' : 'minor',
        message: `${total - quantified} of ${total} bullets lack a measurable outcome`,
        ...(fb ? { location: { section: fb.section, index: firstUnquantified, excerpt: excerpt(fb.text) } } : {}),
        suggestion: 'Add a number to each bullet: % improvement, $ saved, time cut, users served, requests/sec, team size.',
      }),
    )
  }
  if (plain.length / total > 0.3) {
    const ex = plain[0]!
    findings.push(
      makeFinding('impact', {
        severity: 'minor',
        message: `${plain.length} of ${total} bullets don't start with a strong action verb`,
        location: { section: ex.section, index: ex.i, excerpt: excerpt(ex.text) },
        suggestion: 'Lead with verbs like Built, Led, Reduced, Scaled, Automated, Shipped.',
      }),
    )
  }

  const score = Math.round(
    100 * (0.5 * Math.min(1, quantifiedRatio / QUANT_TARGET) + 0.35 * strongVerbRatio + 0.15 * (1 - weakRatio)),
  )
  const r2 = (n: number): number => Math.round(n * 100) / 100
  return {
    score,
    details: {
      bullets: total,
      quantified,
      quantifiedRatio: r2(quantifiedRatio),
      strongVerbRatio: r2(strongVerbRatio),
      weakOpeners: weak,
    },
    findings,
  }
}
