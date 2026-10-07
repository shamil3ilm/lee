import { and, asc, desc, eq, gte, inArray, isNotNull, notInArray, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import {
  academyAttempts,
  academyDailyProblems,
  academyMockAssessments,
  academyProblemProgress,
  academySubmissions,
} from '@/lib/db/schema'

/** Coding workbench rows (phase 13.1). Every function is userId-scoped. */

export type ProgressRow = typeof academyProblemProgress.$inferSelect
export type SubmissionRow = typeof academySubmissions.$inferSelect
export type DailyRow = typeof academyDailyProblems.$inferSelect
export type MockRow = typeof academyMockAssessments.$inferSelect

/** Submissions kept per (user, problem): the latest N, plus the best and latest accepted. */
export const SUBMISSIONS_KEPT_PER_PROBLEM = 20
export const SUBMISSION_CODE_MAX_BYTES = 16_384

// --- progress ----------------------------------------------------------------

export async function listProgress(userId: string, client: DbClient = db): Promise<ProgressRow[]> {
  return client.select().from(academyProblemProgress).where(eq(academyProblemProgress.userId, userId))
}

export async function getProgress(userId: string, slug: string, client: DbClient = db): Promise<ProgressRow | null> {
  const [row] = await client
    .select()
    .from(academyProblemProgress)
    .where(and(eq(academyProblemProgress.userId, userId), eq(academyProblemProgress.problemSlug, slug)))
    .limit(1)
  return row ?? null
}

export interface SubmissionProgress {
  accepted: boolean
  runtimeMs: number | null
  language: string
  at: Date
}

/** Count one submission into the per-problem progress row (insert or update, atomically). */
export async function recordProgress(userId: string, slug: string, s: SubmissionProgress, client: DbClient = db): Promise<ProgressRow> {
  const t = academyProblemProgress
  const acceptedRuntime = s.accepted ? s.runtimeMs : null
  const [row] = await client
    .insert(t)
    .values({
      userId,
      problemSlug: slug,
      status: s.accepted ? 'solved' : 'attempted',
      submissions: 1,
      accepted: s.accepted ? 1 : 0,
      bestRuntimeMs: acceptedRuntime,
      bestLanguage: s.accepted ? s.language : null,
      firstSolvedAt: s.accepted ? s.at : null,
      lastSubmittedAt: s.at,
      updatedAt: s.at,
    })
    .onConflictDoUpdate({
      target: [t.userId, t.problemSlug],
      set: {
        status: s.accepted ? 'solved' : sql`${t.status}`,
        submissions: sql`${t.submissions} + 1`,
        accepted: sql`${t.accepted} + ${s.accepted ? 1 : 0}`,
        bestRuntimeMs:
          acceptedRuntime === null
            ? sql`${t.bestRuntimeMs}`
            : sql`case when ${t.bestRuntimeMs} is null or ${acceptedRuntime} < ${t.bestRuntimeMs} then ${acceptedRuntime} else ${t.bestRuntimeMs} end`,
        bestLanguage:
          acceptedRuntime === null
            ? sql`${t.bestLanguage}`
            : sql`case when ${t.bestRuntimeMs} is null or ${acceptedRuntime} < ${t.bestRuntimeMs} then ${s.language} else ${t.bestLanguage} end`,
        firstSolvedAt: s.accepted ? sql`coalesce(${t.firstSolvedAt}, ${s.at.toISOString()}::timestamptz)` : sql`${t.firstSolvedAt}`,
        lastSubmittedAt: s.at,
        updatedAt: s.at,
      },
    })
    .returning()
  if (!row) throw new Error('academy_problem_progress upsert returned no row')
  return row
}

export async function solvedCount(userId: string, client: DbClient = db): Promise<number> {
  const [row] = await client
    .select({ n: sql<number>`count(*)::int` })
    .from(academyProblemProgress)
    .where(and(eq(academyProblemProgress.userId, userId), eq(academyProblemProgress.status, 'solved')))
  return Number(row?.n ?? 0)
}

/** Record that hint `count` was revealed (never lowers the count). */
export async function recordHints(userId: string, slug: string, count: number, client: DbClient = db): Promise<number> {
  const t = academyProblemProgress
  const [row] = await client
    .insert(t)
    .values({ userId, problemSlug: slug, hintsUsed: count })
    .onConflictDoUpdate({
      target: [t.userId, t.problemSlug],
      set: { hintsUsed: sql`greatest(${t.hintsUsed}, ${count})`, updatedAt: new Date() },
    })
    .returning()
  return row?.hintsUsed ?? count
}

/** The user opened the solution without solving: keep the first time. */
export async function recordGaveUp(userId: string, slug: string, at: Date, client: DbClient = db): Promise<void> {
  const t = academyProblemProgress
  await client
    .insert(t)
    .values({ userId, problemSlug: slug, gaveUpAt: at })
    .onConflictDoUpdate({ target: [t.userId, t.problemSlug], set: { gaveUpAt: sql`coalesce(${t.gaveUpAt}, ${at.toISOString()}::timestamptz)` } })
}

// --- submissions ---------------------------------------------------------------

export type NewSubmission = Omit<typeof academySubmissions.$inferInsert, 'userId' | 'id'>

/** Code over the cap is cut at a character boundary below 16 KB. */
export function capCode(code: string): string {
  const bytes = new TextEncoder().encode(code)
  if (bytes.length <= SUBMISSION_CODE_MAX_BYTES) return code
  const marker = '\n/* … truncated */'
  return `${new TextDecoder().decode(bytes.slice(0, SUBMISSION_CODE_MAX_BYTES - 64)).replace(/�+$/, '')}${marker}`
}

export async function addSubmission(userId: string, values: NewSubmission, client: DbClient = db): Promise<SubmissionRow> {
  const [row] = await client
    .insert(academySubmissions)
    .values({ ...values, code: capCode(values.code), userId })
    .returning()
  if (!row) throw new Error('academy_submissions insert returned no row')
  return row
}

export async function listSubmissions(userId: string, slug: string, limit = SUBMISSIONS_KEPT_PER_PROBLEM + 2, client: DbClient = db): Promise<SubmissionRow[]> {
  return client
    .select()
    .from(academySubmissions)
    .where(and(eq(academySubmissions.userId, userId), eq(academySubmissions.problemSlug, slug)))
    .orderBy(desc(academySubmissions.createdAt))
    .limit(Math.min(limit, 100))
}

/** Accepted runtimes for one problem and language (for "faster than X% of your runs"). */
export async function acceptedRuntimes(userId: string, slug: string, language: string, client: DbClient = db): Promise<number[]> {
  const rows = await client
    .select({ ms: academySubmissions.runtimeMs })
    .from(academySubmissions)
    .where(
      and(
        eq(academySubmissions.userId, userId),
        eq(academySubmissions.problemSlug, slug),
        eq(academySubmissions.language, language),
        eq(academySubmissions.verdict, 'accepted'),
        isNotNull(academySubmissions.runtimeMs),
      ),
    )
  return rows.map((r) => r.ms ?? 0)
}

/**
 * Retention for one (user, problem): keep the latest N submissions plus the
 * fastest and the latest accepted ones; delete the rest. The attempt rows
 * (scores and history) are never touched. Returns rows deleted.
 */
export async function pruneSubmissions(userId: string, slug: string, keep = SUBMISSIONS_KEPT_PER_PROBLEM, client: DbClient = db): Promise<number> {
  const t = academySubmissions
  const scope = and(eq(t.userId, userId), eq(t.problemSlug, slug))
  const latest = await client.select({ id: t.id }).from(t).where(scope).orderBy(desc(t.createdAt)).limit(keep)
  const accepted = and(scope, eq(t.verdict, 'accepted'))
  const [fastest] = await client.select({ id: t.id }).from(t).where(accepted).orderBy(asc(t.runtimeMs), desc(t.createdAt)).limit(1)
  const [lastAccepted] = await client.select({ id: t.id }).from(t).where(accepted).orderBy(desc(t.createdAt)).limit(1)
  const kept = [...new Set([...latest.map((r) => r.id), fastest?.id, lastAccepted?.id].filter((x): x is string => !!x))]
  if (kept.length === 0) return 0
  const deleted = await client.delete(t).where(and(scope, notInArray(t.id, kept))).returning()
  return deleted.length
}

/** Problems of a user with more than `keep` submissions (the retention step's work list). */
export async function problemsOverCap(userId: string | null, keep = SUBMISSIONS_KEPT_PER_PROBLEM, limit = 200, client: DbClient = db): Promise<Array<{ userId: string; slug: string }>> {
  const t = academySubmissions
  const rows = await client
    .select({ userId: t.userId, slug: t.problemSlug })
    .from(t)
    .where(userId ? eq(t.userId, userId) : sql`true`)
    .groupBy(t.userId, t.problemSlug)
    .having(sql`count(*) > ${keep + 2}`)
    .limit(limit)
  return rows
}

// --- daily problem ---------------------------------------------------------------

export async function getDaily(userId: string, date: string, client: DbClient = db): Promise<DailyRow | null> {
  const [row] = await client
    .select()
    .from(academyDailyProblems)
    .where(and(eq(academyDailyProblems.userId, userId), eq(academyDailyProblems.date, date)))
    .limit(1)
  return row ?? null
}

/** The day's problem, fixed once chosen (a concurrent insert keeps the first). */
export async function ensureDaily(userId: string, date: string, slug: string, client: DbClient = db): Promise<DailyRow> {
  await client.insert(academyDailyProblems).values({ userId, date, problemSlug: slug }).onConflictDoNothing()
  const row = await getDaily(userId, date, client)
  if (!row) throw new Error('academy_daily_problems insert returned no row')
  return row
}

export async function markDailySolved(userId: string, slug: string, today: string, at: Date, client: DbClient = db): Promise<boolean> {
  const rows = await client
    .update(academyDailyProblems)
    .set({ solvedAt: at })
    .where(
      and(
        eq(academyDailyProblems.userId, userId),
        eq(academyDailyProblems.date, today),
        eq(academyDailyProblems.problemSlug, slug),
        sql`${academyDailyProblems.solvedAt} is null`,
      ),
    )
    .returning()
  return rows.length > 0
}

/** Days with a solved daily problem, newest first (for the daily streak). */
export async function solvedDailyDates(userId: string, limit = 400, client: DbClient = db): Promise<string[]> {
  const rows = await client
    .select({ date: academyDailyProblems.date })
    .from(academyDailyProblems)
    .where(and(eq(academyDailyProblems.userId, userId), isNotNull(academyDailyProblems.solvedAt)))
    .orderBy(desc(academyDailyProblems.date))
    .limit(limit)
  return rows.map((r) => r.date)
}

// --- mock assessments --------------------------------------------------------------

export async function createMock(
  userId: string,
  values: { problemSlugs: string[]; durationMin: number; startedAt: Date; endsAt: Date },
  client: DbClient = db,
): Promise<MockRow> {
  const [row] = await client
    .insert(academyMockAssessments)
    .values({ ...values, userId })
    .returning()
  if (!row) throw new Error('academy_mock_assessments insert returned no row')
  return row
}

export async function getMock(userId: string, id: string, client: DbClient = db): Promise<MockRow | null> {
  const [row] = await client
    .select()
    .from(academyMockAssessments)
    .where(and(eq(academyMockAssessments.userId, userId), eq(academyMockAssessments.id, id)))
    .limit(1)
  return row ?? null
}

export async function listMocks(userId: string, limit = 20, client: DbClient = db): Promise<MockRow[]> {
  return client
    .select()
    .from(academyMockAssessments)
    .where(eq(academyMockAssessments.userId, userId))
    .orderBy(desc(academyMockAssessments.startedAt))
    .limit(limit)
}

/** Finish once: returns null when it was already finished. */
export async function finishMock(
  userId: string,
  id: string,
  values: { finishedAt: Date; score: number; results: unknown },
  client: DbClient = db,
): Promise<MockRow | null> {
  const [row] = await client
    .update(academyMockAssessments)
    .set(values)
    .where(and(eq(academyMockAssessments.userId, userId), eq(academyMockAssessments.id, id), sql`${academyMockAssessments.finishedAt} is null`))
    .returning()
  return row ?? null
}

export async function mockSubmissions(userId: string, mockId: string, client: DbClient = db): Promise<SubmissionRow[]> {
  return client
    .select()
    .from(academySubmissions)
    .where(and(eq(academySubmissions.userId, userId), eq(academySubmissions.mockId, mockId)))
    .orderBy(asc(academySubmissions.createdAt))
}

// --- stats --------------------------------------------------------------------------

/** Coding attempts per local day and language since `since` (from the append-only attempts). */
export async function codingActivity(
  userId: string,
  since: Date,
  timeZone: string,
  client: DbClient = db,
): Promise<Array<{ day: string; language: string; count: number }>> {
  const a = academyAttempts
  const day = sql<string>`to_char(${a.submittedAt} at time zone ${timeZone}, 'YYYY-MM-DD')`
  const language = sql<string>`coalesce(${a.submission}->>'language', 'unknown')`
  const rows = await client
    .select({ day, language, count: sql<number>`count(*)::int` })
    .from(a)
    .where(and(eq(a.userId, userId), eq(a.format, 'coding'), isNotNull(a.submittedAt), gte(a.submittedAt, since)))
    .groupBy(sql`1`, sql`2`)
  return rows.map((r) => ({ day: r.day, language: r.language, count: Number(r.count) }))
}

/** All-time coding submissions per language (attempts are never deleted). */
export async function languageTotals(userId: string, client: DbClient = db): Promise<Array<{ language: string; count: number }>> {
  const a = academyAttempts
  const language = sql<string>`coalesce(${a.submission}->>'language', 'unknown')`
  const rows = await client
    .select({ language, count: sql<number>`count(*)::int` })
    .from(a)
    .where(and(eq(a.userId, userId), eq(a.format, 'coding'), isNotNull(a.submittedAt)))
    .groupBy(language)
  return rows.map((r) => ({ language: r.language, count: Number(r.count) }))
}

export async function progressFor(userId: string, slugs: readonly string[], client: DbClient = db): Promise<ProgressRow[]> {
  if (slugs.length === 0) return []
  return client
    .select()
    .from(academyProblemProgress)
    .where(and(eq(academyProblemProgress.userId, userId), inArray(academyProblemProgress.problemSlug, [...slugs])))
}
