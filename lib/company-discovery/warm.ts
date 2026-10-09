import { companyKey } from '@/lib/integrations/linkedin/company-key'
import type { CompanyCandidate } from './types'

/**
 * Warm-intro hints from the user's own LinkedIn connections (the export
 * they imported): how many people they know at a company, matched on the
 * normalized company name as a whole-word prefix either way ("careem" ~
 * "careem networks"), the same rule as the referral hint. Pure.
 */

export interface CompanyCount {
  key: string
  company: string
  n: number
}

/** Connections at `name`, from the per-company counts. */
export function connectionsAt(name: string, counts: readonly CompanyCount[]): number {
  const key = companyKey(name)
  if (!key) return 0
  let n = 0
  for (const c of counts) {
    if (c.key === key || c.key.startsWith(`${key} `) || key.startsWith(`${c.key} `)) n += c.n
  }
  return n
}

/** Generic employer words that never make a company on their own. */
const NOT_A_COMPANY = /^(self[- ]employed|freelance(?:r)?|stealth(?: startup)?|student|unemployed|retired|confidential|n\/?a|none|-+)$/i

/**
 * Companies the user knows at least `min` people at, as candidates
 * (region unknown: the connection export has no location). Capped.
 */
export function linkedinCandidates(counts: readonly CompanyCount[], min = 2, cap = 30): CompanyCandidate[] {
  return counts
    .filter((c) => c.n >= min && !NOT_A_COMPANY.test(c.company.trim()))
    .slice(0, cap)
    .map((c) => ({
      name: c.company.trim(),
      regionIds: [],
      industries: [],
      sourceTags: ['linkedin'],
      evidence: { connections: c.n },
    }))
}
