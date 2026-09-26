/**
 * Starter data every account gets, applied once per DEFAULTS_VERSION (see
 * lib/defaults/apply.ts). Client-safe (no imports): the Settings › Sources
 * "Popular starters" buttons read the same list, so they can't drift.
 *
 * Board slugs were checked live against each ATS public API on 2026-09-26
 * (Greenhouse boards-api, Lever v0 postings, Ashby posting-api). Re-check
 * before adding more — a plausible slug is often wrong (e.g. Notion moved
 * from Greenhouse to Ashby).
 *
 * `enabled` defaults are kept few on purpose: every new posting gets an AI
 * match score (capped per source per run), and the free AI tiers have daily
 * request/token limits. The rest are added switched off — one click to use.
 */

export interface DefaultCompany {
  name: string
  domain: string
  website: string
  headquartersCountry?: string
}

export interface DefaultSource {
  /** Stable id — never change once shipped (used to dedupe and to add new defaults later). */
  key: string
  name: string
  kind: string
  config: Record<string, string>
  enabled: boolean
  /** The company behind a company-board source (added to Companies). */
  company?: DefaultCompany
  /** DEFAULTS_VERSION that introduced it; existing users get it once they're below this. */
  since: number
}

/** Bump when adding defaults; users below it get only the newer ones. */
export const DEFAULTS_VERSION = 1

export const DEFAULT_SOURCES: readonly DefaultSource[] = [
  // Broad, all-jobs sources
  { key: 'remoteok', name: 'RemoteOK', kind: 'remoteok', config: {}, enabled: true, since: 1 },
  { key: 'hn-whoishiring', name: "HN Who's Hiring", kind: 'hn_whoishiring', config: {}, enabled: true, since: 1 },
  { key: 'yc-directory', name: 'Y Combinator directory', kind: 'yc_directory', config: {}, enabled: false, since: 1 },

  // India — enabled
  {
    key: 'lever:paytm', name: 'Paytm (Lever)', kind: 'lever', config: { company: 'paytm' }, enabled: true, since: 1,
    company: { name: 'Paytm', domain: 'paytm.com', website: 'https://paytm.com', headquartersCountry: 'India' },
  },
  {
    key: 'lever:meesho', name: 'Meesho (Lever)', kind: 'lever', config: { company: 'meesho' }, enabled: true, since: 1,
    company: { name: 'Meesho', domain: 'meesho.com', website: 'https://meesho.com', headquartersCountry: 'India' },
  },
  {
    key: 'greenhouse:inmobi', name: 'InMobi (Greenhouse)', kind: 'greenhouse', config: { company: 'inmobi' }, enabled: true, since: 1,
    company: { name: 'InMobi', domain: 'inmobi.com', website: 'https://www.inmobi.com', headquartersCountry: 'India' },
  },
  {
    key: 'ashby:sarvam', name: 'Sarvam AI (Ashby)', kind: 'ashby', config: { company: 'sarvam' }, enabled: true, since: 1,
    company: { name: 'Sarvam AI', domain: 'sarvam.ai', website: 'https://www.sarvam.ai', headquartersCountry: 'India' },
  },

  // India — added, switched off
  {
    key: 'lever:cred', name: 'CRED (Lever)', kind: 'lever', config: { company: 'cred' }, enabled: false, since: 1,
    company: { name: 'CRED', domain: 'cred.club', website: 'https://cred.club', headquartersCountry: 'India' },
  },
  {
    key: 'lever:zeta', name: 'Zeta (Lever)', kind: 'lever', config: { company: 'zeta' }, enabled: false, since: 1,
    company: { name: 'Zeta', domain: 'zeta.tech', website: 'https://www.zeta.tech', headquartersCountry: 'India' },
  },
  {
    key: 'greenhouse:groww', name: 'Groww (Greenhouse)', kind: 'greenhouse', config: { company: 'groww' }, enabled: false, since: 1,
    company: { name: 'Groww', domain: 'groww.in', website: 'https://groww.in', headquartersCountry: 'India' },
  },

  // Global — added, switched off
  {
    key: 'greenhouse:stripe', name: 'Stripe (Greenhouse)', kind: 'greenhouse', config: { company: 'stripe' }, enabled: false, since: 1,
    company: { name: 'Stripe', domain: 'stripe.com', website: 'https://stripe.com', headquartersCountry: 'United States' },
  },
  {
    key: 'ashby:notion', name: 'Notion (Ashby)', kind: 'ashby', config: { company: 'notion' }, enabled: false, since: 1,
    company: { name: 'Notion', domain: 'notion.so', website: 'https://www.notion.so', headquartersCountry: 'United States' },
  },
  {
    key: 'ashby:ramp', name: 'Ramp (Ashby)', kind: 'ashby', config: { company: 'ramp' }, enabled: false, since: 1,
    company: { name: 'Ramp', domain: 'ramp.com', website: 'https://ramp.com', headquartersCountry: 'United States' },
  },
]

/** Identity of a source for de-duplication: kind + its one config value. */
export function sourceIdentity(kind: string, config: Record<string, unknown>): string {
  const value = typeof config.company === 'string' ? config.company : typeof config.url === 'string' ? config.url : ''
  return `${kind}:${value.toLowerCase()}`
}
