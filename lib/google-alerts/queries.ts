/**
 * Suggested Google Alerts queries from the search preferences and the
 * watched employers. Client-safe; never includes anything personal (no
 * name, email or phone): only role phrases, places and careers sites.
 */

export interface QueryInput {
  roleFamilies: readonly string[]
  customRoles: readonly string[]
  /** ISO-2 target regions (AE, SA, QA, KW, BH, OM, IN). */
  regions: readonly string[]
  /** Strong areas with ready evidence ('laravel', 'payments', …). */
  strengths: readonly string[]
  /** Careers sites of watched employers (hostnames). */
  careersHosts: readonly string[]
  /** User needs an employer visa in the GCC. */
  needsVisa: boolean
}

const ROLE_PHRASES: Readonly<Record<string, string>> = {
  backend: 'backend developer',
  fullstack: 'full stack developer',
  frontend: 'frontend developer',
  api_integration: 'integration engineer',
  payments: 'payments engineer',
  einvoicing: 'e-invoicing developer',
  erp: 'ERP developer',
  data_analyst: 'data analyst',
  business_analyst: 'business analyst',
  analytics_eng: 'analytics engineer',
  data: 'data engineer',
  qa_automation: 'QA automation engineer',
  support_eng: 'application support engineer',
  implementation: 'implementation consultant',
}

const PLACES: Readonly<Record<string, string>> = {
  AE: '(Dubai OR "Abu Dhabi")',
  SA: '(Riyadh OR Jeddah)',
  QA: 'Doha',
  KW: 'Kuwait',
  BH: 'Bahrain',
  OM: 'Muscat',
  IN: '(Bengaluru OR Kochi OR remote India)',
}

const MAX_QUERIES = 10

function quoted(s: string): string {
  return `"${s.replace(/"/g, '')}"`
}

export function suggestAlertQueries(input: QueryInput): string[] {
  const phrases = [
    ...(input.strengths.includes('laravel') ? ['Laravel developer'] : []),
    ...input.roleFamilies.map((f) => ROLE_PHRASES[f]).filter((p): p is string => Boolean(p)),
    ...input.customRoles.slice(0, 2),
  ]
  const roles = [...new Set(phrases.map((p) => p.trim()).filter(Boolean))].slice(0, 3)
  const places = input.regions.map((r) => PLACES[r]).filter((p): p is string => Boolean(p)).slice(0, 2)
  const out: string[] = []
  for (const role of roles.length > 0 ? roles : ['software developer']) {
    for (const place of places.length > 0 ? places : ['']) {
      out.push(`${quoted(role)} ${place} hiring`.replace(/\s+/g, ' ').trim())
    }
  }
  if (input.needsVisa && roles[0] && places[0]) out.push(`${quoted(roles[0])} ${places[0]} "visa sponsorship"`)
  if (input.strengths.includes('payments')) out.push(`"payments" ("backend" OR "integration") jobs ${places[0] ?? ''}`.trim())
  for (const host of input.careersHosts.slice(0, 4)) out.push(`careers site:${host}`)
  return [...new Set(out)].slice(0, MAX_QUERIES)
}
