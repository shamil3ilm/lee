import { normalizeForMatch } from './text'

/**
 * Seniority levels, lowest to highest. A title's level is its highest
 * marker ("Senior Associate" → senior, "Associate Director" → director).
 * An unmarked title ("Backend Engineer") has no level and never fails the
 * seniority rule.
 */
export const SENIORITY_LEVELS = [
  'intern',
  'junior',
  'mid',
  'senior',
  'lead',
  'staff',
  'principal',
  'manager',
  'head',
  'director',
  'executive',
] as const
export type SeniorityLevel = (typeof SENIORITY_LEVELS)[number]

export const SENIORITY_LABELS: Readonly<Record<SeniorityLevel, string>> = {
  intern: 'Intern',
  junior: 'Junior',
  mid: 'Mid-level',
  senior: 'Senior',
  lead: 'Lead',
  staff: 'Staff',
  principal: 'Principal',
  manager: 'Manager',
  head: 'Head',
  director: 'Director',
  executive: 'VP / C-level',
}

export function isSeniorityLevel(v: unknown): v is SeniorityLevel {
  return typeof v === 'string' && (SENIORITY_LEVELS as readonly string[]).includes(v)
}

const RANK = new Map(SENIORITY_LEVELS.map((l, i) => [l, i] as const))

/** Title patterns per level, on normalized (lower-case) titles. */
const MARKERS: ReadonlyArray<{ level: SeniorityLevel; re: RegExp }> = [
  { level: 'intern', re: /\b(?:intern|internship|werkstudent|praktikant)\b/ },
  {
    level: 'junior',
    re: /\b(?:junior|jr|entry[\s-]?level|graduate|grad|trainee|apprentice|fresher|associate|beginner)\b/,
  },
  { level: 'mid', re: /\b(?:mid|mid[\s-]?level|intermediate|medior)\b/ },
  { level: 'senior', re: /\b(?:senior|sr|snr|seasoned)\b/ },
  { level: 'lead', re: /\b(?:lead|tech lead|team lead|leader|tlm)\b/ },
  { level: 'staff', re: /\bstaff\b/ },
  { level: 'principal', re: /\b(?:principal|distinguished|fellow)\b/ },
  { level: 'manager', re: /\b(?:manager|mgr)\b/ },
  { level: 'head', re: /\bhead\b/ },
  { level: 'director', re: /\b(?:director|directeur)\b/ },
  { level: 'executive', re: /\b(?:vp|svp|evp|vice president|chief|cto|ceo|cfo|coo|cio|ciso|cpo|founder|co-founder)\b/ },
]

/** "Software Engineer II", "SDE 1", "Developer III" style ladders. */
const LADDER = /\b(?:engineer|developer|sde|swe|programmer|analyst|consultant|specialist|technician|tester)\s*(iv|iii|ii|i|[1-4])\b/

const LADDER_LEVEL: Readonly<Record<string, SeniorityLevel>> = {
  i: 'junior',
  '1': 'junior',
  ii: 'mid',
  '2': 'mid',
  iii: 'senior',
  '3': 'senior',
  iv: 'staff',
  '4': 'staff',
}

/** Phrases that contain a marker word without meaning seniority. */
const NOT_SENIORITY = [
  /\bmember of (?:the )?technical staff\b/g,
  /\blead (?:generation|gen)\b/g,
  /\bstaff(?:ing)? (?:accountant|nurse|agency|augmentation)\b/g,
  /\bsenior (?:living|care|citizens?)\b/g,
  /\bassociate'?s degree\b/g,
  /\bhead(?:quarters|hunter|count|set)\b/g,
]

/**
 * "3+ years of experience", "2–4 years' experience", "experience: 5 years",
 * "minimum 5 years". Only phrases tied to experience count, so "founded 10
 * years ago" is ignored.
 */
const YEARS_PATTERNS: readonly RegExp[] = [
  /(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|to)\s*\d{1,2}\s*)?\+?\s*(?:years?|yrs?)'?\s+(?:of\s+)?(?:[a-z/+#.-]+\s+){0,4}?(?:experience|exp)\b/g,
  /\bexperience\s*(?:of|:|-)?\s*(?:at least|minimum(?: of)?|min)?\s*(\d{1,2})\s*\+?\s*(?:(?:-|to)\s*\d{1,2}\s*)?(?:years?|yrs?)\b/g,
  /\b(?:at least|minimum(?: of)?|min)\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/g,
  // "2+ years as a data analyst", "1–3 years in Laravel", "3 years working with PHP".
  /\b(\d{1,2})\s*\+?\s*(?:(?:-|to)\s*\d{1,2}\s*)?\+?\s*(?:years?|yrs?)\s+(?:as an?|in|working (?:as|in|with|on))\s/g,
]

/**
 * The smallest "years of experience" lower bound a description asks for,
 * or null. The smallest wins so "3+ years of PHP, 5+ years overall" reads
 * as 3 (the gate only filters on clear evidence).
 */
export function detectYearsRequired(description: string | null | undefined): number | null {
  const text = normalizeForMatch((description ?? '').slice(0, 8_000))
  let min: number | null = null
  for (const re of YEARS_PATTERNS) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n >= 1 && n <= 20) min = min === null ? n : Math.min(min, n)
    }
  }
  return min
}

/** Level implied by a years-of-experience requirement. */
export function levelForYears(years: number): SeniorityLevel {
  if (years <= 1) return 'junior'
  if (years <= 4) return 'mid'
  if (years <= 7) return 'senior'
  return 'staff'
}

/** True when `level` sits above every selected level. */
export function isAboveSelected(level: SeniorityLevel, selected: readonly SeniorityLevel[]): boolean {
  if (selected.length === 0) return false
  const top = Math.max(...selected.map((l) => RANK.get(l) ?? 0))
  return (RANK.get(level) ?? 0) > top
}

/** The highest seniority marker in a job title, or null when unmarked. */
export function detectSeniority(title: string | null | undefined): SeniorityLevel | null {
  let t = normalizeForMatch(title).replace(/[.]/g, ' ')
  for (const re of NOT_SENIORITY) t = t.replace(re, ' ')
  // Gulf and Indian banks, telcos and groups grade mid-career staff as
  // "Assistant / Deputy Manager": a senior individual role, not a manager.
  t = t.replace(/\b(?:assistant|asst|deputy|dy) manager\b/g, ' senior ')
  let best: SeniorityLevel | null = null
  const consider = (level: SeniorityLevel): void => {
    if (best === null || (RANK.get(level) ?? 0) > (RANK.get(best) ?? 0)) best = level
  }
  for (const m of MARKERS) if (m.re.test(t)) consider(m.level)
  const ladder = LADDER.exec(t)
  if (ladder?.[1]) consider(LADDER_LEVEL[ladder[1]] ?? 'mid')
  return best
}
