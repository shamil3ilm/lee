import { sql, type AnyColumn } from 'drizzle-orm'
import { runAfterResponse } from '@/lib/server/after-response'
import type { RateLimitSnapshot } from './rate-limit-headers'
import { aiScopeUserId } from './usage'

/**
 * Upsert the latest provider rate-limit snapshot for (user, provider, model).
 * One row per key — never history. Deferred off the response path like the
 * call log itself; a no-op without a user or without rate-limit headers.
 * Never throws.
 */
export async function recordQuotaSnapshot(input: {
  userId?: string | null
  provider: string
  model: string
  snapshot: RateLimitSnapshot | null
}): Promise<void> {
  const userId = input.userId ?? aiScopeUserId()
  const snap = input.snapshot
  if (!userId || !snap) return
  const observedAt = new Date()
  await runAfterResponse(`ai_quota_snapshot:${input.provider}`, async () => {
    const { db } = await import('@/lib/db/client')
    const { aiQuotaSnapshots: t } = await import('@/lib/db/schema')
    const keep = (col: AnyColumn) => sql`coalesce(excluded.${sql.identifier(col.name)}, ${col})`
    await db
      .insert(t)
      .values({ userId, provider: input.provider, model: input.model, ...snap, observedAt })
      .onConflictDoUpdate({
        target: [t.userId, t.provider, t.model],
        set: {
          // A 429 may carry only retry-after: keep the last known limits.
          limitRequests: keep(t.limitRequests),
          remainingRequests: keep(t.remainingRequests),
          resetRequestsAt: keep(t.resetRequestsAt),
          limitTokens: keep(t.limitTokens),
          remainingTokens: keep(t.remainingTokens),
          resetTokensAt: keep(t.resetTokensAt),
          retryAfterAt: snap.retryAfterAt,
          observedAt,
        },
      })
  })
}
