/**
 * v12.0 — Impact & quantification (feeds the Impact headline score).
 *
 * v1.1 (calibrated against tests/eval/fixtures/cv-score/1x-calib-*):
 * score = 100 × (0.40 × min(1, quantified% / 60%)      — scope OR outcome
 *              + 0.10 × min(1, outcome% / 30%)
 *              + 0.35 × strong-verb%
 *              + 0.15 × (1 − min(1, 2 × weak-opener%)))
 *
 * v1.1 — a number is either SCOPE (450 endpoints, 7 services, a team of 5)
 * or an OUTCOME (reduced X by 40%, saved 6 hours a week, from 3 hours to 20
 * minutes). Both count as quantified; they are reported separately so a
 * scope-heavy CV isn't told its bullets are "unquantified". A duty phrase
 * after a strong lead verb ("Extended X, and contributed to Y") is a minor
 * note, not a weak opener. Every finding cites its source lines.
 */
import { bulletEvidence, headerEvidence } from '../evidence'
import { makeFinding } from '../findings'
import { SCALE_WORDS, STRONG_VERBS_BASE, STRONG_VERBS_PAST, WEAK_OPENERS, WEAK_PHRASES_MID } from '../lexicon'
import { excerpt } from '../text'
import type { CvFinding, CvLineRef, DimensionResult, ScorableCv, ScoreContext } from '../types'

export interface ImpactDetails {
  bullets: number
  /** Bullets with any number — scope or outcome. */
  quantified: number
  quantifiedRatio: number
  strongVerbRatio: number
  weakOpeners: number
  /** v1.1 — bullets whose numbers only describe scope (size, count). */
  quantifiedScope?: number
  /** v1.1 — bullets with an outcome number (a change, a saving, a %). */
  quantifiedOutcome?: number
}

const QUANT_TARGET = 0.6
const OUTCOME_TARGET = 0.3
const MAX_EVIDENCE = 6

export type QuantKind = 'outcome' | 'scope'

const NUM = String.raw`[~≈]?\d[\d.,]*`
const PERCENT_RE = /\d\s*(?:%|percent\b|pct\b)/i
const MONEY_RE = /[$€£¥₹]\s?\d|\b\d[\d.,]*\s?(?:k|m|bn|million|billion)?\s?(?:usd|aed|sar|inr|eur|gbp|qar|kwd|omr|bhd)\b|\b(?:usd|aed|sar|inr|eur|gbp|qar|kwd|omr|bhd)\s?\d/i
const CHANGE_BY_RE = new RegExp(
  String.raw`\b(?:reduc|cut|increas|improv|grew|grow|boost|sav|decreas|lower|rais|accelerat|sped|speed|shorten|shr[iau]nk|eliminat|slash|drop|lift|halv|doubl|tripl)\w*\b[^.;]{0,60}?\b(?:by|to)\s+${NUM}`,
  'i',
)
const FROM_TO_RE = new RegExp(String.raw`\bfrom\s+[$€£]?${NUM}\s*[a-z]*\s+to\s+[$€£]?${NUM}`, 'i')
const TIME_SAVED_RE = /\b(?:sav\w*|free\w*|cut\w*|reclaim\w*)\b[^.;]{0,40}?\d[\d.,]*\s*(?:hours?|hrs?|minutes?|mins?|days?|weeks?|seconds?|ms)\b/i
const MULTIPLE_RE = /\b\d+(?:\.\d+)?\s?x\b|\b(?:doubled|tripled|quadrupled|halved|\d+-fold|tenfold)\b|zero[- ]downtime/i

/** Outcome (a change / saving / %), scope (a size or count), or null (no number). Years alone don't count. */
export function quantKind(text: string): QuantKind | null {
  const noYears = text.replace(/\b(?:19|20)\d{2}\b/g, '')
  if (PERCENT_RE.test(noYears) || MONEY_RE.test(noYears) || CHANGE_BY_RE.test(noYears) || FROM_TO_RE.test(noYears)
    || TIME_SAVED_RE.test(noYears) || MULTIPLE_RE.test(noYears)) return 'outcome'
  if (/\d/.test(noYears) || SCALE_WORDS.test(text)) return 'scope'
  return null
}

/** Years ("2019") alone don't count as a metric. */
export function isQuantified(text: string): boolean {
  return quantKind(text) !== null
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

/**
 * A duty phrase AFTER a strong lead verb ("Extended X, and contributed to
 * Y" → "contributed to"); null when the bullet opens weakly or has none.
 */
export function weakPhraseInside(text: string): string | null {
  if (weakOpenerOf(text) || !startsWithStrongVerb(text)) return null
  const lower = text.toLowerCase()
  for (const p of WEAK_PHRASES_MID) {
    const at = lower.search(new RegExp(`\\b${p}\\b`))
    if (at > 0) return p
  }
  return null
}

export function replacementVerb(opener: string): string {
  if (/^(responsible|in charge|tasked|handled|duties)/.test(opener)) return 'Owned'
  if (/^worked/.test(opener)) return 'Built'
  return 'Delivered'
}

/** Deterministic rewrite skeleton for a weak-opener bullet (never adds numbers). */
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

/** First line of each listed bullet (up to MAX_EVIDENCE). */
function firstLines(cv: ScorableCv, indexes: number[]): CvLineRef[] {
  return indexes.slice(0, MAX_EVIDENCE).flatMap((i) => bulletEvidence(cv, i).slice(0, 1))
}

function noBulletsResult(cv: ScorableCv): DimensionResult<ImpactDetails> {
  return {
    score: 0,
    details: { bullets: 0, quantified: 0, quantifiedRatio: 0, strongVerbRatio: 0, weakOpeners: 0, quantifiedScope: 0, quantifiedOutcome: 0 },
    findings: [
      makeFinding('impact', {
        severity: 'critical',
        message: 'No achievement bullets found — recruiters scan bullets first.',
        evidence: headerEvidence(cv),
        suggestion: 'Recruiters scan bullets first — 3–6 per role that open with an action verb and end with a result give them something to read.',
      }),
    ],
  }
}

export function scoreImpact(
  cv: ScorableCv,
  ctx: Pick<ScoreContext, 'canAutofix'>,
): DimensionResult<ImpactDetails> {
  const total = cv.bullets.length
  if (total === 0) return noBulletsResult(cv)

  const within = indexWithinRole(cv)
  const findings: CvFinding[] = []
  const kinds = cv.bullets.map((b) => quantKind(b.text))
  const scope = kinds.filter((k) => k === 'scope').length
  const outcome = kinds.filter((k) => k === 'outcome').length
  const quantified = scope + outcome
  let strong = 0
  let weak = 0
  const plain: number[] = []

  cv.bullets.forEach((b, i) => {
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
            evidence: bulletEvidence(cv, i, opener),
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
    if (startsWithStrongVerb(b.text)) {
      strong++
      const mid = weakPhraseInside(b.text)
      if (mid) {
        const lead = b.text.trim().split(/\s+/)[0]!.replace(/[^A-Za-z-]/g, '')
        findings.push(makeFinding('impact', {
          severity: 'minor',
          message: `Bullet leads with "${lead}" but later says "${mid}" — that part reads as a supporting role`,
          location: { section: b.section, index: i, excerpt: excerpt(b.text) },
          evidence: bulletEvidence(cv, i, mid),
          suggestion: 'Optional: name your own part of that work (what you built or decided), or keep it if shared credit is the accurate picture.',
        }))
      }
    } else plain.push(i)
  })

  const quantifiedRatio = quantified / total
  const strongVerbRatio = strong / total
  const weakRatio = weak / total

  const unquantified = kinds.map((k, i) => (k === null ? i : -1)).filter((i) => i >= 0)
  if (quantifiedRatio < QUANT_TARGET && unquantified.length) {
    const first = unquantified[0]!
    const fb = cv.bullets[first]!
    findings.push(
      makeFinding('impact', {
        severity: quantifiedRatio < 0.25 ? 'major' : 'minor',
        message: `${total - quantified} of ${total} bullets have no number (scope or outcome)`,
        location: { section: fb.section, index: first, excerpt: excerpt(fb.text) },
        evidence: firstLines(cv, unquantified),
        suggestion: 'Numbers make a bullet concrete — scope (how many users, services, records) or a result (% faster, hours saved, errors cut). Only use figures you can stand behind.',
      }),
    )
  }
  if (scope > 0 && total >= 3 && outcome / total < OUTCOME_TARGET) {
    const scopeOnly = kinds.map((k, i) => (k === 'scope' ? i : -1)).filter((i) => i >= 0)
    findings.push(
      makeFinding('impact', {
        severity: 'minor',
        message: `${outcome} of ${total} bullets show an outcome; ${scope} more are quantified by scope only`,
        evidence: firstLines(cv, scopeOnly),
        suggestion: 'Scope numbers already count. Where you know what changed (time saved, errors reduced, faster releases), adding it shows the result as well as the size.',
      }),
    )
  }
  if (plain.length / total > 0.3) {
    const ex = cv.bullets[plain[0]!]!
    findings.push(
      makeFinding('impact', {
        severity: 'minor',
        message: `${plain.length} of ${total} bullets don't start with a strong action verb`,
        location: { section: ex.section, index: plain[0]!, excerpt: excerpt(ex.text) },
        evidence: firstLines(cv, plain),
        suggestion: 'Recruiters skim the first word — verbs like Built, Led, Reduced, Scaled, Automated or Shipped carry the bullet.',
      }),
    )
  }

  const score = Math.round(
    100 *
      (0.4 * Math.min(1, quantifiedRatio / QUANT_TARGET) +
        0.1 * Math.min(1, outcome / total / OUTCOME_TARGET) +
        0.35 * strongVerbRatio +
        0.15 * (1 - Math.min(1, 2 * weakRatio))),
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
      quantifiedScope: scope,
      quantifiedOutcome: outcome,
    },
    findings,
  }
}
