import { buildContext } from './context'
import {
  MESSAGING_HOSTS,
  URL_SHORTENERS,
  hostOf,
  isFreemail,
  isJobPlatform,
  isSameSite,
  registrableDomain,
} from './domains'
import { toFields } from './text'
import type { ScamInput } from './types'

const MAX_LOOKUPS = 3

export interface LookupCandidates {
  /** Registrable domains to check (age + MX), most relevant first. */
  domains: string[]
  /** The subset that receives recruiter email (MX matters there). */
  mailDomains: string[]
}

/**
 * Which domains are worth a network lookup for this posting. Free-mail,
 * job boards/ATS, messaging and shortener hosts are skipped (their age and
 * MX say nothing about the employer), as are well-known employers' domains.
 */
export function lookupCandidates(input: ScamInput): LookupCandidates {
  const ctx = buildContext(toFields(input))
  const skip = (host: string): boolean =>
    isFreemail(host) ||
    isJobPlatform(host) ||
    MESSAGING_HOSTS.has(host) ||
    URL_SHORTENERS.has(host) ||
    (ctx.knownCompany && ctx.legitDomains.some((d) => isSameSite(host, d)))
  const ordered: Array<{ domain: string; mail: boolean }> = []
  const push = (host: string | null, mail: boolean): void => {
    if (!host || skip(host)) return
    const domain = registrableDomain(host)
    const existing = ordered.find((o) => o.domain === domain)
    if (existing) {
      existing.mail = existing.mail || mail
      return
    }
    ordered.push({ domain, mail })
  }
  for (const h of ctx.hosts.filter((x) => x.field !== 'description')) push(h.host, h.via === 'email')
  for (const h of ctx.hosts.filter((x) => x.field === 'description' && x.via === 'email')) push(h.host, true)
  if (!ctx.knownCompany) push(hostOf(input.companyDomain), false)
  const picked = ordered.slice(0, MAX_LOOKUPS)
  return {
    domains: picked.map((p) => p.domain),
    mailDomains: picked.filter((p) => p.mail).map((p) => p.domain),
  }
}
