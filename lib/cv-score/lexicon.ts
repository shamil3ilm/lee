/**
 * v12.0 — word lists used by the deterministic dimensions. Changing any list
 * changes scores → bump SCORER_VERSION.
 */

/** Strong action verbs (past tense) with their present/base forms. */
const VERB_PAIRS: [past: string, base: string][] = [
  ['achieved', 'achieve'], ['accelerated', 'accelerate'], ['architected', 'architect'],
  ['automated', 'automate'], ['boosted', 'boost'], ['built', 'build'],
  ['championed', 'champion'], ['consolidated', 'consolidate'], ['created', 'create'],
  ['cut', 'cut'], ['debugged', 'debug'], ['decreased', 'decrease'],
  ['defined', 'define'], ['delivered', 'deliver'], ['deployed', 'deploy'],
  ['designed', 'design'], ['developed', 'develop'], ['devised', 'devise'],
  ['diagnosed', 'diagnose'], ['directed', 'direct'], ['doubled', 'double'],
  ['drove', 'drive'], ['eliminated', 'eliminate'], ['enabled', 'enable'],
  ['engineered', 'engineer'], ['established', 'establish'], ['expanded', 'expand'],
  ['expedited', 'expedite'], ['founded', 'found'], ['generated', 'generate'],
  ['grew', 'grow'], ['halved', 'halve'], ['hired', 'hire'],
  ['implemented', 'implement'], ['improved', 'improve'], ['increased', 'increase'],
  ['initiated', 'initiate'], ['instituted', 'institute'], ['integrated', 'integrate'],
  ['introduced', 'introduce'], ['invented', 'invent'], ['launched', 'launch'],
  ['led', 'lead'], ['lowered', 'lower'], ['maintained', 'maintain'],
  ['managed', 'manage'], ['mentored', 'mentor'], ['migrated', 'migrate'],
  ['modernized', 'modernize'], ['negotiated', 'negotiate'], ['optimized', 'optimize'],
  ['orchestrated', 'orchestrate'], ['overhauled', 'overhaul'], ['owned', 'own'],
  ['pioneered', 'pioneer'], ['prototyped', 'prototype'], ['rebuilt', 'rebuild'],
  ['redesigned', 'redesign'], ['reduced', 'reduce'], ['refactored', 'refactor'],
  ['replaced', 'replace'], ['resolved', 'resolve'], ['restructured', 'restructure'],
  ['revamped', 'revamp'], ['saved', 'save'], ['scaled', 'scale'],
  ['secured', 'secure'], ['shipped', 'ship'], ['simplified', 'simplify'],
  ['slashed', 'slash'], ['spearheaded', 'spearhead'], ['standardized', 'standardize'],
  ['streamlined', 'streamline'], ['strengthened', 'strengthen'], ['tripled', 'triple'],
  ['transformed', 'transform'], ['unified', 'unify'], ['upgraded', 'upgrade'],
  ['wrote', 'write'], ['authored', 'author'], ['coached', 'coach'],
  ['analyzed', 'analyze'], ['instrumented', 'instrument'], ['partnered', 'partner'],
]

export const STRONG_VERBS_PAST = new Set(VERB_PAIRS.map(([p]) => p))
export const STRONG_VERBS_BASE = new Set(VERB_PAIRS.map(([, b]) => b))
export const BASE_TO_PAST = new Map(VERB_PAIRS.map(([p, b]) => [b, p]))

/** Openers that describe duties rather than outcomes. */
export const WEAK_OPENERS: readonly string[] = [
  'responsible for',
  'worked on',
  'worked with',
  'helped',
  'helped to',
  'involved in',
  'assisted',
  'assisted with',
  'participated in',
  'tasked with',
  'in charge of',
  'duties included',
  'handled',
  'was part of',
  'part of',
  'contributed to',
]

/** Scope / leadership signals used for seniority alignment. */
export const SCOPE_SIGNALS: readonly string[] = [
  'led', 'lead', 'leading', 'architected', 'architect', 'owned', 'own', 'owning',
  'mentored', 'mentor', 'mentoring', 'scaled', 'scale', 'designed', 'design',
  'managed', 'manage', 'spearheaded', 'drove', 'hired', 'coached', 'founded',
  'directed', 'established', 'championed', 'defined',
]

/** Scale words that count as quantification even without digits. */
export const SCALE_WORDS = /\b(doubled|tripled|quadrupled|halved|thousands|millions|billions|hundreds|dozens|fold|x faster|zero[- ]downtime)\b/i

/** Seniority ladder → minimum expected years + expected scope signals. */
export const SENIORITY_LADDER: Record<string, { minYears: number; scope: number; rank: number }> = {
  intern: { minYears: 0, scope: 0, rank: 0 },
  junior: { minYears: 0, scope: 0, rank: 1 },
  mid: { minYears: 2, scope: 1, rank: 2 },
  senior: { minYears: 5, scope: 3, rank: 3 },
  lead: { minYears: 6, scope: 4, rank: 4 },
  manager: { minYears: 6, scope: 4, rank: 4 },
  staff: { minYears: 8, scope: 5, rank: 5 },
  principal: { minYears: 10, scope: 6, rank: 6 },
  director: { minYears: 10, scope: 6, rank: 6 },
}

/** Map free-form seniority strings / titles to a ladder key. */
export function seniorityKey(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  const s = raw.toLowerCase()
  if (/\b(intern|internship|trainee)\b/.test(s)) return 'intern'
  if (/\b(principal|distinguished)\b/.test(s)) return 'principal'
  if (/\b(director|head of|vp)\b/.test(s)) return 'director'
  if (/\bstaff\b/.test(s)) return 'staff'
  if (/\b(manager|engineering manager|em)\b/.test(s)) return 'manager'
  if (/\b(lead|tech lead)\b/.test(s)) return 'lead'
  if (/\b(senior|sr\.?)\b/.test(s)) return 'senior'
  if (/\b(junior|jr\.?|graduate|entry|associate)\b/.test(s)) return 'junior'
  if (/\b(mid|intermediate)\b/.test(s)) return 'mid'
  return undefined
}
