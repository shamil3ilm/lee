/**
 * Client-safe: the cleanup steps, in run order, with the labels Settings ›
 * Storage uses to report what a run removed. User steps run per user with
 * that user's windows; global steps run once per run.
 */

export const USER_STEP_IDS = [
  'expiredDiscoveries',
  'tombstonedDiscoveries',
  'compactedDiscoveries',
  'aiCallLogs',
  'gmailThreads',
  'webVitals',
  'cvScores',
  'labRuns',
  'pdfCache',
  'driveDuplicateBytes',
  'orphanRiskAssessments',
  'orphanDriveFolders',
  'reputationCache',
  'variantVersions',
  'academyHistory',
  'applyHistory',
] as const

export const GLOBAL_STEP_IDS = [
  'queueJobs',
  'orphanAiCallLogs',
  'expiredAuth',
  'usageHistory',
  'scamDomains',
  'systemEvents',
] as const

export type UserStepId = (typeof USER_STEP_IDS)[number]
export type GlobalStepId = (typeof GLOBAL_STEP_IDS)[number]
export type RetentionStepId = UserStepId | GlobalStepId

export type UserCounts = Record<UserStepId, number>
export type GlobalCounts = Record<GlobalStepId, number>
export type RetentionCounts = UserCounts & GlobalCounts

export interface RetentionResult extends RetentionCounts {
  /** Users whose rows were cleaned. */
  users: number
  /** False when the time budget ran out before every step finished. */
  complete: boolean
}

export const STEP_LABELS: Readonly<Record<RetentionStepId, string>> = {
  expiredDiscoveries: 'Unreviewed discoveries moved to Dismissed',
  tombstonedDiscoveries: 'Dismissed discoveries slimmed to a title',
  compactedDiscoveries: 'Raw source payloads dropped',
  aiCallLogs: 'AI call logs deleted',
  gmailThreads: 'Gmail sync markers deleted',
  webVitals: 'Performance aggregates deleted',
  cvScores: 'Old CV score runs deleted',
  labRuns: 'Model Lab runs deleted',
  pdfCache: 'Cached PDFs evicted',
  driveDuplicateBytes: 'File copies already in Drive cleared',
  orphanRiskAssessments: 'Orphaned Scam Shield checks deleted',
  orphanDriveFolders: 'Stale Drive folder links deleted',
  reputationCache: 'Old company reputation signals cleared',
  variantVersions: 'Old résumé variant versions deleted',
  academyHistory: 'Old Playground attempts and plans compacted (scores and history kept)',
  applyHistory: 'Old daily shortlists and “Not for me” feedback deleted',
  queueJobs: 'Finished background jobs deleted',
  orphanAiCallLogs: 'AI call logs of deleted users deleted',
  expiredAuth: 'Expired sign-in records deleted',
  usageHistory: 'Old usage snapshots and alerts deleted',
  scamDomains: 'Stale domain checks deleted',
  systemEvents: 'Old log events deleted',
}

function zeros<K extends string>(ids: readonly K[]): Record<K, number> {
  return Object.fromEntries(ids.map((id) => [id, 0])) as Record<K, number>
}

export const EMPTY_USER_COUNTS: Readonly<UserCounts> = Object.freeze(zeros(USER_STEP_IDS))
export const EMPTY_GLOBAL_COUNTS: Readonly<GlobalCounts> = Object.freeze(zeros(GLOBAL_STEP_IDS))

export function emptyRetentionResult(): RetentionResult {
  return { ...EMPTY_USER_COUNTS, ...EMPTY_GLOBAL_COUNTS, users: 0, complete: true }
}

/** Sum two count records key by key (new object). */
export function addCounts<K extends string>(a: Readonly<Record<K, number>>, b: Readonly<Record<K, number>>): Record<K, number> {
  return Object.fromEntries(Object.keys(a).map((k) => [k, a[k as K] + (b[k as K] ?? 0)])) as Record<K, number>
}

/** Total rows changed across every step. */
export function totalChanged(counts: Partial<Record<RetentionStepId, number>>): number {
  return [...USER_STEP_IDS, ...GLOBAL_STEP_IDS].reduce((sum, id) => sum + (counts[id] ?? 0), 0)
}
