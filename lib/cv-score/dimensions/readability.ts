import { plural } from '@/lib/ui/labels'
/**
 * v12.0 — Clarity & readability (feeds the Readability headline score).
 *
 * Points (sum 100): bullet length in 12–28 words 40 · passive voice 20 ·
 * repetition 15 · tense consistency 15 · no first-person pronouns 10.
 */
import { bulletEvidence } from '../evidence'
import { makeFinding } from '../findings'
import { BASE_TO_PAST, STRONG_VERBS_BASE } from '../lexicon'
import { excerpt, STOPWORDS, wordCount } from '../text'
import { firstWord } from './impact'
import type { CvFinding, CvLineRef, DimensionResult, ScorableCv } from '../types'

export interface ReadabilityDetails {
  bullets: number
  avgWords: number
  inRangeRatio: number
  passiveRatio: number
  repeatedOpeners: string[]
  repeatedWords: string[]
  pastRoleTenseIssues: number
  pronounBullets: number
}

const MIN_WORDS = 12
const MAX_WORDS = 28

const PASSIVE_RE = /\b(?:am|is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?(?:\w+ed|built|done|made|given|taken|written|led|run|shown|seen|known|driven|chosen|brought|kept|sent|held|set|grown)\b/i
const PRONOUN_RE = /\b(?:I|me|my|mine|myself|we|our|us)\b/

export function isPassive(text: string): boolean {
  return PASSIVE_RE.test(text)
}

/** Present-tense opener ("Manage", "Manages", "Managing") on a past role. */
export function isPresentTenseOpener(text: string): boolean {
  const w = firstWord(text)
  if (!w) return false
  if (w.endsWith('ing') && w.length > 5) return true
  if (STRONG_VERBS_BASE.has(w) && BASE_TO_PAST.get(w) !== w) return true
  if (w.endsWith('s') && STRONG_VERBS_BASE.has(w.slice(0, -1))) return true
  if (w.endsWith('es') && STRONG_VERBS_BASE.has(w.slice(0, -2))) return true
  return false
}

/** First line of each listed bullet (up to 6), optionally highlighting a phrase. */
function bulletsEvidence(cv: ScorableCv, indexes: number[], highlight?: (i: number) => string | undefined): CvLineRef[] {
  return indexes.slice(0, 6).flatMap((i) => {
    const h = highlight?.(i)
    const lines = bulletEvidence(cv, i, h)
    const hit = h ? lines.find((l) => l.highlight) : undefined
    return [hit ?? lines[0]].filter((l): l is CvLineRef => !!l)
  })
}

export function scoreReadability(cv: ScorableCv): DimensionResult<ReadabilityDetails> {
  const bullets = cv.bullets
  const total = bullets.length
  const findings: CvFinding[] = []
  if (total === 0) {
    return {
      score: 50,
      details: { bullets: 0, avgWords: 0, inRangeRatio: 0, passiveRatio: 0, repeatedOpeners: [], repeatedWords: [], pastRoleTenseIssues: 0, pronounBullets: 0 },
      findings: [],
    }
  }

  // Length
  const lens = bullets.map((b) => wordCount(b.text))
  const inRange = lens.filter((n) => n >= MIN_WORDS && n <= MAX_WORDS).length
  const inRangeRatio = inRange / total
  const tooLong = bullets.map((b, i) => ({ b, i, n: lens[i]! })).filter((x) => x.n > 35)
  for (const x of tooLong.slice(0, 5)) {
    findings.push(makeFinding('readability', {
      severity: 'minor',
      message: `Bullet is ${x.n} words — long bullets get skimmed`,
      location: { section: x.b.section, index: x.i, excerpt: excerpt(x.b.text) },
      evidence: bulletEvidence(cv, x.i),
      suggestion: 'Long bullets get skimmed — splitting it in two, or keeping one outcome (12–28 words), keeps it readable.',
    }))
  }
  const tooShort = lens.filter((n) => n < 6).length
  if (tooShort / total > 0.3) {
    findings.push(makeFinding('readability', {
      severity: 'minor',
      message: `${tooShort} bullets are under 6 words — too thin to show impact`,
      evidence: bulletsEvidence(cv, lens.map((n, i) => (n < 6 ? i : -1)).filter((i) => i >= 0)),
      suggestion: 'A short bullet leaves out the how and the result — adding them shows the impact.',
    }))
  }

  // Passive voice
  const passive = bullets.map((b, i) => ({ b, i })).filter((x) => isPassive(x.b.text))
  const passiveRatio = passive.length / total
  const passivePts = passiveRatio <= 0.1 ? 20 : Math.max(0, 20 * (1 - (passiveRatio - 0.1) / 0.4))
  if (passive.length > 0 && passiveRatio > 0.1) {
    const ex = passive[0]!
    findings.push(makeFinding('readability', {
      severity: passiveRatio > 0.3 ? 'major' : 'minor',
      message: `${passive.length} of ${total} bullets use passive voice`,
      location: { section: ex.b.section, index: ex.i, excerpt: excerpt(ex.b.text) },
      evidence: bulletsEvidence(cv, passive.map((x) => x.i), (i) => PASSIVE_RE.exec(bullets[i]!.text)?.[0]),
      suggestion: 'Active voice reads stronger — "Reduced latency" rather than "Latency was reduced".',
    }))
  }

  // Repetition — openers and content words
  const openerCounts = new Map<string, number>()
  for (const b of bullets) {
    const w = firstWord(b.text)
    if (w) openerCounts.set(w, (openerCounts.get(w) ?? 0) + 1)
  }
  const repeatedOpeners = [...openerCounts.entries()].filter(([, n]) => n >= 3).map(([w]) => w).sort()
  const wordBullets = new Map<string, number>()
  for (const b of bullets) {
    const seen = new Set<string>()
    for (const raw of b.text.toLowerCase().split(/[^a-z]+/)) {
      if (raw.length < 5 || STOPWORDS.has(raw) || seen.has(raw)) continue
      seen.add(raw)
      wordBullets.set(raw, (wordBullets.get(raw) ?? 0) + 1)
    }
  }
  const repeatedWords = total >= 5
    ? [...wordBullets.entries()].filter(([, n]) => n / total > 0.4 && n >= 3).map(([w]) => w).sort()
    : []
  const repetitionPts = Math.max(0, 15 - repeatedOpeners.length * 5 - repeatedWords.length * 3)
  if (repeatedOpeners.length || repeatedWords.length) {
    findings.push(makeFinding('readability', {
      severity: 'minor',
      message: `Repetitive wording: ${[...repeatedOpeners.map((w) => `"${w}…" opens 3+ bullets`), ...repeatedWords.map((w) => `"${w}"`)].join(', ')}`,
      evidence: bulletsEvidence(
        cv,
        bullets
          .map((b, i) => (repeatedOpeners.includes(firstWord(b.text)) || repeatedWords.some((w) => b.text.toLowerCase().includes(w)) ? i : -1))
          .filter((i) => i >= 0),
      ),
      suggestion: 'Varied verbs and phrasing help each bullet read as a distinct achievement.',
    }))
  }

  // Tense — past roles should read in the past tense.
  let pastRoleBullets = 0
  let tenseIssues = 0
  const tenseIdx: number[] = []
  let firstIssue: { text: string; section: string; i: number } | null = null
  bullets.forEach((b, i) => {
    if (b.roleIndex === undefined) return
    const role = cv.roles[b.roleIndex]
    if (!role || role.end === 'present' || !role.end) return
    pastRoleBullets++
    if (isPresentTenseOpener(b.text)) {
      tenseIssues++
      tenseIdx.push(i)
      firstIssue ??= { text: b.text, section: b.section, i }
    }
  })
  const tensePts = pastRoleBullets === 0 ? 15 : 15 * (1 - tenseIssues / pastRoleBullets)
  if (tenseIssues > 0 && firstIssue) {
    const fi = firstIssue as { text: string; section: string; i: number }
    findings.push(makeFinding('readability', {
      severity: 'minor',
      message: `${plural(tenseIssues, 'bullet')} in past roles ${tenseIssues === 1 ? 'uses' : 'use'} present tense`,
      location: { section: fi.section, index: fi.i, excerpt: excerpt(fi.text) },
      evidence: bulletsEvidence(cv, tenseIdx),
      suggestion: 'Recruiters read past tense as finished work — past tense for previous roles ("Built", "Led") and present tense only for your current role.',
    }))
  }

  // Pronouns
  const pronounBullets = bullets.filter((b) => PRONOUN_RE.test(b.text)).length
  const pronounPts = pronounBullets === 0 ? 10 : Math.max(0, 10 - pronounBullets * 2)
  if (pronounBullets > 0) {
    findings.push(makeFinding('readability', {
      severity: 'minor',
      message: `${plural(pronounBullets, 'bullet')} ${pronounBullets === 1 ? 'uses' : 'use'} first-person pronouns (I, my, we)`,
      evidence: bulletsEvidence(
        cv,
        bullets.map((b, i) => (PRONOUN_RE.test(b.text) ? i : -1)).filter((i) => i >= 0),
        (i) => PRONOUN_RE.exec(bullets[i]!.text)?.[0],
      ),
      suggestion: 'CV bullets are implied first person, so pronouns can go: "Built…" rather than "I built…".',
    }))
  }

  const lengthPts = 40 * inRangeRatio
  const score = Math.round(lengthPts + passivePts + repetitionPts + tensePts + pronounPts)
  const avgWords = Math.round((lens.reduce((s, n) => s + n, 0) / total) * 10) / 10
  const r2 = (n: number): number => Math.round(n * 100) / 100
  return {
    score,
    details: {
      bullets: total,
      avgWords,
      inRangeRatio: r2(inRangeRatio),
      passiveRatio: r2(passiveRatio),
      repeatedOpeners,
      repeatedWords,
      pastRoleTenseIssues: tenseIssues,
      pronounBullets,
    },
    findings,
  }
}
