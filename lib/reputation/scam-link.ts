import * as repQ from '@/lib/db/queries/companyReputation'
import type { ConfirmedCompany } from '@/lib/db/queries/companyReputation'
import { hostOf, normalizeCompanyName, registrableDomain } from '@/lib/scam/domains'
import type { ReputationContext, ReputationFlag, ScamInput } from '@/lib/scam/types'
import type { ConfirmedSummary } from './types'

/**
 * Confirmed reputation → Scam Shield context. Only red flags the user
 * confirmed in the fraud or unpaid-salaries categories count. A posting is
 * matched to a company by normalised name or registrable domain.
 */

export type ReputationLookup = (input: ScamInput) => ReputationContext | null

export function scamFlagsOf(summary: ConfirmedSummary | null): ReputationFlag[] {
  if (!summary) return []
  return summary.redFlags.flatMap((f): ReputationFlag[] => {
    if (f.category === 'fraud') return [{ category: 'fraud', text: f.text }]
    if (f.category === 'unpaid_salaries') return [{ category: 'wage_theft', text: f.text }]
    return []
  })
}

function domainKey(value: string | null | undefined): string | null {
  const host = hostOf(value)
  return host ? registrableDomain(host) : null
}

export function buildReputationLookup(confirmed: readonly ConfirmedCompany[]): ReputationLookup {
  const entries = confirmed
    .map((c) => ({
      name: normalizeCompanyName(c.name),
      domain: domainKey(c.domain),
      flags: scamFlagsOf(c.record.summary),
    }))
    .filter((e) => e.flags.length > 0)
  if (entries.length === 0) return () => null
  return (input) => {
    const name = input.company ? normalizeCompanyName(input.company) : ''
    const domain = domainKey(input.companyDomain)
    const hit = entries.find((e) => (name !== '' && e.name === name) || (domain !== null && e.domain === domain))
    return hit ? { flags: hit.flags } : null
  }
}

export async function loadReputationLookup(userId: string): Promise<ReputationLookup> {
  return buildReputationLookup(await repQ.listConfirmed(userId))
}
