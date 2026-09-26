import { and, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { discoveries, jobRiskAssessments } from '@/lib/db/schema'

/**
 * v17 §1 — Scam Shield assessment rows. Every query is scoped by userId.
 * The pipeline upserts (never deletes); `user_verdict` is only written by
 * `setVerdict` so a re-assessment never overwrites the user's decision.
 */

export type RiskAssessmentRow = typeof jobRiskAssessments.$inferSelect
export type RiskTargetType = 'discovery' | 'job'
export type UserVerdict = 'not_scam' | 'confirmed_scam'

export interface AssessmentWrite {
  score: number
  level: string
  signals: unknown
  rulesVersion: string
  net: unknown
  allowListed: boolean
}

export async function upsert(
  userId: string,
  targetType: RiskTargetType,
  targetId: string,
  data: AssessmentWrite,
  client: DbClient = db,
): Promise<RiskAssessmentRow> {
  const values = {
    score: data.score,
    level: data.level,
    signals: data.signals as never,
    rulesVersion: data.rulesVersion,
    net: (data.net ?? null) as never,
    allowListed: data.allowListed,
  }
  const [row] = await client
    .insert(jobRiskAssessments)
    .values({ userId, targetType, targetId, ...values })
    .onConflictDoUpdate({
      target: [jobRiskAssessments.userId, jobRiskAssessments.targetType, jobRiskAssessments.targetId],
      set: { ...values, updatedAt: new Date() },
    })
    .returning()
  if (!row) throw new Error('failed to upsert job_risk_assessment')
  return row
}

/**
 * Upsert many assessments in one statement. Same conflict rule as `upsert`
 * (user_verdict is never touched). Returns nothing — batch callers only
 * need the count, which is `items.length`.
 */
export async function upsertMany(
  userId: string,
  items: ReadonlyArray<{ targetType: RiskTargetType; targetId: string; data: AssessmentWrite }>,
  client: DbClient = db,
): Promise<void> {
  if (items.length === 0) return
  // One row per target: a repeated target would make ON CONFLICT touch the
  // same row twice in one statement, which Postgres rejects.
  const unique = [...new Map(items.map((i) => [`${i.targetType}:${i.targetId}`, i])).values()]
  const excluded = (col: string) => sql.raw(`excluded.${col}`)
  await client
    .insert(jobRiskAssessments)
    .values(
      unique.map(({ targetType, targetId, data }) => ({
        userId,
        targetType,
        targetId,
        score: data.score,
        level: data.level,
        signals: data.signals as never,
        rulesVersion: data.rulesVersion,
        net: (data.net ?? null) as never,
        allowListed: data.allowListed,
      })),
    )
    .onConflictDoUpdate({
      target: [jobRiskAssessments.userId, jobRiskAssessments.targetType, jobRiskAssessments.targetId],
      set: {
        score: excluded('score'),
        level: excluded('level'),
        signals: excluded('signals'),
        rulesVersion: excluded('rules_version'),
        net: excluded('net'),
        allowListed: excluded('allow_listed'),
        updatedAt: new Date(),
      },
    })
}

export async function get(
  userId: string,
  targetType: RiskTargetType,
  targetId: string,
  client: DbClient = db,
): Promise<RiskAssessmentRow | null> {
  const [row] = await client
    .select()
    .from(jobRiskAssessments)
    .where(
      and(
        eq(jobRiskAssessments.userId, userId),
        eq(jobRiskAssessments.targetType, targetType),
        eq(jobRiskAssessments.targetId, targetId),
      ),
    )
    .limit(1)
  return row ?? null
}

/** Rows for many targets at once, keyed by target id. */
export async function mapForTargets(
  userId: string,
  targetType: RiskTargetType,
  targetIds: readonly string[],
  client: DbClient = db,
): Promise<Map<string, RiskAssessmentRow>> {
  if (targetIds.length === 0) return new Map()
  const rows = await client
    .select()
    .from(jobRiskAssessments)
    .where(
      and(
        eq(jobRiskAssessments.userId, userId),
        eq(jobRiskAssessments.targetType, targetType),
        inArray(jobRiskAssessments.targetId, [...targetIds]),
      ),
    )
  return new Map(rows.map((r) => [r.targetId, r]))
}

export async function setVerdict(
  userId: string,
  targetType: RiskTargetType,
  targetId: string,
  verdict: UserVerdict | null,
  client: DbClient = db,
): Promise<RiskAssessmentRow | null> {
  const [row] = await client
    .update(jobRiskAssessments)
    .set({ userVerdict: verdict, updatedAt: new Date() })
    .where(
      and(
        eq(jobRiskAssessments.userId, userId),
        eq(jobRiskAssessments.targetType, targetType),
        eq(jobRiskAssessments.targetId, targetId),
      ),
    )
    .returning()
  return row ?? null
}

/** Mark every assessment of this user as allow-listed (after a "not a scam"). */
export async function markAllowListed(
  userId: string,
  targetType: RiskTargetType,
  targetIds: readonly string[],
  client: DbClient = db,
): Promise<void> {
  if (targetIds.length === 0) return
  await client
    .update(jobRiskAssessments)
    .set({ allowListed: true, updatedAt: new Date() })
    .where(
      and(
        eq(jobRiskAssessments.userId, userId),
        eq(jobRiskAssessments.targetType, targetType),
        inArray(jobRiskAssessments.targetId, [...targetIds]),
      ),
    )
}

/**
 * SQL predicate: this discovery row is quarantined. Usable inside any
 * query over `discoveries` (plain select or relational `findMany`).
 */
export function discoveryQuarantinedSql(): SQL {
  return sql`exists (
    select 1 from ${jobRiskAssessments} jra
    where jra.user_id = ${discoveries.userId}
      and jra.target_type = 'discovery'
      and jra.target_id = ${discoveries.id}
      and (
        jra.user_verdict = 'confirmed_scam'
        or (jra.level = 'likely_scam' and jra.user_verdict is null and jra.allow_listed = false)
      )
  )`
}

export function discoveryNotQuarantinedSql(): SQL {
  return sql`not ${discoveryQuarantinedSql()}`
}

/**
 * Job discoveries with no assessment, or one from an older rules version.
 * Bounded; newest first so the inbox is covered before the archive.
 */
export async function staleDiscoveryIds(
  userId: string,
  rulesVersion: string,
  limit: number,
  client: DbClient = db,
): Promise<string[]> {
  const rows = await client
    .select({ id: discoveries.id })
    .from(discoveries)
    .leftJoin(
      jobRiskAssessments,
      and(
        eq(jobRiskAssessments.userId, discoveries.userId),
        eq(jobRiskAssessments.targetType, 'discovery'),
        eq(jobRiskAssessments.targetId, discoveries.id),
      ),
    )
    .where(
      and(
        eq(discoveries.userId, userId),
        sql`(${jobRiskAssessments.id} is null or ${jobRiskAssessments.rulesVersion} <> ${rulesVersion})`,
      ),
    )
    .orderBy(sql`${discoveries.createdAt} desc`)
    .limit(limit)
  return rows.map((r) => r.id)
}
