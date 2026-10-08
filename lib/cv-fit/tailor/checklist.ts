import { contentStems, excerpt } from '@/lib/cv-score/text'
import { checkLine } from '@/lib/discovery/match/coverage'
import type { JdLine, ParsedJd } from '@/lib/discovery/match/jd'
import { withImplied } from '@/lib/discovery/match/lexicon'
import { creditFor } from '@/lib/discovery/match/skills'
import type { VariantEvidence } from '../evidence'
import { fnv1a } from '../key'
import type { Coverage } from '../types'
import type { ChecklistItem, ReqStatus } from './types'
import { inRecipe, unitsEvidence, type Unit } from './units'
import type { Recipe } from '@/lib/variants/types'

/**
 * The requirement checklist: every must-have and nice-to-have line of the
 * parsed JD, met / partial / missing against the profile's READY units
 * (what can honestly be shown), with the unit that backs it, and its state
 * in the starting CV. Lines nothing can check ("Strong communication") are
 * left out: lee does not guess about soft asks.
 */

export const MAX_MUST = 14
export const MAX_NICE = 6

export function requirementId(text: string): string {
  return `r${fnv1a(text.toLowerCase().replace(/\s+/g, ' ').trim())}`
}

function backs(unit: Unit, line: JdLine): boolean {
  if (unit.mode !== 'full' || line.skills.length === 0) return false
  const skills = withImplied(unit.skills)
  return line.skills.some((s) => creditFor(s, skills).credit > 0)
}

function overlaps(unit: Unit, line: JdLine): boolean {
  const want = contentStems(line.text)
  let shared = 0
  for (const s of contentStems(unit.text)) if (want.has(s) && ++shared >= 2) return true
  return false
}

const RANK: Readonly<Record<Unit['ref']['kind'], number>> = { highlight: 0, project: 1, skill: 2 }

/** The unit that backs a line: a bullet already on the CV first, then any bullet, project, skill. */
export function sourceFor(line: JdLine, units: readonly Unit[], recipe: Recipe): Unit | undefined {
  const by = (pred: (u: Unit) => boolean): Unit | undefined =>
    units
      .filter(pred)
      .sort((a, b) => Number(inRecipe(recipe, b.ref)) - Number(inRecipe(recipe, a.ref)) || RANK[a.ref.kind] - RANK[b.ref.kind])[0]
  return by((u) => backs(u, line)) ?? by((u) => u.ref.kind !== 'skill' && overlaps(u, line))
}

function statusOf(s: string): ReqStatus {
  return s === 'met' || s === 'partial' ? s : 'missing'
}

export function buildChecklist(jd: ParsedJd, units: readonly Unit[], cv: VariantEvidence, recipe: Recipe): ChecklistItem[] {
  const profile = unitsEvidence(units)
  const seen = new Set<string>()
  const out: ChecklistItem[] = []
  let must = 0
  let nice = 0
  for (const line of [...jd.must, ...jd.nice]) {
    const key = line.text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const check = checkLine(line, profile)
    if (check.status === 'unchecked') continue
    if (check.weight === 'must' ? must >= MAX_MUST : nice >= MAX_NICE) continue
    if (check.weight === 'must') must++
    else nice++
    const source = check.status === 'missing' ? undefined : sourceFor(line, units, recipe)
    out.push({
      id: requirementId(line.text),
      text: check.text,
      weight: check.weight,
      status: check.status,
      inCv: statusOf(checkLine(line, cv).status),
      ...(source ? { evidence: excerpt(source.text, 110), source: source.ref } : {}),
      skills: [...line.skills],
    })
  }
  return out
}

/** Must-have counts of a checklist read against `which` side. */
export function coverageOf(items: readonly ChecklistItem[], which: 'status' | 'inCv'): Coverage {
  const c = { met: 0, partial: 0, missing: 0, total: 0 }
  for (const i of items) {
    if (i.weight !== 'must') continue
    c.total++
    c[i[which]]++
  }
  return c
}

/** Re-read the checklist against another CV's evidence (the tailored one). */
export function recheck(jd: ParsedJd, items: readonly ChecklistItem[], cv: VariantEvidence): ChecklistItem[] {
  const lines = new Map([...jd.must, ...jd.nice].map((l) => [requirementId(l.text), l] as const))
  return items.map((i) => {
    const line = lines.get(i.id)
    return line ? { ...i, inCv: statusOf(checkLine(line, cv).status) } : i
  })
}
