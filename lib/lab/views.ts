import type { ChatMetrics, ProviderId } from './providers/types'

/**
 * v14 — client-facing shapes for Arena runs. Pure types + projection
 * helpers; safe to import from client components.
 */

export type ErrorKind = 'rate_limited' | 'missing_key' | 'auth' | 'timeout' | 'error'

export interface StoredMetrics extends ChatMetrics {
  errorKind?: ErrorKind
  schemaErrors?: string[]
}

export interface ArenaConfig {
  system?: string
  prompt: string
  jsonSchema?: object
  models: { provider: ProviderId; model: string }[]
  blind: boolean
  temperature?: number
  maxTokens?: number
}

export interface ResultView {
  id: string
  label: string | null
  /** null while a blind run hasn't been voted on. */
  provider: string | null
  model: string | null
  output: string | null
  outputJson: unknown
  metrics: StoredMetrics | null
  schemaValid: boolean | null
  error: string | null
  vote: number | null
}

export interface RunView {
  id: string
  kind: string
  createdAt: string
  config: ArenaConfig
  blind: boolean
  revealed: boolean
  results: ResultView[]
}

interface ResultRowLike {
  id: string
  blindLabel: string | null
  modelProvider: string
  modelId: string
  output: string | null
  outputJson: unknown
  metrics: unknown
  schemaValid: boolean | null
  error: string | null
  vote: number | null
}

export function toResultView(r: ResultRowLike, hideIdentity: boolean): ResultView {
  return {
    id: r.id,
    label: r.blindLabel,
    provider: hideIdentity ? null : r.modelProvider,
    model: hideIdentity ? null : r.modelId,
    output: r.output,
    outputJson: r.outputJson ?? null,
    metrics: (r.metrics as StoredMetrics | null) ?? null,
    schemaValid: r.schemaValid,
    error: r.error,
    vote: r.vote,
  }
}

export function toRunView(
  run: { id: string; kind: string; createdAt: Date; config: unknown },
  results: ResultRowLike[],
): RunView {
  const config = run.config as ArenaConfig
  const blind = Boolean(config?.blind)
  const revealed = !blind || results.some((r) => r.vote === 1)
  return {
    id: run.id,
    kind: run.kind,
    createdAt: run.createdAt.toISOString(),
    // The model list would give the blind labels away — withhold it until
    // the user has voted.
    config: revealed ? config : { ...config, models: [] },
    blind,
    revealed,
    results: results.map((r) => toResultView(r, !revealed)),
  }
}

export const BLIND_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'] as const
