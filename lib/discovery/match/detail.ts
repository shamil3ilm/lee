import { MATCH_COMPONENT_KEYS, type MatchComponent, type MatchComponentKey, type MatchDetail } from './types'

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

export function toMatchDetail(value: unknown): MatchDetail | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const d = value as Record<string, unknown>
  if (typeof d.score !== 'number' || !Array.isArray(d.components)) return null
  const components = d.components.map(component).filter((c): c is MatchComponent => c !== null)
  return {
    v: typeof d.v === 'string' ? d.v : '',
    score: d.score,
    components,
    missing: strings(d.missing),
    matched: strings(d.matched),
  }
}
