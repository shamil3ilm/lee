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
