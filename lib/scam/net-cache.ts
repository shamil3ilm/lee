import * as cacheQ from '@/lib/db/queries/scamDomainCache'
import type { DomainCacheRow, DomainCacheWrite } from '@/lib/db/queries/scamDomainCache'
import { logger } from '@/lib/logger'
import { lookupCandidates } from './candidates'
import { ageInDays, lookupDomainAge, lookupMx, type NetDeps } from './net'
import type { DomainNetFacts, NetContext, ScamInput } from './types'

/**
 * v17 §1 — network facts with a per-domain DB cache.
 *   off   — no network facts at all (the user setting is off).
 *   cache — use whatever is cached; never call out (page renders, re-assessments).
 *   fetch — call out for missing/expired entries, within `budget`.
 * Never throws: any failure degrades to "unknown", which never adds risk.
 */
export type NetMode = 'off' | 'cache' | 'fetch'

/** Shared, mutable lookup allowance for one pipeline run (e.g. a discovery cycle). */
export interface NetBudget {
  remaining: number
}

export interface NetOptions {
  mode: NetMode
  now?: Date
  deps?: NetDeps
  budget?: NetBudget
}

const DAY = 86_400_000
const AGE_TTL_MS = 30 * DAY
const MX_TTL_MS = 7 * DAY
const ERROR_RETRY_MS = DAY

function expired(checkedAt: Date | null, status: string | null, ttl: number, now: Date): boolean {
  if (!checkedAt || !status) return true
  const age = now.getTime() - checkedAt.getTime()
  return age > (status === 'error' ? ERROR_RETRY_MS : ttl)
}

async function refresh(
  domain: string,
  wantMx: boolean,
  cached: DomainCacheRow | undefined,
  now: Date,
  deps: NetDeps | undefined,
): Promise<DomainCacheRow> {
  const needAge = expired(cached?.ageCheckedAt ?? null, cached?.ageStatus ?? null, AGE_TTL_MS, now)
  const needMx = wantMx && expired(cached?.mxCheckedAt ?? null, cached?.mxStatus ?? null, MX_TTL_MS, now)
  const [age, mx] = await Promise.all([
    needAge ? lookupDomainAge(domain, deps) : null,
    needMx ? lookupMx(domain, deps) : null,
  ])
  const next: DomainCacheWrite = {
    domain,
    registeredAt: age ? (age.status === 'ok' ? new Date(age.registeredAt) : null) : (cached?.registeredAt ?? null),
    ageStatus: age ? age.status : (cached?.ageStatus ?? null),
    ageCheckedAt: age ? now : (cached?.ageCheckedAt ?? null),
    hasMx: mx ? (mx.status === 'ok' ? mx.hasMx : null) : (cached?.hasMx ?? null),
    mxStatus: mx ? mx.status : (cached?.mxStatus ?? null),
    mxCheckedAt: mx ? now : (cached?.mxCheckedAt ?? null),
  }
  if (age || mx) await cacheQ.upsert(next)
  return { ...next, updatedAt: now } as DomainCacheRow
}

function toFacts(domain: string, row: DomainCacheRow | undefined, now: Date): DomainNetFacts {
  const registeredAt = row?.ageStatus === 'ok' && row.registeredAt ? row.registeredAt.toISOString() : null
  return {
    domain,
    registeredAt,
    ageDays: ageInDays(registeredAt, now),
    hasMx: row?.mxStatus === 'ok' ? (row.hasMx ?? null) : null,
  }
}

export async function resolveNetContext(input: ScamInput, opts: NetOptions): Promise<NetContext | null> {
  if (opts.mode === 'off') return null
  const now = opts.now ?? new Date()
  try {
    const { domains, mailDomains } = lookupCandidates(input)
    if (domains.length === 0) return null
    const cached = await cacheQ.getMany(domains)
    const rows = new Map(cached)
    if (opts.mode === 'fetch') {
      for (const domain of domains) {
        if (opts.budget && opts.budget.remaining <= 0) break
        const row = cached.get(domain)
        const wantMx = mailDomains.includes(domain)
        const stale =
          expired(row?.ageCheckedAt ?? null, row?.ageStatus ?? null, AGE_TTL_MS, now) ||
          (wantMx && expired(row?.mxCheckedAt ?? null, row?.mxStatus ?? null, MX_TTL_MS, now))
        if (!stale) continue
        if (opts.budget) opts.budget.remaining -= 1
        rows.set(domain, await refresh(domain, wantMx, row, now, opts.deps))
      }
    }
    return { domains: domains.map((d) => toFacts(d, rows.get(d), now)), mailDomains }
  } catch (err) {
    logger.warn('scam.net_context_failed', { err: err instanceof Error ? err.message : String(err) })
    return null
  }
}
