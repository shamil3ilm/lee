import { z } from 'zod'

/**
 * Apply-faster settings (Settings › Notifications › Shortlist & follow-ups),
 * stored on user_profile. Client-safe: bounds and defaults only.
 */

export const SHORTLIST_SIZE = { min: 3, max: 10, default: 5 } as const
export const FOLLOWUP_DAYS = { min: 3, max: 30, default: 7 } as const

export interface ApplySettings {
  shortlistSize: number
  followupDays: number
  shortlistInEmails: boolean
}

export const DEFAULT_APPLY_SETTINGS: ApplySettings = {
  shortlistSize: SHORTLIST_SIZE.default,
  followupDays: FOLLOWUP_DAYS.default,
  shortlistInEmails: true,
}

export const applySettingsSchema = z.object({
  shortlistSize: z.coerce
    .number({ error: 'Shortlist size must be a number.' })
    .int('Use a whole number.')
    .min(SHORTLIST_SIZE.min, `At least ${SHORTLIST_SIZE.min}.`)
    .max(SHORTLIST_SIZE.max, `At most ${SHORTLIST_SIZE.max}.`),
  followupDays: z.coerce
    .number({ error: 'Follow-up days must be a number.' })
    .int('Use whole days.')
    .min(FOLLOWUP_DAYS.min, `At least ${FOLLOWUP_DAYS.min} days.`)
    .max(FOLLOWUP_DAYS.max, `At most ${FOLLOWUP_DAYS.max} days.`),
  shortlistInEmails: z.boolean(),
})

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback
  return Math.max(lo, Math.min(hi, n))
}

/** A profile row's settings, with missing or out-of-range values → defaults. */
export function applySettingsFrom(
  row: Partial<{ shortlistSize: number | null; followupDays: number | null; shortlistInEmails: boolean | null }> | null | undefined,
): ApplySettings {
  return {
    shortlistSize: clampInt(row?.shortlistSize, SHORTLIST_SIZE.min, SHORTLIST_SIZE.max, SHORTLIST_SIZE.default),
    followupDays: clampInt(row?.followupDays, FOLLOWUP_DAYS.min, FOLLOWUP_DAYS.max, FOLLOWUP_DAYS.default),
    shortlistInEmails: row?.shortlistInEmails ?? DEFAULT_APPLY_SETTINGS.shortlistInEmails,
  }
}
