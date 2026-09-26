import type { RateLimitSnapshot } from './rate-limit-headers'
import { QUOTA_CRITICAL, QUOTA_WARN, type FreeTierLimit } from './quota-limits'

/**
 * Pure quota math: combine the latest provider snapshot (authoritative while
 * its window is still open) with locally counted usage from ai_call_logs
 * against the published free-tier limits.
 */

export interface LocalUsage {
  requestsDay: number
  tokensDay: number
  requestsMinute: number
  tokensMinute: number
  /** Billed audio seconds (minimum billed length already applied). */
  audioSecondsHour: number
  audioSecondsDay: number
}

export type SnapshotView = RateLimitSnapshot & { observedAt: Date }

export type QuotaLevel = 'ok' | 'warn' | 'critical' | 'exhausted' | 'unknown'

export type QuotaDimensionKey =
  | 'requests_day'
  | 'tokens_day'
  | 'requests_minute'
  | 'tokens_minute'
  | 'audio_seconds_hour'
  | 'audio_seconds_day'

export interface QuotaDimension {
  key: QuotaDimensionKey
  used: number
  limit: number
  fraction: number
  /** 'provider' = from response headers; 'estimate' = counted locally. */
  source: 'provider' | 'estimate'
  /** The limit is an approximate published value (not confirmed by the provider). */
  approximate: boolean
  resetAt: Date | null
}

export interface QuotaStatus {
  provider: string
  model: string
  level: QuotaLevel
  /** Highest used/limit fraction across dimensions (0 when unknown). */
  fraction: number
  dimensions: QuotaDimension[]
  approximate: boolean
  retryAfterAt: Date | null
  observedAt: Date | null
  limitSource: string | null
  lastVerified: string | null
}

export function quotaLevel(fraction: number): Exclude<QuotaLevel, 'unknown'> {
  if (fraction >= 1) return 'exhausted'
  if (fraction >= QUOTA_CRITICAL) return 'critical'
  if (fraction >= QUOTA_WARN) return 'warn'
  return 'ok'
}

function dim(
  key: QuotaDimensionKey,
  used: number,
  limit: number | null | undefined,
  source: QuotaDimension['source'],
  approximate: boolean,
  resetAt: Date | null = null,
): QuotaDimension | null {
  if (!limit || limit <= 0) return null
  const u = Math.max(0, used)
  return { key, used: u, limit, fraction: u / limit, source, approximate, resetAt }
}

/** Snapshot dimension while its window is open; local estimate otherwise. */
function snapshotOrEstimate(
  key: QuotaDimensionKey,
  snapLimit: number | null | undefined,
  snapRemaining: number | null | undefined,
  resetAt: Date | null | undefined,
  estimate: number,
  fallbackLimit: number | undefined,
  approximateLimit: boolean,
  now: Date,
): QuotaDimension | null {
  const open = resetAt == null || resetAt.getTime() > now.getTime()
  if (snapLimit != null && snapRemaining != null && open) {
    return dim(key, snapLimit - snapRemaining, snapLimit, 'provider', false, resetAt ?? null)
  }
  const limit = snapLimit ?? fallbackLimit
  return dim(key, estimate, limit, 'estimate', snapLimit == null && approximateLimit)
}

export function computeQuotaStatus(input: {
  provider: string
  model: string
  limit: FreeTierLimit | null
  local: LocalUsage
  snapshot: SnapshotView | null
  now: Date
}): QuotaStatus {
  const { limit, local, snapshot: s, now } = input
  const approx = limit?.approximate ?? false
  const dims = [
    snapshotOrEstimate('requests_day', s?.limitRequests, s?.remainingRequests, s?.resetRequestsAt, local.requestsDay, limit?.rpd, approx, now),
    snapshotOrEstimate('tokens_minute', s?.limitTokens, s?.remainingTokens, s?.resetTokensAt, local.tokensMinute, limit?.tpm, approx, now),
    dim('requests_minute', local.requestsMinute, limit?.rpm, 'estimate', approx),
    dim('tokens_day', local.tokensDay, limit?.tpd, 'estimate', approx),
    dim('audio_seconds_hour', local.audioSecondsHour, limit?.audioSecondsPerHour, 'estimate', approx),
    dim('audio_seconds_day', local.audioSecondsDay, limit?.audioSecondsPerDay, 'estimate', approx),
  ].filter((d): d is QuotaDimension => d !== null)

  const retryAfterAt =
    s?.retryAfterAt && s.retryAfterAt.getTime() > now.getTime() ? s.retryAfterAt : null
  const fraction = dims.reduce((m, d) => Math.max(m, d.fraction), 0)
  const level: QuotaLevel = retryAfterAt
    ? 'exhausted'
    : dims.length === 0
      ? 'unknown'
      : quotaLevel(fraction)

  return {
    provider: input.provider,
    model: input.model,
    level,
    fraction,
    dimensions: dims,
    approximate: dims.some((d) => d.approximate),
    retryAfterAt,
    observedAt: s?.observedAt ?? null,
    limitSource: limit?.source ?? null,
    lastVerified: limit?.lastVerified ?? null,
  }
}
