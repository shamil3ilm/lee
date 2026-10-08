import { and, asc, eq, isNull, ne, or, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { discoveries } from '@/lib/db/schema'
import type { FitColumns } from './discoveries'

/**
 * Match Score reads and writes on `discoveries` (lib/discovery/match).
 * The backfill reads only the fields the score needs — the description is
 * cut to 8 000 characters in SQL, and `raw` is never selected.
 */

const n = (key: string) => sql<string | null>`${discoveries.normalized}->>${key}`

export interface MatchRow {
  id: string
  title: string | null
  location: string | null
  remoteType: string | null
  employmentType: string | null
  descriptionMd: string | null
  techStack: unknown
  salary: unknown
}

/** Rows scored under another key (or never), oldest id first, at most `limit`. Any status. */
export async function staleRows(userId: string, key: string, limit: number, client: DbClient = db): Promise<MatchRow[]> {
  return client
    .select({
      id: discoveries.id,
      title: n('title'),
      location: n('location'),
      remoteType: n('remoteType'),
      employmentType: n('employmentType'),
      descriptionMd: sql<string | null>`left(${discoveries.normalized}->>'descriptionMd', 8000)`,
      techStack: sql<unknown>`${discoveries.normalized}->'techStack'`,
      salary: sql<unknown>`${discoveries.normalized}->'salary'`,
    })
    .from(discoveries)
    .where(and(eq(discoveries.userId, userId), or(isNull(discoveries.fitKey), ne(discoveries.fitKey, key))))
    .orderBy(asc(discoveries.id))
    .limit(limit)
}

/** One row's scoring fields plus its apply URL; null when not the user's. */
export async function rowForMatch(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<(MatchRow & { applyUrl: string | null }) | null> {
  const [row] = await client
    .select({
      id: discoveries.id,
      title: n('title'),
      location: n('location'),
      remoteType: n('remoteType'),
      employmentType: n('employmentType'),
      descriptionMd: sql<string | null>`left(${discoveries.normalized}->>'descriptionMd', 8000)`,
      techStack: sql<unknown>`${discoveries.normalized}->'techStack'`,
      salary: sql<unknown>`${discoveries.normalized}->'salary'`,
      applyUrl: n('applyUrl'),
    })
    .from(discoveries)
    .where(and(eq(discoveries.userId, userId), eq(discoveries.id, id)))
    .limit(1)
  return row ?? null
}

/**
 * Store a full JD on a discovery (pasted by the user or fetched from an ATS
 * API): `normalized.descriptionMd` plus `normalized.jdSource`, so every
 * later re-score and re-gate reads it.
 */
export async function setDescription(
  userId: string,
  id: string,
  text: string,
  source: 'pasted' | 'fetched',
  client: DbClient = db,
): Promise<boolean> {
  const rows = await client.execute(sql`
    update discoveries set
      normalized = jsonb_set(jsonb_set(normalized, '{descriptionMd}', to_jsonb(${text}::text)), '{jdSource}', to_jsonb(${source}::text)),
      updated_at = now()
    where id = ${id}::uuid and user_id = ${userId}::uuid
    returning id
  `)
  const list = (rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[])
  return Array.isArray(list) && list.length > 0
}

/** Write many rows' Match Scores in ONE statement. `updated_at` is left alone (not a user-visible change). */
export async function applyFitBatch(
  userId: string,
  rows: ReadonlyArray<{ id: string; fit: FitColumns }>,
  client: DbClient = db,
): Promise<void> {
  if (rows.length === 0) return
  const values = sql.join(
    rows.map(
      ({ id, fit }) =>
        sql`(${id}::uuid, ${fit.fitScore}::smallint, ${JSON.stringify(fit.fitDetail)}::jsonb, ${fit.fitKey}::text)`,
    ),
    sql`, `,
  )
  await client.execute(sql`
    update discoveries as d set
      fit_score = v.score,
      fit_detail = v.detail,
      fit_key = v.key
    from (values ${values}) as v(id, score, detail, key)
    where d.id = v.id and d.user_id = ${userId}::uuid
  `)
}
