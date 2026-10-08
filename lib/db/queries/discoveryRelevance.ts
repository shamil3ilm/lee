import { and, asc, eq, gte, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { db, type DbClient } from '@/lib/db/client'
import { discoveries } from '@/lib/db/schema'
import type * as schema from '@/lib/db/schema'
import type { GateColumns } from './discoveries'

/**
 * Relevance-gate reads and writes on `discoveries` (lib/discovery/relevance).
 * Re-evaluation reads only the fields the gate needs — the description is
 * cut to 8 000 characters in SQL, and `raw` is never selected.
 */

function writer(client: DbClient): PostgresJsDatabase<typeof schema> {
  return client as unknown as PostgresJsDatabase<typeof schema>
}

const n = (key: string) => sql<string | null>`${discoveries.normalized}->>${key}`

export interface GateRow {
  id: string
  status: string
  filterOverride: boolean
  title: string | null
  location: string | null
  remoteType: string | null
  employmentType: string | null
  descriptionMd: string | null
  techStack: unknown
  salary: unknown
}

/** Rows gated under another key (or never), oldest id first, at most `limit`. */
export async function staleRows(
  userId: string,
  key: string,
  limit: number,
  client: DbClient = db,
): Promise<GateRow[]> {
  return client
    .select({
      id: discoveries.id,
      status: discoveries.status,
      filterOverride: discoveries.filterOverride,
      title: n('title'),
      location: n('location'),
      remoteType: n('remoteType'),
      employmentType: n('employmentType'),
      descriptionMd: sql<string | null>`left(${discoveries.normalized}->>'descriptionMd', 8000)`,
      techStack: sql<unknown>`${discoveries.normalized}->'techStack'`,
      salary: sql<unknown>`${discoveries.normalized}->'salary'`,
    })
    .from(discoveries)
    .where(
      and(
        eq(discoveries.userId, userId),
        or(isNull(discoveries.relevanceKey), ne(discoveries.relevanceKey, key)),
      ),
    )
    .orderBy(asc(discoveries.id))
    .limit(limit)
}

/** Gate fields for specific rows (learning from "Show anyway", saves). */
export async function rowsByIds(userId: string, ids: readonly string[], client: DbClient = db): Promise<GateRow[]> {
  if (ids.length === 0) return []
  return client
    .select({
      id: discoveries.id,
      status: discoveries.status,
      filterOverride: discoveries.filterOverride,
      title: n('title'),
      location: n('location'),
      remoteType: n('remoteType'),
      employmentType: n('employmentType'),
      descriptionMd: sql<string | null>`left(${discoveries.normalized}->>'descriptionMd', 8000)`,
      techStack: sql<unknown>`${discoveries.normalized}->'techStack'`,
      salary: sql<unknown>`${discoveries.normalized}->'salary'`,
    })
    .from(discoveries)
    .where(and(eq(discoveries.userId, userId), inArray(discoveries.id, [...ids])))
}

export interface FilteredByDomain {
  id: string
  title: string | null
  reason: string | null
}

/** Rows the domain rule filtered since `since` (title + reason only). */
export async function filteredByDomainSince(
  userId: string,
  since: Date,
  limit = 2_000,
  client: DbClient = db,
): Promise<FilteredByDomain[]> {
  return client
    .select({ id: discoveries.id, title: n('title'), reason: discoveries.filterReason })
    .from(discoveries)
    .where(
      and(
        eq(discoveries.userId, userId),
        eq(discoveries.status, 'filtered'),
        gte(discoveries.createdAt, since),
        sql`${discoveries.filterReason} like 'domain:%'`,
      ),
    )
    .limit(limit)
}

/** How many rows still wait for a re-gate under `key`, and how many are filtered now. */
export async function progress(
  userId: string,
  key: string,
  client: DbClient = db,
): Promise<{ remaining: number; filtered: number }> {
  const [row] = await client
    .select({
      remaining: sql<number>`count(*) filter (where ${discoveries.relevanceKey} is null or ${discoveries.relevanceKey} <> ${key})`,
      filtered: sql<number>`count(*) filter (where ${discoveries.status} = 'filtered')`,
    })
    .from(discoveries)
    .where(eq(discoveries.userId, userId))
  return { remaining: Number(row?.remaining ?? 0), filtered: Number(row?.filtered ?? 0) }
}

function textArray(values: readonly string[]): string {
  // Values come from a fixed tag set; quote anyway so the literal is always valid.
  return `{${values.map((v) => `"${v.replace(/["\\]/g, '')}"`).join(',')}}`
}

/**
 * Write gate outcomes for many rows in ONE statement. Only inbox rows
 * (`new`/`filtered`) that the user has not overridden change status;
 * shortlisted, saved and dismissed rows keep theirs but get fresh tags,
 * notes and key. `updated_at` moves only when the status does.
 */
export async function applyGateBatch(
  userId: string,
  key: string,
  rows: ReadonlyArray<{ id: string; gate: GateColumns }>,
  client: DbClient = db,
): Promise<void> {
  if (rows.length === 0) return
  const values = sql.join(
    rows.map(
      ({ id, gate }) =>
        sql`(${id}::uuid, ${gate.status}::text, ${gate.filterReason}::text, ${textArray(gate.regions)}::text[], ${JSON.stringify(gate.relevanceNotes)}::jsonb, ${gate.rankAdjust}::smallint)`,
    ),
    sql`, `,
  )
  await client.execute(sql`
    update discoveries as d set
      status = case when d.status in ('new', 'filtered') and not d.filter_override then v.status else d.status end,
      updated_at = case
        when d.status in ('new', 'filtered') and not d.filter_override and d.status <> v.status then now()
        else d.updated_at end,
      filter_reason = v.reason,
      regions = v.regions,
      relevance_notes = v.notes,
      rank_adjust = v.adjust,
      relevance_key = ${key}
    from (values ${values}) as v(id, status, reason, regions, notes, adjust)
    where d.id = v.id and d.user_id = ${userId}::uuid
  `)
}

/** "Show anyway": filtered → new, and never filtered again by re-evaluation. */
export async function showAnyway(
  userId: string,
  ids: readonly string[],
  client: DbClient = db,
): Promise<number> {
  if (ids.length === 0) return 0
  const rows = await writer(client)
    .update(discoveries)
    .set({ status: 'new', filterOverride: true, updatedAt: new Date() })
    .where(
      and(eq(discoveries.userId, userId), inArray(discoveries.id, [...ids]), eq(discoveries.status, 'filtered')),
    )
    .returning({ id: discoveries.id })
  return rows.length
}

/** "Dismiss all filtered" — one UPDATE; returns how many moved. */
export async function dismissAllFiltered(userId: string, client: DbClient = db): Promise<number> {
  const rows = await writer(client)
    .update(discoveries)
    .set({ status: 'dismissed', updatedAt: new Date() })
    .where(and(eq(discoveries.userId, userId), eq(discoveries.status, 'filtered')))
    .returning({ id: discoveries.id })
  return rows.length
}
