import type { AllowListEntry, AllowListKind } from '@/lib/db/queries/scamAllowList'
import {
  MESSAGING_HOSTS,
  URL_SHORTENERS,
  hostOf,
  isFreemail,
  isJobPlatform,
  normalizeCompanyName,
  registrableDomain,
} from './domains'
import type { ScamInput, ScamSignal } from './types'

/**
 * v17 §1 — pure allow-list matching. A "not a scam" verdict remembers the
 * posting's own domains and its company name. Domain entries match
 * directly; a company-name entry is ignored when the posting shows
 * impersonation signs (lookalike domain, free-mail claiming a big brand),
 * so a scammer cannot borrow a trusted name.
 */

const IMPERSONATION = new Set(['sender.lookalike_domain'])

function ownDomains(input: ScamInput, includeClaimed = true): string[] {
  const hosts = [
    includeClaimed ? hostOf(input.companyDomain) : null,
    hostOf(input.applyUrl),
    hostOf(input.applyEmail),
  ]
  const out = new Set<string>()
  for (const h of hosts) {
    if (!h) continue
    if (isFreemail(h) || isJobPlatform(h) || MESSAGING_HOSTS.has(h) || URL_SHORTENERS.has(h)) continue
    out.add(registrableDomain(h))
  }
  return [...out]
}

/** Entries to remember when the user says "not a scam". */
export function allowListEntriesFor(input: ScamInput): Array<{ kind: AllowListKind; value: string }> {
  const entries: Array<{ kind: AllowListKind; value: string }> = ownDomains(input).map((d) => ({
    kind: 'domain',
    value: d,
  }))
  const company = input.company ? normalizeCompanyName(input.company) : ''
  if (company) entries.push({ kind: 'company', value: company })
  return entries
}

export function matchesAllowList(
  input: ScamInput,
  signals: readonly ScamSignal[],
  entries: readonly Pick<AllowListEntry, 'kind' | 'value'>[],
): boolean {
  if (entries.length === 0) return false
  const impersonating = signals.some(
    (s) => IMPERSONATION.has(s.id) || (s.id === 'sender.freemail_recruiter' && s.weight > 15),
  )
  const domains = new Set(entries.filter((e) => e.kind === 'domain').map((e) => e.value))
  // A claimed company domain only counts when nothing suggests impersonation;
  // the apply link / email the candidate would actually use always counts.
  if (ownDomains(input, !impersonating).some((d) => domains.has(d))) return true
  if (impersonating) return false
  const company = input.company ? normalizeCompanyName(input.company) : ''
  return company !== '' && entries.some((e) => e.kind === 'company' && e.value === company)
}
