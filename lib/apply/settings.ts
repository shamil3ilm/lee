import { z } from 'zod'

/**
 * Apply-faster settings (Settings › Notifications › Shortlist & follow-ups),
 * stored on user_profile. Client-safe: bounds and defaults only.
 */

export const SHORTLIST_SIZE = { min: 3, max: 10, default: 5 } as const
/** Business days after applying (lib/followups/cadence.ts): first nudge, then the second and last. */
export const FOLLOWUP_DAYS = { min: 2, max: 20, default: 5 } as const
export const FOLLOWUP_SECOND_DAYS = { min: 3, max: 30, default: 10 } as const

export interface ApplySettings {
  shortlistSize: number
  followupDays: number
  followupSecondDays: number
  shortlistInEmails: boolean
}

export const DEFAULT_APPLY_SETTINGS: ApplySettings = {
  shortlistSize: SHORTLIST_SIZE.default,
  followupDays: FOLLOWUP_DAYS.default,
  followupSecondDays: FOLLOWUP_SECOND_DAYS.default,
  shortlistInEmails: true,
}

export const applySettingsSchema = z
  .object({
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
  followupSecondDays: z.coerce
    .number({ error: 'Second follow-up days must be a number.' })
    .int('Use whole days.')
    .min(FOLLOWUP_SECOND_DAYS.min, `At least ${FOLLOWUP_SECOND_DAYS.min} days.`)
    .max(FOLLOWUP_SECOND_DAYS.max, `At most ${FOLLOWUP_SECOND_DAYS.max} days.`),
  shortlistInEmails: z.boolean(),
  })
  .refine((s) => s.followupSecondDays > s.followupDays, {
    message: 'The second follow-up must come after the first.',
    path: ['followupSecondDays'],
  })

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback
  return Math.max(lo, Math.min(hi, n))
}

/** A profile row's settings, with missing or out-of-range values → defaults. */
export function applySettingsFrom(
  row:
    | Partial<{ shortlistSize: number | null; followupDays: number | null; followupSecondDays: number | null; shortlistInEmails: boolean | null }>
    | null
    | undefined,
): ApplySettings {
  const first = clampInt(row?.followupDays, FOLLOWUP_DAYS.min, FOLLOWUP_DAYS.max, FOLLOWUP_DAYS.default)
  return {
    shortlistSize: clampInt(row?.shortlistSize, SHORTLIST_SIZE.min, SHORTLIST_SIZE.max, SHORTLIST_SIZE.default),
    followupDays: first,
    followupSecondDays: Math.max(first + 1, clampInt(row?.followupSecondDays, FOLLOWUP_SECOND_DAYS.min, FOLLOWUP_SECOND_DAYS.max, FOLLOWUP_SECOND_DAYS.default)),
    shortlistInEmails: row?.shortlistInEmails ?? DEFAULT_APPLY_SETTINGS.shortlistInEmails,
  }
}
