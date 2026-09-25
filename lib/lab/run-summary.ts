import type { ArenaConfig } from './views'

/** v14 — list-row projection for a Lab run (client-safe). */
export interface RunSummaryView {
  id: string
  kind: string
  createdAt: string
  promptPreview: string
  modelCount: number
  blind: boolean
  voted: boolean
  /** Hidden (empty) for blind runs that haven't been voted on. */
  models: string[]
}

export function summarizeRun(r: {
  id: string
  kind: string
  config: unknown
  createdAt: Date
  resultCount: number
  voted: boolean
}): RunSummaryView {
  const c = (r.config ?? {}) as Partial<ArenaConfig>
  const blind = Boolean(c.blind)
  const prompt = typeof c.prompt === 'string' ? c.prompt : ''
  return {
    id: r.id,
    kind: r.kind,
    createdAt: r.createdAt.toISOString(),
    promptPreview: prompt.length > 120 ? `${prompt.slice(0, 120)}…` : prompt,
    modelCount: r.resultCount,
    blind,
    voted: r.voted,
    models: blind && !r.voted ? [] : (c.models ?? []).map((m) => `${m.provider}/${m.model}`),
  }
}
