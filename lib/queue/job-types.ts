/**
 * Job types that replaced the monolithic `sync-all` cron. Kept free of
 * handler imports so the scheduler, Settings page and tests can use them
 * without loading AI / Gmail / discovery modules.
 */
export const JOB_TYPES = {
  reminders: 'reminders:all',
  followups: 'followups:user',
  gmailSync: 'gmail-sync:user',
  digest: 'digest:user',
  discoverySource: 'discovery-source:user+source',
  discoveryEmail: 'discovery-email:user',
  scamReassess: 'scam-reassess:user',
} as const

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES]

/**
 * Claim order among due jobs — the old sync-all order: reminders, then the
 * cheap per-user steps, then discovery; the discovery email and the Scam
 * Shield re-assessment also wait (wait_for_type) until the user's source
 * polls are finished, exactly as they ran after discovery before.
 */
export const JOB_PRIORITY: Readonly<Record<JobType, number>> = {
  [JOB_TYPES.reminders]: 0,
  [JOB_TYPES.followups]: 10,
  [JOB_TYPES.gmailSync]: 20,
  [JOB_TYPES.digest]: 30,
  [JOB_TYPES.discoverySource]: 40,
  [JOB_TYPES.scamReassess]: 50,
  [JOB_TYPES.discoveryEmail]: 60,
}

/** Short human labels for Settings › Background jobs (no internals). */
export const JOB_LABELS: Readonly<Record<string, string>> = {
  [JOB_TYPES.reminders]: 'Reminders',
  [JOB_TYPES.followups]: 'Follow-up nudges',
  [JOB_TYPES.gmailSync]: 'Gmail sync',
  [JOB_TYPES.digest]: 'Weekly digest',
  [JOB_TYPES.discoverySource]: 'Discovery source poll',
  [JOB_TYPES.discoveryEmail]: 'Discovery email',
  [JOB_TYPES.scamReassess]: 'Scam Shield re-check',
}

export function jobLabel(type: string): string {
  return JOB_LABELS[type] ?? 'Background task'
}

/** UTC calendar day, `yyyy-mm-dd`. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/**
 * Idempotency keys — one run per UTC day per unit of work. The key names
 * the short type prefix, the ids and the day, e.g. `gmail-sync:{user}:{day}`.
 */
export const jobKeys = {
  reminders: (day: string) => `reminders:all:${day}`,
  followups: (userId: string, day: string) => `followups:${userId}:${day}`,
  gmailSync: (userId: string, day: string) => `gmail-sync:${userId}:${day}`,
  digest: (userId: string, day: string) => `digest:${userId}:${day}`,
  discoverySource: (userId: string, sourceId: string, day: string) =>
    `discovery-source:${userId}:${sourceId}:${day}`,
  discoveryEmail: (userId: string, day: string) => `discovery-email:${userId}:${day}`,
  scamReassess: (userId: string, day: string) => `scam-reassess:${userId}:${day}`,
} as const
