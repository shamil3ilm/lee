/** Preferred work mode (profile.remotePref), read by the Match Score. Client-safe. */
export const WORK_MODES = ['any', 'remote', 'hybrid', 'onsite'] as const
export type WorkMode = (typeof WORK_MODES)[number]

export const WORK_MODE_LABELS: Readonly<Record<WorkMode, string>> = {
  any: 'No preference',
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
}

export function isWorkMode(v: unknown): v is WorkMode {
  return typeof v === 'string' && (WORK_MODES as readonly string[]).includes(v)
}
