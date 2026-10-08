import {
  MATCH_COMPONENT_KEYS,
  type MatchComponent,
  type MatchComponentKey,
  type MatchDetail,
  type RequirementCheck,
} from './types'

/**
 * Read a stored `fit_detail` jsonb defensively (client-safe). Anything
 * malformed yields null, and the badge falls back to the bare score.
 */

const KEYS: ReadonlySet<string> = new Set(MATCH_COMPONENT_KEYS)

function strings(v: unknown, max = 20): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : []
}

function component(v: unknown): MatchComponent | null {
  if (!v || typeof v !== 'object') return null
  const c = v as Record<string, unknown>
  if (typeof c.key !== 'string' || !KEYS.has(c.key)) return null
  if (typeof c.label !== 'string' || typeof c.points !== 'number' || typeof c.max !== 'number') return null
  return { key: c.key as MatchComponentKey, label: c.label, points: c.points, max: c.max }
}

const STATUSES: ReadonlySet<string> = new Set(['met', 'partial', 'missing', 'unchecked'])

function check(v: unknown): RequirementCheck | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (typeof r.text !== 'string' || typeof r.status !== 'string' || !STATUSES.has(r.status)) return null
  return {
    text: r.text,
    weight: r.weight === 'nice' ? 'nice' : 'must',
    status: r.status as RequirementCheck['status'],
    ...(typeof r.evidence === 'string' ? { evidence: r.evidence } : {}),
  }
}

export function toMatchDetail(value: unknown): MatchDetail | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const d = value as Record<string, unknown>
  if (typeof d.score !== 'number' || !Array.isArray(d.components)) return null
  const components = d.components.map(component).filter((c): c is MatchComponent => c !== null)
  return {
    v: typeof d.v === 'string' ? d.v : '',
    score: d.score,
    confidence: d.confidence === 'title_only' ? 'title_only' : 'full',
    components,
    requirements: Array.isArray(d.requirements)
      ? d.requirements.map(check).filter((c): c is RequirementCheck => c !== null).slice(0, 20)
      : [],
    missing: strings(d.missing),
    matched: strings(d.matched),
  }
}
