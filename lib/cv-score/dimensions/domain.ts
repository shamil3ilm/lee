/**
 * v12.0 — Domain / industry match (Experience Match component).
 *
 * Industries are detected by keyword from the JD (title, company, description)
 * and from the CV text + profile.industries. Overlap → 100, related industry
 * → 60, unrelated → 25. Skipped when the JD's industry can't be detected.
 */
import { makeFinding } from '../findings'
import type { DimensionResult, JobTarget, ScorableCv, ScoreContext, SkippedDimension } from '../types'

export const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  fintech: ['fintech', 'payments', 'payment', 'banking', 'bank', 'lending', 'credit card', 'ledger', 'remittance', 'wallet', 'neobank', 'regtech', 'kyc', 'aml', 'invoicing', 'cheque', 'checks', 'payroll', 'trading', 'brokerage'],
  crypto: ['crypto', 'cryptocurrency', 'blockchain', 'web3', 'defi'],
  insurance: ['insurance', 'insurtech', 'underwriting'],
  healthcare: ['healthcare', 'health tech', 'healthtech', 'medical', 'clinical', 'patient', 'hospital', 'pharma', 'biotech'],
  ecommerce: ['e-commerce', 'ecommerce', 'retail', 'marketplace', 'checkout', 'shopping'],
  logistics: ['logistics', 'supply chain', 'fleet', 'ride-hailing', 'mobility', 'dispatch', 'last-mile', 'shipping'],
  adtech: ['adtech', 'ad tech', 'advertising', 'programmatic', 'martech', 'marketing automation'],
  media: ['media', 'streaming', 'publishing', 'content platform'],
  edtech: ['edtech', 'education technology', 'e-learning', 'learning platform'],
  gaming: ['gaming', 'game studio', 'esports', 'video games'],
  security: ['cybersecurity', 'infosec', 'threat detection', 'security operations'],
  travel: ['travel', 'hospitality', 'airline', 'hotel booking'],
  proptech: ['proptech', 'real estate'],
  saas: ['saas', 'b2b software'],
}

const RELATED: [string, string][] = [
  ['fintech', 'crypto'], ['fintech', 'insurance'], ['crypto', 'insurance'],
  ['ecommerce', 'logistics'], ['adtech', 'media'], ['ecommerce', 'adtech'],
  ['travel', 'ecommerce'], ['saas', 'fintech'],
]

export interface DomainDetails {
  jdIndustries: string[]
  cvIndustries: string[]
  match: 'strong' | 'related' | 'none'
}

function countHits(text: string): Map<string, number> {
  const lower = ` ${text.toLowerCase()} `
  const out = new Map<string, number>()
  for (const [ind, kws] of Object.entries(INDUSTRY_KEYWORDS)) {
    let n = 0
    for (const kw of kws) {
      const re = new RegExp(`(?<![a-z])${kw.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}s?(?![a-z])`, 'g')
      n += (lower.match(re) ?? []).length
    }
    if (n > 0) out.set(ind, n)
  }
  return out
}

/** Industries with ≥2 keyword hits; falls back to single-hit industries. */
export function detectIndustries(text: string): string[] {
  const hits = countHits(text)
  const strong = [...hits.entries()].filter(([, n]) => n >= 2).map(([k]) => k)
  return (strong.length ? strong : [...hits.keys()]).sort()
}

function canonicalIndustry(raw: string): string | undefined {
  const r = raw.toLowerCase().trim()
  if (INDUSTRY_KEYWORDS[r]) return r
  return detectIndustries(r)[0]
}

export function scoreDomain(
  cv: ScorableCv,
  target: JobTarget,
  ctx: Pick<ScoreContext, 'profile'>,
): DimensionResult<DomainDetails> | SkippedDimension {
  const jdIndustries = detectIndustries(
    [target.title, target.companyName ?? '', target.descriptionMd, target.requirements.join('\n')].join('\n'),
  )
  if (jdIndustries.length === 0) {
    return { skipped: true, code: 'no_jd_industry', reason: "Couldn't detect the job's industry from its description." }
  }
  const cvSet = new Set<string>(detectIndustries(cv.plainText))
  for (const p of ctx.profile?.industries ?? []) {
    const c = canonicalIndustry(p)
    if (c) cvSet.add(c)
  }
  const cvIndustries = [...cvSet].sort()
  let match: DomainDetails['match'] = 'none'
  if (jdIndustries.some((j) => cvSet.has(j))) match = 'strong'
  else if (jdIndustries.some((j) => cvIndustries.some((c) => RELATED.some(([a, b]) => (a === j && b === c) || (a === c && b === j))))) {
    match = 'related'
  }
  const score = match === 'strong' ? 100 : match === 'related' ? 60 : 25
  const findings = match === 'strong'
    ? []
    : [
        makeFinding('domain', {
          severity: 'minor',
          message: match === 'related'
            ? `The role is in ${jdIndustries.join('/')}; your background (${cvIndustries.join(', ')}) is adjacent`
            : `The role is in ${jdIndustries.join('/')}; your CV doesn't show experience in that industry`,
          suggestion: 'Highlight transferable domain experience (regulation, scale, similar customers) in your summary.',
        }),
      ]
  return { score, details: { jdIndustries, cvIndustries, match }, findings }
}
