import { normalizeForMatch } from '@/lib/discovery/relevance/text'

/**
 * The "before you apply" checklist for a posting. Pure and deterministic
 * (no AI): where to apply (the posting or ATS link), the documents the
 * posting asks for, and the questions it asks applicants to answer.
 */

export interface ChecklistItem {
  /** Stable id, stored when ticked (progress.checklist.checked). */
  id: string
  label: string
  detail?: string
  href?: string
}

export interface ApplyChecklist {
  where: ChecklistItem
  documents: ChecklistItem[]
  questions: ChecklistItem[]
}

const ATS_HOSTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/(^|\.)greenhouse\.io$/, 'Greenhouse'],
  [/(^|\.)lever\.co$/, 'Lever'],
  [/(^|\.)ashbyhq\.com$/, 'Ashby'],
  [/(^|\.)workable\.com$/, 'Workable'],
  [/(^|\.)myworkdayjobs\.com$/, 'Workday'],
  [/(^|\.)smartrecruiters\.com$/, 'SmartRecruiters'],
  [/(^|\.)recruitee\.com$/, 'Recruitee'],
  [/(^|\.)bamboohr\.com$/, 'BambooHR'],
  [/(^|\.)zohorecruit\.com$/, 'Zoho Recruit'],
  [/(^|\.)linkedin\.com$/, 'LinkedIn'],
  [/(^|\.)indeed\.com$/, 'Indeed'],
  [/(^|\.)naukri(gulf)?\.com$/, 'Naukri'],
  [/(^|\.)bayt\.com$/, 'Bayt'],
  [/(^|\.)wellfound\.com$/, 'Wellfound'],
]

/** "Greenhouse" for a Greenhouse link, "Company site" otherwise; null for a bad URL. */
export function applyChannel(url: string | null | undefined): { url: string; label: string } | null {
  if (!url) return null
  let host: string
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    host = u.hostname.toLowerCase()
  } catch {
    return null
  }
  const ats = ATS_HOSTS.find(([re]) => re.test(host))
  return { url, label: ats ? ats[1] : 'Company site' }
}

const DOCUMENTS: ReadonlyArray<readonly [string, string, RegExp]> = [
  ['cover_letter', 'Cover letter', /\bcover(?:ing)? letter\b|\bmotivation(?:al)? letter\b/],
  ['portfolio', 'Portfolio or case studies', /\bportfolio\b|\bcase stud(?:y|ies)\b/],
  ['github', 'GitHub or code samples', /\bgithub\b|\bcode samples?\b|\bsample code\b/],
  ['references', 'References', /\breferences?\b(?! to)|\breferees?\b/],
  ['certificates', 'Degree or certificates', /\b(?:degree|educational|academic) certificates?\b|\btranscripts?\b|\battested\b/],
  ['passport', 'Passport or visa copy', /\bpassport\b|\bvisa copy\b|\bcopy of (?:your )?visa\b/],
  ['photo', 'Photo', /\b(?:passport[\s-]size )?photo(?:graph)?\b/],
  ['salary', 'Expected salary', /\b(?:expected|current|desired) (?:salary|ctc|compensation)\b|\bsalary expectations?\b/],
  ['notice', 'Notice period', /\bnotice period\b|\bavailability to (?:join|start)\b/],
]

const DESCRIPTION_WINDOW = 12_000
const MAX_QUESTIONS = 5
const MAX_QUESTION_LENGTH = 180

/** Documents the posting mentions; a CV is always on the list. */
export function requiredDocuments(description: string): ChecklistItem[] {
  const text = normalizeForMatch(description.slice(0, DESCRIPTION_WINDOW))
  const found = DOCUMENTS.filter(([, , re]) => re.test(text)).map(([id, label]) => ({ id: `doc:${id}`, label }))
  return [{ id: 'doc:cv', label: 'CV (your tailored version)' }, ...found]
}

/** Strip light Markdown so a question reads as plain text. */
function plain(line: string): string {
  return line
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/[*_`#>]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Questions the posting asks applicants (lines or sentences ending in "?"). */
export function postingQuestions(description: string): ChecklistItem[] {
  const text = description.slice(0, DESCRIPTION_WINDOW)
  const sentences = text
    .split(/\n+/)
    .flatMap((line) => plain(line).split(/(?<=[?.!])\s+/))
    .map((s) => s.trim())
    .filter((s) => s.endsWith('?') && s.length >= 12 && s.length <= MAX_QUESTION_LENGTH)
  // "Are you ready…?" style marketing lines are not questions for the applicant.
  const asks = sentences.filter((s) => !/^(?:are you (?:ready|looking|passionate)|why (?:join|work)|what'?s in it)/i.test(s))
  const seen = new Set<string>()
  const out: ChecklistItem[] = []
  for (const q of asks) {
    const key = q.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ id: `q:${out.length + 1}`, label: q })
    if (out.length >= MAX_QUESTIONS) break
  }
  return out
}

export function buildChecklist(job: { applyUrl: string | null; description: string | null }): ApplyChecklist {
  const channel = applyChannel(job.applyUrl)
  return {
    where: channel
      ? { id: 'apply', label: `Apply on ${channel.label}`, href: channel.url }
      : { id: 'apply', label: 'Find where to apply', detail: 'The posting has no link; check the company careers page.' },
    documents: requiredDocuments(job.description ?? ''),
    questions: postingQuestions(job.description ?? ''),
  }
}

/** Every item id, for the "all done" check. */
export function checklistIds(list: ApplyChecklist): string[] {
  return [list.where.id, ...list.documents.map((d) => d.id), ...list.questions.map((q) => q.id)]
}
