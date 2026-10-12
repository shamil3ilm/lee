import 'server-only'
import type { UserProfile } from '@/lib/db/queries/profile'
import * as screeningQ from '@/lib/db/queries/screening'
import { loadFitContext } from '@/lib/cv-fit/service'
import { toBestCv } from '@/lib/cv-fit/types'
import { toMatchDetail } from '@/lib/discovery/match/detail'
import { matchProfileFrom } from '@/lib/discovery/match/profile'
import { rowToJob } from '@/lib/discovery/match/service'
import { searchPrefsFromProfile } from '@/lib/discovery/relevance/prefs'
import { referralHint } from '@/lib/integrations/linkedin/connections'
import { logger } from '@/lib/logger'
import { readResumeProfile } from '@/lib/resume/types'
import type { ScreenInput, ScreenReferral, ScreenVariant } from './input'
import { screeningPath } from './path'
import { compactPath } from './stage'
import type { ScreeningPath } from './types'

/**
 * Server side of the screening path: computed on read for the rows a page
 * shows (≤ a page), never stored — no migration, no fit_key churn. Every
 * failure is logged and yields no path: the page renders without it.
 */

export interface LoadScreensOptions {
  /** Look up LinkedIn connections at the company (detail page only: one query per row). */
  referral?: boolean
  /** Ship the full path (detail page) instead of the compact list form. */
  full?: boolean
  now?: Date
}

function parseDate(v: string | null): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Best variants of these rows, rendered once (null when the user has none). */
async function variantsFor(userId: string, profile: UserProfile | null, rows: readonly screeningQ.ScreeningRow[], now: Date): Promise<Map<string, ScreenVariant>> {
  const wanted = new Set(rows.flatMap((r) => toBestCv(r.bestCv)?.best.variantId ?? []))
  const resume = readResumeProfile(profile?.resume)
  if (wanted.size === 0 || !resume) return new Map()
  const ctx = await loadFitContext(userId, { profile: resume, now })
  return new Map(ctx.variants.filter((v) => wanted.has(v.id)).map((v) => [v.id, { name: v.name, evidence: v.evidence }] as const))
}

async function referralFor(userId: string, company: string | null): Promise<ScreenReferral | null> {
  const hint = await referralHint(userId, company)
  return hint ? { count: hint.count, people: hint.people.map((p) => ({ name: p.name })) } : null
}

export async function loadScreens(
  userId: string,
  profile: UserProfile | null,
  ids: readonly string[],
  opts: LoadScreensOptions = {},
): Promise<Map<string, ScreeningPath>> {
  const out = new Map<string, ScreeningPath>()
  if (ids.length === 0) return out
  try {
    const now = opts.now ?? new Date()
    const rows = await screeningQ.rowsForScreening(userId, ids)
    const matchProfile = matchProfileFrom(profile, now)
    const resume = readResumeProfile(profile?.resume)
    const noticePeriods = searchPrefsFromProfile(profile).extra.noticePeriods
    const variants = await variantsFor(userId, profile, rows, now)
    for (const r of rows) {
      try {
        const variantId = toBestCv(r.bestCv)?.best.variantId
        const input: ScreenInput = {
          job: { ...rowToJob(r), companyName: r.companyName, applyUrl: r.applyUrl },
          profile: matchProfile,
          resume,
          noticePeriods,
          detail: toMatchDetail(r.fitDetail),
          variant: variantId ? (variants.get(variantId) ?? null) : null,
          postedAt: parseDate(r.postedAt),
          firstSeenAt: r.createdAt,
          ...(opts.referral ? { referral: await referralFor(userId, r.companyName) } : {}),
          now,
        }
        const path = screeningPath(input)
        out.set(r.id, opts.full ? path : compactPath(path))
      } catch (err) {
        logger.warn('screening_path_row_failed', { userId, discoveryId: r.id, err: err instanceof Error ? err.name : 'unknown' })
      }
    }
  } catch (err) {
    logger.warn('screening_paths_failed', { userId, err: err instanceof Error ? err.name : 'unknown' })
  }
  return out
}
