import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { applications, discoveries } from '@/lib/db/schema'
import type { MatchRow } from './discoveryMatch'

/**
 * Best-CV reads and writes (lib/cv-fit). Like the Match Score backfill, the
 * scoring fields are extracted in SQL (description cut to 8 000 chars, `raw`
 * never selected). Only postings still in play get a best CV: new,
 * shortlisted and saved.
 */

export const BEST_CV_STATUSES = ['new', 'shortlisted', 'saved'] as const

const n = (key: string) => sql<string | null>`${discoveries.normalized}->>${key}`

const MATCH_FIELDS = {
  id: discoveries.id,
  title: n('title'),
  location: n('location'),
  remoteType: n('remoteType'),
  employmentType: n('employmentType'),
  descriptionMd: sql<string | null>`left(coalesce(${discoveries.pastedJd}, ${discoveries.normalized}->>'descriptionMd'), 8000)`,
  techStack: sql<unknown>`${discoveries.normalized}->'techStack'`,
  salary: sql<unknown>`${discoveries.normalized}->'salary'`,
}

const inPlay = inArray(discoveries.status, [...BEST_CV_STATUSES])
const staleFor = (key: string) => or(isNull(discoveries.bestCvKey), ne(discoveries.bestCvKey, key))

/** In-play rows computed under another key (or never), oldest id first. */
export async function staleRows(userId: string, key: string, limit: number, client: DbClient = db): Promise<MatchRow[]> {
  return client
    .select(MATCH_FIELDS)
    .from(discoveries)
    .where(and(eq(discoveries.userId, userId), inPlay, staleFor(key)))
    .orderBy(asc(discoveries.id))
    .limit(limit)
}

/** These rows, when stale (the shortlist / detail pages fill them on read). */
export async function staleAmong(userId: string, key: string, ids: readonly string[], client: DbClient = db): Promise<MatchRow[]> {
  if (ids.length === 0) return []
  return client
    .select(MATCH_FIELDS)
    .from(discoveries)
    .where(and(eq(discoveries.userId, userId), inArray(discoveries.id, [...ids]), staleFor(key)))
}

export async function hasStale(userId: string, key: string, client: DbClient = db): Promise<boolean> {
  const [row] = await client
    .select({ id: discoveries.id })
    .from(discoveries)
    .where(and(eq(discoveries.userId, userId), inPlay, staleFor(key)))
    .limit(1)
  return row !== undefined
}

/** Write many rows' best CVs in ONE statement; `updated_at` is left alone. */
export async function applyBatch(
  userId: string,
  rows: ReadonlyArray<{ id: string; bestCv: unknown }>,
  key: string,
  client: DbClient = db,
): Promise<void> {
  if (rows.length === 0) return
  const values = sql.join(
    rows.map(({ id, bestCv }) => sql`(${id}::uuid, ${bestCv === null ? null : JSON.stringify(bestCv)}::jsonb)`),
    sql`, `,
  )
  await client.execute(sql`
    update discoveries as d set best_cv = v.best, best_cv_key = ${key}::text
    from (values ${values}) as v(id, best)
    where d.id = v.id and d.user_id = ${userId}::uuid
  `)
}

export async function setForApplication(
  userId: string,
  applicationId: string,
  bestCv: unknown,
  key: string,
  client: DbClient = db,
): Promise<void> {
  await client
    .update(applications)
    .set({ bestCv: bestCv as never, bestCvKey: key })
    .where(and(eq(applications.userId, userId), eq(applications.id, applicationId)))
}

export interface MatrixRow extends MatchRow {
  companyName: string | null
  status: string
  fitScore: number | null
}

/** Open postings for the Settings › Variants matrix: best Match Score first. */
export async function openForMatrix(userId: string, limit: number, client: DbClient = db): Promise<MatrixRow[]> {
  return client
    .select({ ...MATCH_FIELDS, companyName: n('companyName'), status: discoveries.status, fitScore: discoveries.fitScore })
    .from(discoveries)
    .where(and(eq(discoveries.userId, userId), inArray(discoveries.status, ['new', 'shortlisted'])))
    .orderBy(sql`${discoveries.fitScore} desc nulls last`, desc(discoveries.createdAt))
    .limit(limit)
}

/** The Match Score's missing must-haves of in-play postings found since `since`. */
export async function missingSince(userId: string, since: Date, limit = 1000, client: DbClient = db): Promise<string[][]> {
  const rows = await client
    .select({ missing: sql<unknown>`${discoveries.fitDetail}->'missing'` })
    .from(discoveries)
    .where(and(eq(discoveries.userId, userId), inPlay, gte(discoveries.createdAt, since), isNotNull(discoveries.fitDetail)))
    .orderBy(desc(discoveries.createdAt))
    .limit(limit)
  return rows.map((r) => (Array.isArray(r.missing) ? r.missing.filter((x): x is string => typeof x === 'string') : []))
}
