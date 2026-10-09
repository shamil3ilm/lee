import { roleFamilyLabel } from '@/lib/discovery/relevance/roles'
import { matchedVia, regionMatch } from '@/lib/regions/selection'
import { preferredHit, preferredPoints, type PreferredRegion } from '@/lib/regions/preferred'
import { shortName } from '@/lib/regions/tree'
import { INDUSTRY_FAMILIES, INDUSTRY_LABELS, isIndustry, type Industry } from './industry'
import { growthFitPoints } from './growth/combine'
import { STAGE_LABELS, type CompanyEvidence, type CompanyStage } from './types'

/**
 * Company fit (0–100): a deterministic, explainable sum of chips, so a
 * company with no open role can still be ranked for a speculative approach.
 * Pure, client-safe.
 *
 *   region      0…22  inside your regions 22 · broader ("India" for a Kerala
 *                     search) 11 · location unknown 7 · elsewhere 0
 *   preferred   +10 top priority / +6 preferred (a starred region)
 *   domain      0…22  an industry that serves your target role families:
 *                     specialist (payments, fintech, banking, e-invoicing,
 *                     ERP, data) 22 · general software 16 · other 7 ·
 *                     industry unknown 11 (neutral: banks, airlines and
 *                     hospitals hire software and data people too)
 *   tech        0…13  GitHub languages you have ready (PHP/Laravel,
 *                     TypeScript, Python…): the top language 13 · any 9 ·
 *                     no public code 6 (neutral, never 0)
 *   size/stage  0…8   your preferred stage 8 · no preference 4 · other 0
 *   hiring      0…15  open roles on its job board 15 · a job board 10 · a
 *                     careers page 6 · postings lee saw from it 10
 *   warm intro  0…10  LinkedIn connections at the company
 *   growth      0…10  the growth score ÷ 10, pulled toward the neutral 5 by
 *                     its confidence (high full · medium 0.7 · low 0.4);
 *                     unknown growth is the neutral 5, never 0
 *   government        public-sector or nationals-first: capped at 10
 * The total is capped at 100. No part counts fame: a seed-catalog entry,
 * a Wikidata item or press coverage adds nothing by itself.
 */

export const COMPANY_FIT_WEIGHTS = {
  regionIn: 22,
  regionBroader: 11,
  regionUnknown: 7,
  domainSpecialist: 22,
  domainGeneral: 16,
  domainOther: 7,
  domainNeutral: 11,
  techTop: 13,
  techAny: 9,
  techNeutral: 6,
  stageMatch: 8,
  stageNeutral: 4,
  hiringOpen: 15,
  hiringBoard: 10,
  hiringCareers: 6,
  warmIntro: 10,
  growthMax: 10,
  governmentCap: 10,
} as const

export type FitChipKind = 'region' | 'preferred' | 'domain' | 'tech' | 'stage' | 'hiring' | 'warm' | 'growth' | 'government'

export interface FitChip {
  kind: FitChipKind
  label: string
  points: number
  /** A negative signal (shown in the warning tone). */
  warn?: boolean
}

export interface CompanyFit {
  score: number
  chips: FitChip[]
}

export interface FitCompany {
  name: string
  regionIds: readonly string[]
  industry: readonly string[]
  stage: string | null
  atsKind: string | null
  careersUrl: string | null
  evidence: CompanyEvidence
  /** The stored growth score (lib/company-discovery/growth); absent = unknown. */
  growth?: { score: number | null; confidence: string | null } | null
}

export interface FitContext {
  targetRegions: readonly string[]
  preferredRegions: readonly PreferredRegion[]
  targetFamilies: readonly string[]
  /** Canonical ready skills (lower case). */
  readySkills: readonly string[]
  companyStages: readonly CompanyStage[]
}

const SPECIALIST: ReadonlySet<Industry> = new Set(['payments', 'fintech', 'banking', 'einvoicing', 'erp', 'data'])
const GENERAL: ReadonlySet<Industry> = new Set(['software', 'saas', 'it_services', 'ecommerce'])

/** GitHub language → the ready-skill words that count for it. */
const LANGUAGE_SKILLS: Readonly<Record<string, readonly string[]>> = {
  php: ['php', 'laravel', 'symfony', 'codeigniter'],
  blade: ['laravel', 'php'],
  typescript: ['typescript', 'node', 'node.js', 'nodejs', 'react', 'next.js', 'nestjs', 'angular'],
  javascript: ['javascript', 'node', 'node.js', 'nodejs', 'react', 'vue', 'jquery'],
  vue: ['vue', 'vue.js', 'nuxt'],
  python: ['python', 'django', 'flask', 'fastapi'],
  go: ['go', 'golang'],
  java: ['java', 'spring', 'spring boot'],
  kotlin: ['kotlin', 'android'],
  'c#': ['c#', '.net', 'dotnet', 'asp.net'],
  ruby: ['ruby', 'rails', 'ruby on rails'],
  dart: ['dart', 'flutter'],
  swift: ['swift', 'ios'],
  rust: ['rust'],
  scala: ['scala'],
  elixir: ['elixir', 'phoenix'],
  hcl: ['terraform'],
}

const GOVERNMENT_NAME = /\b(ministry|municipality|government|public authority|general authority|authority for|national guard|armed forces|police|civil service|diwan|amiri)\b|وزارة|هيئة/i

function regionChips(c: FitCompany, ctx: FitContext): FitChip[] {
  const w = COMPANY_FIT_WEIGHTS
  const out: FitChip[] = []
  if (c.regionIds.length === 0) out.push({ kind: 'region', label: 'Location not known', points: w.regionUnknown })
  else if (ctx.targetRegions.length === 0) out.push({ kind: 'region', label: shortName(c.regionIds[0]!), points: w.regionBroader })
  else {
    const fit = regionMatch(c.regionIds, ctx.targetRegions)
    if (fit === 'in') {
      const via = matchedVia(c.regionIds, ctx.targetRegions)
      out.push({ kind: 'region', label: `Region: ${via ? shortName(via) : 'your regions'}`, points: w.regionIn })
    } else if (fit === 'partial') {
      out.push({ kind: 'region', label: `Region: ${shortName(c.regionIds[0]!)} (broader)`, points: w.regionBroader })
    } else out.push({ kind: 'region', label: `Outside your regions`, points: 0, warn: true })
  }
  const hit = preferredHit(c.regionIds, ctx.preferredRegions)
  if (hit) out.push({ kind: 'preferred', label: hit.label, points: preferredPoints(hit, 'company') })
  return out
}

function domainChip(c: FitCompany, ctx: FitContext): FitChip | null {
  const w = COMPANY_FIT_WEIGHTS
  const tags = c.industry.filter(isIndustry)
  // Unknown is neutral: a bank, airline or hospital with no tech industry tag is not a worse fit for it.
  if (tags.length === 0) return { kind: 'domain', label: 'Industry not known (neutral)', points: w.domainNeutral }
  const targets = new Set(ctx.targetFamilies)
  const serving = (i: Industry): string | undefined => INDUSTRY_FAMILIES[i].find((f) => targets.has(f))
  const specialist = tags.find((i) => SPECIALIST.has(i) && serving(i))
  if (specialist) {
    const fam = serving(specialist)!
    return { kind: 'domain', label: `${INDUSTRY_LABELS[specialist]} · fits ${roleFamilyLabel(fam)}`, points: w.domainSpecialist }
  }
  const general = tags.find((i) => GENERAL.has(i) && (targets.size === 0 || serving(i)))
  if (general) return { kind: 'domain', label: INDUSTRY_LABELS[general], points: w.domainGeneral }
  return { kind: 'domain', label: INDUSTRY_LABELS[tags[0]!], points: w.domainOther }
}

function techChip(c: FitCompany, ctx: FitContext): FitChip | null {
  const langs = (c.evidence.languages ?? []).map((l) => l.toLowerCase())
  // No public GitHub code is not a signal against a company (most employers have none): neutral.
  if (langs.length === 0) return { kind: 'tech', label: 'Tech stack not known (neutral)', points: COMPANY_FIT_WEIGHTS.techNeutral }
  const ready = new Set(ctx.readySkills.map((s) => s.toLowerCase()))
  const matches = langs.filter((l) => (LANGUAGE_SKILLS[l] ?? [l]).some((s) => ready.has(s)))
  if (matches.length === 0) return { kind: 'tech', label: `Tech: ${c.evidence.languages!.slice(0, 2).join(', ')}`, points: 0 }
  const shown = c.evidence.languages!.filter((l) => matches.includes(l.toLowerCase())).slice(0, 3).join(', ')
  const top = matches.includes(langs[0]!)
  return { kind: 'tech', label: `Tech: ${shown}`, points: top ? COMPANY_FIT_WEIGHTS.techTop : COMPANY_FIT_WEIGHTS.techAny }
}

function stageChip(c: FitCompany, ctx: FitContext): FitChip | null {
  const stage = c.stage as CompanyStage | null
  if (!stage || !(stage in STAGE_LABELS)) return null
  const w = COMPANY_FIT_WEIGHTS
  if (ctx.companyStages.length === 0) return { kind: 'stage', label: STAGE_LABELS[stage], points: w.stageNeutral }
  return ctx.companyStages.includes(stage)
    ? { kind: 'stage', label: `${STAGE_LABELS[stage]} (your preference)`, points: w.stageMatch }
    : { kind: 'stage', label: STAGE_LABELS[stage], points: 0 }
}

function hiringChip(c: FitCompany): FitChip | null {
  const w = COMPANY_FIT_WEIGHTS
  const open = c.evidence.openRoles
  if (typeof open === 'number' && open > 0) return { kind: 'hiring', label: `Hiring: ${open} open role${open === 1 ? '' : 's'}`, points: w.hiringOpen }
  if (c.atsKind) return { kind: 'hiring', label: typeof open === 'number' ? 'Job board, no openings now' : 'Has a job board', points: typeof open === 'number' ? w.hiringCareers : w.hiringBoard }
  if (c.careersUrl) return { kind: 'hiring', label: 'Careers page', points: w.hiringCareers }
  const seen = c.evidence.jobsSeen ?? 0
  if (seen > 0) return { kind: 'hiring', label: `Posted ${seen} job${seen === 1 ? '' : 's'} you saw`, points: w.hiringBoard }
  return null
}

function warmChip(c: FitCompany): FitChip | null {
  const n = c.evidence.connections ?? 0
  return n > 0 ? { kind: 'warm', label: `Warm intro: ${n} connection${n === 1 ? '' : 's'}`, points: COMPANY_FIT_WEIGHTS.warmIntro } : null
}

function growthChip(c: FitCompany): FitChip {
  const g = c.growth
  const conf = g?.confidence === 'high' || g?.confidence === 'medium' || g?.confidence === 'low' ? g.confidence : null
  const points = growthFitPoints(g?.score ?? null, conf)
  if (g?.score === null || g?.score === undefined || !conf) return { kind: 'growth', label: 'Growth: not enough data (neutral)', points }
  return { kind: 'growth', label: `Growth ${g.score} · ${conf} confidence`, points }
}

/** Public sector or nationals-first (a flag from the source, or an unmistakable name). */
export function isGovernment(c: Pick<FitCompany, 'name' | 'evidence'>): boolean {
  return c.evidence.government === true || GOVERNMENT_NAME.test(c.name)
}

export function companyFit(c: FitCompany, ctx: FitContext): CompanyFit {
  const chips = [
    ...regionChips(c, ctx),
    domainChip(c, ctx),
    techChip(c, ctx),
    stageChip(c, ctx),
    hiringChip(c),
    warmChip(c),
    growthChip(c),
  ].filter((x): x is FitChip => x !== null)
  const total = chips.reduce((s, ch) => s + ch.points, 0)
  if (isGovernment(c)) {
    const cap = COMPANY_FIT_WEIGHTS.governmentCap
    return { score: Math.min(cap, Math.max(0, total)), chips: [{ kind: 'government', label: 'Government / nationals first', points: 0, warn: true }, ...chips] }
  }
  return { score: Math.max(0, Math.min(100, Math.round(total))), chips }
}
