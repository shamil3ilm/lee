/**
 * How the application is sent, for photo conventions: an ATS form
 * (Greenhouse, Lever, Workday …) parses text and a photo adds nothing; an
 * email to a recruiter is read as a document, as in most GCC hiring.
 */

export type ChannelKind = 'ats' | 'email' | 'unknown'

export interface ChannelInfo {
  kind: ChannelKind
  label: string
}

export interface ChannelInput {
  applyUrl?: string | null
  descriptionMd?: string | null
}

const ATS_HOSTS: ReadonlyArray<[RegExp, string]> = [
  [/(^|\.)greenhouse\.io$/, 'an ATS form'],
  [/(^|\.)lever\.co$/, 'an ATS form'],
  [/(^|\.)myworkdayjobs\.com$|(^|\.)workday\.com$/, 'an ATS form'],
  [/(^|\.)ashbyhq\.com$/, 'an ATS form'],
  [/(^|\.)smartrecruiters\.com$/, 'an ATS form'],
  [/(^|\.)icims\.com$/, 'an ATS form'],
  [/(^|\.)taleo\.net$/, 'an ATS form'],
  [/(^|\.)successfactors\.(?:com|eu)$|(^|\.)sapsf\.(?:com|eu)$/, 'an ATS form'],
  [/(^|\.)oraclecloud\.com$/, 'an ATS form'],
  [/(^|\.)workable\.com$/, 'an ATS form'],
  [/(^|\.)bamboohr\.com$/, 'an ATS form'],
  [/(^|\.)recruitee\.com$/, 'an ATS form'],
]

const EMAIL_IN_TEXT = /\b(?:send|email|e-mail|mail|forward|submit)\b[^.\n]{0,60}?\b(?:cv|resume|résumé|application)\b[^.\n]{0,40}?[\w.+-]+@[\w-]+\.[\w.-]+/i
const EMAIL_FIRST = /[\w.+-]+@[\w-]+\.[\w.-]+[^.\n]{0,30}?\b(?:cv|resume|résumé)\b/i

function host(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function applyChannel(job: ChannelInput): ChannelInfo {
  const url = job.applyUrl?.trim() ?? ''
  if (/^mailto:/i.test(url)) return { kind: 'email', label: 'an email to the recruiter' }
  const h = url ? host(url) : null
  if (h) for (const [re, label] of ATS_HOSTS) if (re.test(h)) return { kind: 'ats', label }
  const text = (job.descriptionMd ?? '').slice(0, 8_000)
  if (EMAIL_IN_TEXT.test(text) || EMAIL_FIRST.test(text)) return { kind: 'email', label: 'an email to the recruiter' }
  return { kind: 'unknown', label: '' }
}
