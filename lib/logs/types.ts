/**
 * Persistent event log (system_events) vocabulary. Pure: shared by the
 * logger sink, the queries and the Settings › Logs page.
 */

export const EVENT_LEVELS = ['info', 'warn', 'error'] as const
export type EventLevel = (typeof EVENT_LEVELS)[number]

export const EVENT_CATEGORIES = [
  'job',
  'source',
  'gmail',
  'calendar',
  'drive',
  'ai',
  'latex',
  'cron',
  'auth',
  'usage',
  'playground',
  'radar',
  'app',
] as const
export type EventCategory = (typeof EVENT_CATEGORIES)[number]

export const CATEGORY_LABELS: Readonly<Record<EventCategory, string>> = {
  job: 'Jobs',
  source: 'Sources',
  gmail: 'Gmail',
  calendar: 'Calendar',
  drive: 'Drive',
  ai: 'AI',
  latex: 'LaTeX',
  cron: 'Cron',
  auth: 'Sign-in',
  usage: 'Usage',
  playground: 'Playground',
  radar: 'AI Radar',
  app: 'App',
}

export function isEventLevel(v: unknown): v is EventLevel {
  return typeof v === 'string' && (EVENT_LEVELS as readonly string[]).includes(v)
}

export function isEventCategory(v: unknown): v is EventCategory {
  return typeof v === 'string' && (EVENT_CATEGORIES as readonly string[]).includes(v)
}

/** One row ready to insert into system_events. */
export interface SystemEventRow {
  userId: string | null
  level: EventLevel
  category: EventCategory
  event: string
  message: string
  context: Record<string, unknown>
  jobId: string | null
  sourceId: string | null
  createdAt: Date
}
