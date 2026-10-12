import { and, eq, isNull, ne, or, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { discoveries } from '@/lib/db/schema'

/**
 * Benefits columns on discoveries (lib/benefits): the score, its stated
 * items and explanation, and the key (rules version + weights + floor) they
 * were computed under. Every statement is scoped by user_id.
 */

export interface StaleBenefitsRow {
  id: string
  normalized: unknown
  pastedJd: string | null
}

/** Up to `limit` rows of the user stored under a key other than `key`. */
export async function staleRows(userId: string, key: string, limit: number, client: DbClient = db): Promise<StaleBenefitsRow[]> {
  if (limit <= 0) return []
  return client
    .select({ id: discoveries.id, normalized: discoveries.normalized, pastedJd: discoveries.pastedJd })
    .from(discoveries)
    .where(and(eq(discoveries.userId, userId), or(isNull(discoveries.benefitsKey), ne(discoveries.benefitsKey, key))))
    .limit(limit)
}

export interface BenefitsWrite {
  id: string
  benefitsScore: number | null
  benefitsDetail: unknown
  benefitsKey: string
}

/** Write many rows' benefits in one statement (only the user's own rows). */
export async function writeMany(userId: string, rows: readonly BenefitsWrite[], client: DbClient = db): Promise<void> {
  if (rows.length === 0) return
  const payload = JSON.stringify(
    rows.map((r) => ({ id: r.id, score: r.benefitsScore, detail: r.benefitsDetail, key: r.benefitsKey })),
  )
  await client.execute(sql`
    update discoveries d
    set benefits_score = v.score,
        benefits_detail = v.detail,
        benefits_key = v.key
    from jsonb_to_recordset(${payload}::jsonb) as v(id uuid, score smallint, detail jsonb, key text)
    where d.id = v.id and d.user_id = ${userId}::uuid
  `)
}

/** The benefits detail of one of the user's rows (null when none). */
export async function detailFor(userId: string, id: string, client: DbClient = db): Promise<unknown> {
  const [row] = await client
    .select({ detail: discoveries.benefitsDetail })
    .from(discoveries)
    .where(and(eq(discoveries.userId, userId), eq(discoveries.id, id)))
    .limit(1)
  return row?.detail ?? null
}
