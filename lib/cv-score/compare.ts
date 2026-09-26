/**
 * v12.0 — comparison (tailoring delta) and batch scoring.
 */
import type { AIProvider } from '@/lib/ai/types'
import * as applicationsQ from '@/lib/db/queries/applications'
import * as documentsQ from '@/lib/db/queries/documents'
import { CvScoreError } from './errors'
import { COMPONENT_KEYS, HEADLINE_LABELS } from './headlines'
import { scoreCv, type CvScoreRecord } from './score'
import { loadDocumentSource } from './sources'
import type { ComponentHeadlineKey, CvScoreResult, HeadlineKey } from './types'
import type { KeywordDetails } from './dimensions/keywords'

export interface HeadlineDelta {
  key: HeadlineKey
  label: string
  a: number | null
  b: number | null
  delta: number | null
}

/** Per-headline deltas (b − a), Total first. Pure. */
export function headlineDeltas(a: CvScoreResult, b: CvScoreResult): HeadlineDelta[] {
  const row = (key: HeadlineKey, sa: number | null, sb: number | null): HeadlineDelta => ({
    key,
    label: key === 'total' ? a.total.label : HEADLINE_LABELS[key],
    a: sa,
    b: sb,
    delta: sa !== null && sb !== null ? sb - sa : null,
  })
  return [
    row('total', a.total.score, b.total.score),
    ...COMPONENT_KEYS.map((k) => row(k, a.scores[k].score, b.scores[k].score)),
  ]
}

export function deltaSummary(a: CvScoreResult, b: CvScoreResult, labelA: string, labelB: string): string {
  const sa = a.total.score ?? 0
  const sb = b.total.score ?? 0
  const what = a.total.label
  if (sb > sa) return `${labelB} raises your ${what} from ${sa} → ${sb} (+${sb - sa}) vs ${labelA}`
  if (sb < sa) return `${labelB} lowers your ${what} from ${sa} → ${sb} (${sb - sa}) vs ${labelA}`
  return `${labelA} and ${labelB} score the same ${what} (${sa})`
}

export interface CompareInput {
  userId: string
  documentIdA: string
  documentIdB: string
  applicationId?: string | null
  ai: AIProvider | null
  includeAi?: boolean
  now?: Date
}

export interface CompareResult {
  a: CvScoreRecord
  b: CvScoreRecord
  deltas: HeadlineDelta[]
  summary: string
}

export async function compareCvs(input: CompareInput): Promise<CompareResult> {
  if (input.documentIdA === input.documentIdB) {
    throw new CvScoreError('same_document', 'Pick two different CVs to compare.', 400)
  }
  const common = {
    userId: input.userId,
    applicationId: input.applicationId ?? null,
    ai: input.ai,
    includeAi: input.includeAi,
    now: input.now,
  }
  const a = await scoreCv({ ...common, source: { documentId: input.documentIdA } })
  const b = await scoreCv({ ...common, source: { documentId: input.documentIdB } })
  return { a, b, deltas: headlineDeltas(a, b), summary: deltaSummary(a, b, a.source.label, b.source.label) }
}

export const ACTIVE_STATUSES = ['saved', 'applied', 'screen', 'interview'] as const
const MAX_BATCH = 50

export interface BatchRow {
  applicationId: string
  jobTitle: string
  companyName: string | null
  status: string
  scoreId: string | null
  total: number | null
  grade: string | null
  scores: Record<ComponentHeadlineKey, number | null>
  missingSkills: string[]
  mode: 'jd' | 'general'
}

export interface BatchResult {
  masterDocumentId: string
  masterLabel: string
  includeAi: boolean
  rows: BatchRow[]
  truncated: boolean
}

export async function latestMasterDocument(userId: string): Promise<documentsQ.Document | null> {
  return documentsQ.getLatestMaster(userId)
}

/**
 * Score the latest master CV against every active application. Deterministic
 * dimensions only by default (fast, free); `includeAi` adds requirement fit.
 */
export async function batchScoreMaster(input: {
  userId: string
  ai: AIProvider | null
  includeAi?: boolean
  now?: Date
}): Promise<BatchResult> {
  const master = await latestMasterDocument(input.userId)
  if (!master) throw new CvScoreError('no_master_cv', 'Create your master CV first.', 404)
  const loaded = await loadDocumentSource(input.userId, master.id)
  const apps = (await applicationsQ.list(input.userId)).filter((a) =>
    (ACTIVE_STATUSES as readonly string[]).includes(a.status),
  )
  const includeAi = input.includeAi ?? false
  const rows: BatchRow[] = []
  for (const app of apps.slice(0, MAX_BATCH)) {
    const r = await scoreCv({
      userId: input.userId,
      source: loaded,
      applicationId: app.id,
      ai: input.ai,
      includeAi,
      now: input.now,
    })
    const kw = r.dimensions.keywords && !('skipped' in r.dimensions.keywords)
      ? ((r.dimensions.keywords.details as KeywordDetails).required ?? [])
          .filter((h) => h.status === 'missing')
          .map((h) => h.term)
      : []
    rows.push({
      applicationId: app.id,
      jobTitle: app.job.title,
      companyName: app.job.company?.name ?? null,
      status: app.status,
      scoreId: r.id,
      total: r.total.score,
      grade: r.total.grade,
      scores: Object.fromEntries(COMPONENT_KEYS.map((k) => [k, r.scores[k].score])) as Record<
        ComponentHeadlineKey,
        number | null
      >,
      missingSkills: kw,
      mode: r.mode,
    })
  }
  rows.sort((x, y) => (y.total ?? -1) - (x.total ?? -1))
  return {
    masterDocumentId: master.id,
    masterLabel: master.title,
    includeAi,
    rows,
    truncated: apps.length > MAX_BATCH,
  }
}
