import { ASSET_QUOTA_BYTES } from '@/lib/storage/types'

/**
 * Free-tier limits lee must fit in (v17 §9.6). Every constant carries the
 * vendor page it came from and the day it was last checked; update both
 * together. Client-safe (no I/O).
 */

export interface FreeTierLimit {
  /** Limit in `unit`. */
  value: number
  unit: 'bytes' | 'cu_hours' | 'count' | 'cpu_hours' | 'gb_hours'
  /** Monthly allowance (resets) vs a level that is always in force. */
  kind: 'monthly' | 'level'
  docsUrl: string
  lastVerified: string
}

const GB = 1024 ** 3
const MB = 1024 ** 2

const NEON_PLANS_URL = 'https://neon.com/docs/introduction/plans'
const VERCEL_HOBBY_URL = 'https://vercel.com/docs/plans/hobby'
const VERIFIED = '2026-09-26'

/** Neon Free: "0.5 GB/project". */
export const NEON_STORAGE_LIMIT: FreeTierLimit = {
  value: 0.5 * GB,
  unit: 'bytes',
  kind: 'level',
  docsUrl: NEON_PLANS_URL,
  lastVerified: VERIFIED,
}

/** Neon Free: "100 CU-hours/project" per month. */
export const NEON_COMPUTE_LIMIT: FreeTierLimit = {
  value: 100,
  unit: 'cu_hours',
  kind: 'monthly',
  docsUrl: NEON_PLANS_URL,
  lastVerified: VERIFIED,
}

/** Neon Free: "5 GB per project included" public network transfer per month. */
export const NEON_EGRESS_LIMIT: FreeTierLimit = {
  value: 5 * GB,
  unit: 'bytes',
  kind: 'monthly',
  docsUrl: NEON_PLANS_URL,
  lastVerified: VERIFIED,
}

/** Neon Free scales compute to zero after 5 minutes idle (cannot be disabled). */
export const NEON_SCALE_TO_ZERO_MINUTES = 5

/** Vercel Hobby: "First 1,000,000" function invocations. */
export const VERCEL_INVOCATIONS_LIMIT: FreeTierLimit = {
  value: 1_000_000,
  unit: 'count',
  kind: 'monthly',
  docsUrl: VERCEL_HOBBY_URL,
  lastVerified: VERIFIED,
}

/** Vercel Hobby: "4 CPU-hrs" active CPU. */
export const VERCEL_ACTIVE_CPU_LIMIT: FreeTierLimit = {
  value: 4,
  unit: 'cpu_hours',
  kind: 'monthly',
  docsUrl: VERCEL_HOBBY_URL,
  lastVerified: VERIFIED,
}

/** Vercel Hobby: "360 GB-hrs" provisioned memory. */
export const VERCEL_MEMORY_LIMIT: FreeTierLimit = {
  value: 360,
  unit: 'gb_hours',
  kind: 'monthly',
  docsUrl: VERCEL_HOBBY_URL,
  lastVerified: VERIFIED,
}

/** Vercel Hobby: "First 100 GB" fast data transfer. */
export const VERCEL_FAST_TRANSFER_LIMIT: FreeTierLimit = {
  value: 100 * GB,
  unit: 'bytes',
  kind: 'monthly',
  docsUrl: VERCEL_HOBBY_URL,
  lastVerified: VERIFIED,
}

/** Vercel Hobby: "First 10 GB" fast origin transfer. */
export const VERCEL_ORIGIN_TRANSFER_LIMIT: FreeTierLimit = {
  value: 10 * GB,
  unit: 'bytes',
  kind: 'monthly',
  docsUrl: VERCEL_HOBBY_URL,
  lastVerified: VERIFIED,
}

/** Vercel Hobby: cron jobs run at most once per day each. */
export const VERCEL_CRON_RUNS_PER_DAY = 1
/** Vercel Hobby: 100 deployments created per day. */
export const VERCEL_DEPLOYMENTS_PER_DAY = 100

/**
 * Vercel exposes no Hobby usage API to a personal token (the Observability
 * query API needs Observability Plus, a Pro/Enterprise add-on), so the page
 * links here: the dashboard's Usage page for the signed-in team.
 */
export const VERCEL_USAGE_DASHBOARD_URL = 'https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fusage'
export const NEON_CONSOLE_URL = 'https://console.neon.tech/app/projects'

/** Playground engine assets budget (v17 §9.6 rule 6): ≤ 60 MB in total. */
export const PLAYGROUND_ENGINE_BUDGET: FreeTierLimit = {
  value: 60 * MB,
  unit: 'bytes',
  kind: 'level',
  // Our own budget, not a vendor limit: spec v17 §9.6 rule 6.
  docsUrl:
    'https://github.com/shamil3ilm/lee/blob/main/docs/superpowers/specs/2026-09-25-employ-v17-trust-outcomes-latex-playground-design.md',
  lastVerified: VERIFIED,
}

/** Per-user document file quota (lib/storage, architecture review A2): our own budget. */
export const ASSET_STORAGE_LIMIT: FreeTierLimit = {
  value: ASSET_QUOTA_BYTES,
  unit: 'bytes',
  kind: 'level',
  docsUrl: PLAYGROUND_ENGINE_BUDGET.docsUrl,
  lastVerified: VERIFIED,
}

/** Warning thresholds: amber at 70 %, red at 90 %. */
export const USAGE_WARN = 0.7
export const USAGE_CRITICAL = 0.9
export const USAGE_THRESHOLDS = [70, 90] as const
export type UsageThreshold = (typeof USAGE_THRESHOLDS)[number]
