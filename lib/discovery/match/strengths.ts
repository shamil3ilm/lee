import { findTerms, normalizeForMatch } from '../relevance/text'
import { EINVOICING_TERMS, PAYMENTS_TERMS } from './evidence'

/**
 * Strong areas the profile has READY evidence for. When a posting is in one
 * of them, a seniority stretch (Senior title, 5+ years asked) costs less:
 * "Senior title · 5+ yrs asked · strong payments match".
 */

interface StrengthDef {
  id: string
  label: string
  /** The profile shows it (ready skills / domains). */
  has(skills: ReadonlySet<string>, domains: ReadonlySet<string>): boolean
  /** The posting asks for it. */
  terms: readonly string[]
}

const anyOf = (skills: ReadonlySet<string>, xs: readonly string[]): boolean => xs.some((x) => skills.has(x))

const DEFS: readonly StrengthDef[] = [
  { id: 'payments', label: 'payments', has: (_s, d) => d.has('payments'), terms: PAYMENTS_TERMS },
  { id: 'einvoicing', label: 'e-invoicing / ZATCA', has: (_s, d) => d.has('einvoicing'), terms: EINVOICING_TERMS },
  { id: 'laravel', label: 'Laravel', has: (s) => s.has('laravel'), terms: ['laravel'] },
  {
    id: 'integrations',
    label: 'integrations',
    has: (s) => anyOf(s, ['webhooks', 'oauth', 'rest', 'graphql']),
    terms: ['integrations', 'api integrations', 'third-party apis', 'third party apis', 'webhooks', 'partner apis', 'integration engineer'],
  },
  {
    id: 'data',
    label: 'data / analysis',
    has: (s) => anyOf(s, ['sql', 'postgresql', 'mysql']) && anyOf(s, ['power bi', 'tableau', 'looker', 'pandas', 'excel', 'dashboards', 'etl', 'dbt']),
    terms: ['power bi', 'tableau', 'looker', 'dashboards', 'reporting', 'data analysis', 'data analyst', 'business intelligence', 'etl', 'dbt'],
  },
]

const LABELS = new Map(DEFS.map((d) => [d.id, d.label] as const))

/** Strength ids the profile has ready evidence for. */
export function strengthsFrom(skills: ReadonlySet<string>, domains: ReadonlySet<string>): string[] {
  return DEFS.filter((d) => d.has(skills, domains)).map((d) => d.id)
}

/** The first of `ids` the posting text asks for, as a label ("payments"); null when none. */
export function strengthIn(text: string, ids: readonly string[]): string | null {
  if (ids.length === 0) return null
  const t = normalizeForMatch(text.slice(0, 8_000))
  const hit = DEFS.find((d) => ids.includes(d.id) && findTerms(t, d.terms).length > 0)
  return hit ? (LABELS.get(hit.id) ?? hit.id) : null
}
