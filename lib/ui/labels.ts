/**
 * One place that turns machine keys (`score_job`, `company_site`,
 * `cv_requirement_fit`) into words people read. Charts, tables and legends
 * all go through `humanizeLabel`, so a key is spelled the same everywhere.
 *
 * Keys with a better name than their mechanical form live in LABELS; any
 * other key falls back to sentence case ("job_board" → "Job board").
 */
const LABELS: Readonly<Record<string, string>> = {
  // AI call kinds
  score_job: 'Job scoring',
  score_company: 'Company scoring',
  parse_job: 'Job parsing',
  parse_profile: 'Profile import',
  cover_letter: 'Cover letter',
  tailored_cv: 'Tailored CV',
  master_cv: 'Master CV',
  cv_requirement_fit: 'CV requirement fit',
  cv_bullet_rewrite: 'CV bullet rewrite',
  rewrite_bullet: 'Bullet rewrite',
  interview_prep_pack: 'Interview prep',
  interview_debrief: 'Interview debrief',
  company_reputation_summary: 'Company reputation',
  suggest_roles: 'Role suggestions',
  distill_github: 'GitHub summary',
  discovery_scoring: 'Discovery scoring',
  lab_arena: 'Model arena',
  // Application sources
  company_site: 'Company site',
  linkedin: 'LinkedIn',
  referral: 'Referral',
  discovery: 'Discovery',
  // Providers
  gemini: 'Gemini',
  groq: 'Groq',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  signal: 'Signal check',
  heuristic: 'Heuristic',
}

const WORK_MODE_LABELS: Readonly<Record<string, string>> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
  'on-site': 'On-site',
  on_site: 'On-site',
  office: 'On-site',
}

/**
 * Work-mode chip text: "Remote", "Hybrid", "On-site". Returns null for
 * unknown or empty values so callers can skip the chip entirely.
 */
export function workModeLabel(raw: string | null | undefined): string | null {
  if (!raw) return null
  return WORK_MODE_LABELS[raw.trim().toLowerCase()] ?? null
}

/** Acronyms kept upper-case by the sentence-case fallback. */
const ACRONYMS = new Set(['ai', 'cv', 'jd', 'url', 'pdf', 'api', 'hn', 'yc', 'ats'])

/** "job_board" / "job-board" / "jobBoard" → "Job board". */
function sentenceCase(raw: string): string {
  const words = raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase())
  return words
    .map((w, i) => (ACRONYMS.has(w) ? w.toUpperCase() : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/**
 * Display label for a machine key. Known keys use the map; anything else is
 * sentence-cased. Already human text ("Netflix", "Sep 27") passes through.
 */
export function humanizeLabel(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return ''
  const s = String(raw).trim()
  if (!s) return ''
  const known = LABELS[s.toLowerCase()]
  if (known) return known
  // Only rewrite keys that look like identifiers; leave prose alone.
  if (!/^[a-z][a-z0-9]*([_-][a-z0-9]+)*$/.test(s) && !/^[a-z]+[A-Z][A-Za-z]*$/.test(s)) return s
  return sentenceCase(s)
}
