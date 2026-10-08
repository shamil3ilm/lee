/**
 * GCC government, semi-government and major employers lee keeps an eye on.
 *
 * STUB: the sources branch owns the full list; this minimal version has the
 * same export and shape so the employer-watch prompts can be built and
 * tested. Entries reuse careers links already checked for the starter
 * catalog (lib/defaults/catalog.ts). Client-safe (no imports).
 */

export type WatchMethod = 'source' | 'email_alert' | 'ai_web_search' | 'watch'

export interface WatchEmployer {
  name: string
  /** ISO 3166-1 alpha-2. */
  country: string
  sector: string
  /** Roles reserved for nationals (Emiratisation, Saudization …). */
  nationalsOnly: boolean
  careersUrl: string
  /** How lee follows this employer. */
  method: WatchMethod
  /** The employer's own job-alert sign-up, when it has one. */
  alertSignupUrl: string | null
}

export const WATCH_EMPLOYERS: readonly WatchEmployer[] = [
  { name: 'Etihad Airways', country: 'AE', sector: 'aviation', nationalsOnly: false, careersUrl: 'https://careers.etihad.com/', method: 'ai_web_search', alertSignupUrl: null },
  { name: 'du', country: 'AE', sector: 'telecom', nationalsOnly: false, careersUrl: 'https://www.du.ae/', method: 'ai_web_search', alertSignupUrl: null },
  { name: 'Ooredoo', country: 'QA', sector: 'telecom', nationalsOnly: false, careersUrl: 'https://www.ooredoo.qa/web/en/careers/', method: 'ai_web_search', alertSignupUrl: null },
  { name: 'Aramco', country: 'SA', sector: 'energy', nationalsOnly: false, careersUrl: 'https://careers.aramco.com/', method: 'ai_web_search', alertSignupUrl: null },
  { name: 'Emirates Group', country: 'AE', sector: 'aviation', nationalsOnly: false, careersUrl: 'https://www.emiratesgroupcareers.com/search-and-apply/', method: 'watch', alertSignupUrl: null },
]
