/**
 * Client-safe, pure. The LinkedIn profile checklist (v16 §4.2): compares
 * the imported LinkedIn headline, About and positions with the master
 * profile and the target role families. LinkedIn profile edits are manual
 * (no API allows them), so every item is advice with a reason.
 */

export const HEADLINE_MAX = 220
export const ABOUT_MAX = 2600
export const ABOUT_GOOD_MIN = 1000

export type CheckStatus = 'pass' | 'warn' | 'info'

export interface CheckItem {
  id: string
  status: CheckStatus
  title: string
  detail: string
}

export interface OptimizerInput {
  headline: string
  about: string
  positions: ReadonlyArray<{ company: string; title: string }>
  /** Target role family labels ("Backend", "Payments"). */
  targetRoles: readonly string[]
  /** Keywords the master profile backs (ready skills). */
  keywords: readonly string[]
  /** Master-profile work: company + position. */
  cvWork: ReadonlyArray<{ company: string; position: string }>
  portfolioUrl: string
  caseStudyUrls: readonly string[]
  /** GCC country focus (the user's search regions). */
  gcc: boolean
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim()
const contains = (hay: string, needle: string): boolean => ` ${norm(hay)} `.includes(` ${norm(needle)} `)

export function headlineKeywordHits(headline: string, keywords: readonly string[]): string[] {
  return keywords.filter((k) => contains(headline, k))
}

export function buildChecklist(input: OptimizerInput): CheckItem[] {
  const items: CheckItem[] = []
  const roleHit = input.targetRoles.find((r) => contains(input.headline, r))
  const kwHits = headlineKeywordHits(input.headline, input.keywords)
  items.push({
    id: 'headline_role',
    status: input.targetRoles.length === 0 ? 'info' : roleHit ? 'pass' : 'warn',
    title: 'Headline names your target role',
    detail:
      input.targetRoles.length === 0
        ? 'Set target roles in Settings › Search to check this.'
        : roleHit
          ? `It mentions “${roleHit}”.`
          : `Recruiters search by title: lead with ${input.targetRoles.slice(0, 2).join(' or ')}.`,
  })
  items.push({
    id: 'headline_keywords',
    status: kwHits.length >= 2 ? 'pass' : 'warn',
    title: 'Headline carries 2–4 skills you can back',
    detail: kwHits.length > 0 ? `Found: ${kwHits.slice(0, 4).join(', ')}.` : `None of your ready skills appear. Candidates: ${input.keywords.slice(0, 5).join(', ') || '(mark skills ready in Résumé)'}.`,
  })
  items.push({
    id: 'headline_length',
    status: input.headline.length === 0 ? 'warn' : input.headline.length <= HEADLINE_MAX ? 'pass' : 'warn',
    title: `Headline within ${HEADLINE_MAX} characters`,
    detail: input.headline.length === 0 ? 'No headline in the export.' : `${input.headline.length} characters.`,
  })
  const aboutLen = input.about.length
  items.push({
    id: 'about_length',
    status: aboutLen >= ABOUT_GOOD_MIN && aboutLen <= ABOUT_MAX ? 'pass' : 'warn',
    title: `About is ${ABOUT_GOOD_MIN.toLocaleString('en-US')}–${ABOUT_MAX.toLocaleString('en-US')} characters`,
    detail: aboutLen === 0 ? 'Your About section is empty.' : `${aboutLen.toLocaleString('en-US')} characters. The first two lines show before “see more”: make them stand alone.`,
  })
  const linksPortfolio = input.portfolioUrl ? contains(input.about, input.portfolioUrl) || input.about.includes(input.portfolioUrl) : false
  items.push({
    id: 'featured_links',
    status: !input.portfolioUrl ? 'info' : linksPortfolio ? 'pass' : 'warn',
    title: 'Featured: portfolio and case studies',
    detail: input.portfolioUrl
      ? `Add your portfolio (${input.portfolioUrl})${input.caseStudyUrls.length > 0 ? ` and ${input.caseStudyUrls.length} case stud${input.caseStudyUrls.length === 1 ? 'y' : 'ies'}` : ''} to the Featured section; LinkedIn has no API for it, so add them by hand.`
      : 'Set your portfolio URL in Résumé › Basics to get Featured advice.',
  })
  const onLinkedIn = new Set(input.positions.map((p) => norm(p.company)))
  const missing = input.cvWork.filter((w) => !onLinkedIn.has(norm(w.company)))
  items.push({
    id: 'positions_match',
    status: input.cvWork.length === 0 ? 'info' : missing.length === 0 ? 'pass' : 'warn',
    title: 'Experience matches your CV',
    detail: missing.length === 0 ? 'Every CV employer is on LinkedIn.' : `On your CV but not on LinkedIn: ${missing.map((m) => m.company).slice(0, 4).join(', ')}.`,
  })
  items.push({
    id: 'open_to_work',
    status: 'info',
    title: 'Open to Work: recruiters only or public',
    detail: input.gcc
      ? 'For GCC searches, “Recruiters only” is the usual choice while employed: it is visible to LinkedIn Recruiter users (not reliably hidden from your own company’s recruiters). Choose “All LinkedIn members” (the green frame) only if your employer already knows. Add job titles and the GCC cities you target, and “Remote”.'
      : '“Recruiters only” keeps the signal off your public profile; “All LinkedIn members” adds the green frame. Add titles and locations either way.',
  })
  return items
}
