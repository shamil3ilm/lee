/**
 * v12.0 — client helpers for the /cv-score page: typed fetch wrappers that
 * never surface raw network/runtime errors (only our own masked server
 * messages), plus display helpers.
 */
import type { AutofixChange, AutofixPreview } from '@/lib/cv-score/autofix'
import type { BatchResult, CompareResult } from '@/lib/cv-score/compare'
import type { CvScoreRecord } from '@/lib/cv-score/score'
import type { ComponentHeadlineKey, Severity } from '@/lib/cv-score/types'

export type { AutofixChange, AutofixPreview, BatchResult, CompareResult, CvScoreRecord }

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string }

const GENERIC = 'Something went wrong — please try again.'

async function call<T>(url: string, init: RequestInit, pick: (json: Record<string, unknown>) => T | undefined): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, init)
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      return { ok: false, error: typeof json.error === 'string' ? json.error : GENERIC }
    }
    const data = pick(json)
    return data === undefined ? { ok: false, error: GENERIC } : { ok: true, data }
  } catch (err) {
    console.error('cv-score request failed', err)
    return { ok: false, error: 'Network error — please try again.' }
  }
}

const jsonPost = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export function scoreDocument(documentId: string, applicationId: string | null): Promise<ApiResult<CvScoreRecord>> {
  return call('/api/cv-score', jsonPost({ documentId, applicationId }), (j) => j.result as CvScoreRecord | undefined)
}

export function scoreUpload(file: File, applicationId: string | null): Promise<ApiResult<CvScoreRecord>> {
  const form = new FormData()
  form.set('file', file)
  if (applicationId) form.set('applicationId', applicationId)
  return call('/api/cv-score/upload', { method: 'POST', body: form }, (j) => j.result as CvScoreRecord | undefined)
}

export function compare(documentIdA: string, documentIdB: string, applicationId: string | null): Promise<ApiResult<CompareResult>> {
  return call('/api/cv-score/compare', jsonPost({ documentIdA, documentIdB, applicationId }), (j) => j.comparison as CompareResult | undefined)
}

export function batch(includeAi: boolean): Promise<ApiResult<BatchResult>> {
  return call('/api/cv-score/batch', jsonPost({ includeAi }), (j) => j.batch as BatchResult | undefined)
}

export interface HistoryPoint {
  id: string
  createdAt: string
  overall: number
  grade: string
  mode: string
  sourceLabel: string
  scores: Record<string, number | null>
}

export function history(params: { documentId?: string | null; applicationId?: string | null }): Promise<ApiResult<HistoryPoint[]>> {
  const q = new URLSearchParams()
  if (params.documentId) q.set('documentId', params.documentId)
  if (params.applicationId) q.set('applicationId', params.applicationId)
  return call(`/api/cv-score/history?${q.toString()}`, { method: 'GET' }, (j) => j.history as HistoryPoint[] | undefined)
}

export function previewFix(applicationId: string | null, findingIds: string[]): Promise<ApiResult<AutofixPreview>> {
  return call('/api/cv-score/autofix/preview', jsonPost({ applicationId, findingIds }), (j) => j.preview as AutofixPreview | undefined)
}

export function applyFix(baseDocumentId: string, changes: AutofixChange[]): Promise<ApiResult<{ documentId: string; version: number; applied: number }>> {
  return call('/api/cv-score/autofix/apply', jsonPost({ baseDocumentId, changes }), (j) =>
    j.applied as { documentId: string; version: number; applied: number } | undefined,
  )
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export const HEADLINE_ORDER: ComponentHeadlineKey[] = [
  'roleMatch', 'skillsMatch', 'experienceMatch', 'ats', 'impact', 'readability', 'structure',
]

export const HEADLINE_SHORT: Record<ComponentHeadlineKey, string> = {
  roleMatch: 'Role',
  skillsMatch: 'Skills',
  experienceMatch: 'Experience',
  ats: 'ATS',
  impact: 'Impact',
  readability: 'Readability',
  structure: 'Structure',
}

export function scoreTone(score: number | null | undefined): { text: string; bar: string; bg: string } {
  if (score === null || score === undefined) return { text: 'text-muted-foreground', bar: 'bg-muted', bg: 'bg-muted/40' }
  if (score >= 85) return { text: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500', bg: 'bg-emerald-500/15' }
  if (score >= 75) return { text: 'text-lime-600 dark:text-lime-400', bar: 'bg-lime-500', bg: 'bg-lime-500/15' }
  if (score >= 65) return { text: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500', bg: 'bg-amber-500/15' }
  if (score >= 50) return { text: 'text-orange-600 dark:text-orange-400', bar: 'bg-orange-500', bg: 'bg-orange-500/15' }
  return { text: 'text-rose-600 dark:text-rose-400', bar: 'bg-rose-500', bg: 'bg-rose-500/15' }
}

export const SEVERITY_ORDER: Severity[] = ['critical', 'major', 'minor']

export const SEVERITY_BADGE: Record<Severity, 'rose' | 'violet' | 'slate'> = {
  critical: 'rose',
  major: 'violet',
  minor: 'slate',
}
