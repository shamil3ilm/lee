import { checkLine, responsibilitiesComponent } from '@/lib/discovery/match/coverage'
import type { JdLine, ParsedJd } from '@/lib/discovery/match/jd'
import { extractRequirements, REQ_WEIGHTS } from '@/lib/discovery/match/requirements'
import { creditFor } from '@/lib/discovery/match/skills'
import type { MatchJob, RequirementCheck } from '@/lib/discovery/match/types'
import { familiesServed } from '@/lib/variants/starter'
import type { Region } from '@/lib/variants/types'
import type { VariantEvidence } from './evidence'
import { regionFit } from './region'
import { toStoredFit, type BestCv, type Coverage, type VariantFit } from './types'
import { BEST_CV_VERSION } from './version'

/**
 * A variant's fit for a job (0–100), deterministic and free. The variant is
 * scored on what it RENDERS (./evidence.ts) against the job's PARSED JD
 * (lib/discovery/match/jd.ts):
 *
 *   coverage         0…60  every must-have and nice-to-have line, met 1 ·
 *                          partial ½ · missing 0, weighted like the Match
 *                          Score (must 2 · nice ½); "not checked" lines are
 *                          left out. A JD with no checkable lines falls back
 *                          to its skills (required 2 · mentioned 1 · nice ½).
 *   responsibilities 0…20  the Match Score's responsibilities overlap × 2
 *   region           0…15  the variant's region vs the job's (./region.ts)
 *   quality          0…5   the variant's CV Score (general, deterministic) / 20
 *
 * Best and runner-up: highest fit; ties go to the higher CV Score, then to
 * the variant built for the job's role family, then the name. Reasons say
 * what decided it.
 */

export const FIT_WEIGHTS = { coverage: 60, responsibilities: 20, region: 15, quality: 5 } as const

const LINE_WEIGHT: Readonly<Record<RequirementCheck['weight'], number>> = { must: REQ_WEIGHTS.required, nice: REQ_WEIGHTS.nice }
const STATUS_CREDIT: Readonly<Record<'met' | 'partial' | 'missing', number>> = { met: 1, partial: 0.5, missing: 0 }

export interface FitVariantInput {
  id: string
  version: number
  name: string
  region: Region
  roleFamily: string | null
  evidence: VariantEvidence
  /** The variant's CV Score total (0–100). */
  quality: number
}

export interface FitJobInput {
  job: MatchJob
  jd: ParsedJd
  regions: readonly Region[]
  /** The job's role families (title and JD). */
  families: readonly string[]
}

export interface CheckedLine {
  line: JdLine
  check: RequirementCheck
}

/** Every must-have and nice-to-have line once, checked against `evidence` (not-checked lines dropped). */
export function checkedLines(jd: ParsedJd, evidence: VariantEvidence): CheckedLine[] {
  const seen = new Set<string>()
  const out: CheckedLine[] = []
  for (const line of [...jd.must, ...jd.nice]) {
    const key = line.text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const check = checkLine(line, evidence)
    if (check.status !== 'unchecked') out.push({ line, check })
  }
  return out
}

function countOf(lines: readonly CheckedLine[]): Coverage {
  const c = { met: 0, partial: 0, missing: 0, total: lines.length }
  for (const { check } of lines) if (check.status !== 'unchecked') c[check.status]++
  return c
}

interface CoverageOutcome {
  share: number
  label: string
  must: Coverage
  covered: string[]
}

function lineCoverage(lines: readonly CheckedLine[]): CoverageOutcome {
  const total = lines.reduce((s, l) => s + LINE_WEIGHT[l.check.weight], 0)
  const earned = lines.reduce((s, l) => s + LINE_WEIGHT[l.check.weight] * STATUS_CREDIT[l.check.status as keyof typeof STATUS_CREDIT], 0)
  const must = countOf(lines.filter((l) => l.check.weight === 'must'))
  const nice = countOf(lines.filter((l) => l.check.weight === 'nice'))
  const label =
    must.total > 0
      ? `Covers ${must.met} of ${must.total} must-haves${must.partial ? `, ${must.partial} partly` : ''}`
      : `Covers ${nice.met} of ${nice.total} nice-to-haves`
  const covered = lines.filter((l) => l.check.status === 'met' || l.check.status === 'partial').map((l) => l.check.text)
  return { share: total > 0 ? earned / total : 0, label, must, covered }
}

function skillCoverage(input: FitJobInput, evidence: VariantEvidence): CoverageOutcome {
  const empty: Coverage = { met: 0, partial: 0, missing: 0, total: 0 }
  const reqs = extractRequirements(input.job, input.jd)
  if (reqs.length === 0) return { share: 0.5, label: 'No requirements stated', must: empty, covered: [] }
  const credits = reqs.map((r) => ({ r, ...creditFor(r.canonical, evidence.skills) }))
  const total = credits.reduce((s, c) => s + REQ_WEIGHTS[c.r.weight], 0)
  const earned = credits.reduce((s, c) => s + REQ_WEIGHTS[c.r.weight] * c.credit, 0)
  const have = credits.filter((c) => c.credit > 0)
  return { share: earned / total, label: `Shows ${have.length} of ${credits.length} skills asked`, must: empty, covered: have.map((c) => c.via) }
}

export function scoreVariant(v: FitVariantInput, input: FitJobInput): VariantFit {
  const lines = checkedLines(input.jd, v.evidence)
  const cov = lines.length > 0 ? lineCoverage(lines) : skillCoverage(input, v.evidence)
  const resp = responsibilitiesComponent(input.jd, v.evidence)
  const region = regionFit(v.region, input.regions)
  const quality = Math.max(0, Math.min(100, v.quality))
  const fit =
    FIT_WEIGHTS.coverage * cov.share +
    (FIT_WEIGHTS.responsibilities * resp.points) / resp.max +
    region.points +
    (FIT_WEIGHTS.quality * quality) / 100
  const reasons = [cov.label, region.label]
  if (!/not stated/.test(resp.label)) reasons.push(resp.label.replace(/^Responsibilities: /, 'Responsibilities '))
  return {
    variantId: v.id,
    version: v.version,
    name: v.name,
    region: v.region,
    fit: Math.max(0, Math.min(100, Math.round(fit))),
    must: cov.must,
    reasons,
    covered: cov.covered,
    quality,
    familyHit: familiesServed(v.roleFamily).some((f) => input.families.includes(f)),
  }
}

/** Highest fit first; ties: higher CV Score, then the job's role family, then name. */
export function rankFits(fits: readonly VariantFit[]): VariantFit[] {
  return [...fits].sort(
    (a, b) => b.fit - a.fit || b.quality - a.quality || Number(b.familyHit) - Number(a.familyHit) || a.name.localeCompare(b.name),
  )
}

function tieReason(best: VariantFit, second: VariantFit): string {
  if (best.quality !== second.quality) return `Tie on fit; higher CV Score (${Math.round(best.quality)} vs ${Math.round(second.quality)})`
  if (best.familyHit && !second.familyHit) return 'Tie on fit; built for this kind of role'
  return 'Tie on fit and CV Score'
}

function short(text: string, max = 48): string {
  const t = text.replace(/\s+/g, ' ').trim().replace(/[.;:]$/, '')
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

function only(a: VariantFit, b: VariantFit): string[] {
  const other = new Set(b.covered)
  return a.covered.filter((t) => !other.has(t)).slice(0, 2).map((t) => short(t))
}

/** Best and runner-up with reasons; null when there is no variant. */
export function pickBest(fits: readonly VariantFit[]): BestCv | null {
  const ranked = rankFits(fits)
  const best = ranked[0]
  if (!best) return null
  const second = ranked[1]
  const bestReasons = [...best.reasons]
  let secondReasons: string[] = []
  if (second) {
    const lead = only(best, second)
    if (lead.length > 0) bestReasons.push(`Only this one shows: ${lead.join('; ')}`)
    else if (best.fit === second.fit) bestReasons.push(tieReason(best, second))
    secondReasons = [...second.reasons]
    if (lead.length > 0) secondReasons.push(`Misses: ${lead.join('; ')}`)
  }
  return {
    v: BEST_CV_VERSION,
    best: toStoredFit({ ...best, reasons: bestReasons }),
    runnerUp: second ? toStoredFit({ ...second, reasons: secondReasons }) : null,
    compared: fits.length,
  }
}
