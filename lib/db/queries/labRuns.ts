import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { labRunResults, labRuns } from '@/lib/db/schema'

/**
 * v14 — Model Lab runs + per-model results. Every read/write is scoped to
 * the owning user; results are reached only through a run the user owns.
 */

export type LabRun = typeof labRuns.$inferSelect
export type LabRunResult = typeof labRunResults.$inferSelect
export type NewLabRunResult = Omit<typeof labRunResults.$inferInsert, 'id' | 'runId' | 'createdAt'>

export async function createRun(
  userId: string,
  kind: 'arena' | 'eval' | 'agent',
  config: unknown,
): Promise<LabRun> {
  const [row] = await db.insert(labRuns).values({ userId, kind, config }).returning()
  if (!row) throw new Error('labRuns.createRun: no row returned')
  return row
}

export async function insertResults(runId: string, rows: NewLabRunResult[]): Promise<LabRunResult[]> {
  if (rows.length === 0) return []
  return db
    .insert(labRunResults)
    .values(rows.map((r) => ({ ...r, runId })))
    .returning()
}

export async function updateResult(
  runId: string,
  resultId: string,
  patch: Partial<Pick<LabRunResult, 'output' | 'outputJson' | 'metrics' | 'schemaValid' | 'error'>>,
): Promise<LabRunResult | null> {
  const [row] = await db
    .update(labRunResults)
    .set(patch)
    .where(and(eq(labRunResults.id, resultId), eq(labRunResults.runId, runId)))
    .returning()
  return row ?? null
}

export async function getRun(userId: string, runId: string): Promise<LabRun | null> {
  const [row] = await db
    .select()
    .from(labRuns)
    .where(and(eq(labRuns.id, runId), eq(labRuns.userId, userId)))
    .limit(1)
  return row ?? null
}

export async function getRunWithResults(
  userId: string,
  runId: string,
): Promise<{ run: LabRun; results: LabRunResult[] } | null> {
  const run = await getRun(userId, runId)
  if (!run) return null
  const results = await db
    .select()
    .from(labRunResults)
    .where(eq(labRunResults.runId, runId))
    .orderBy(labRunResults.blindLabel, labRunResults.createdAt)
  return { run, results }
}

export interface RunSummary {
  id: string
  kind: string
  config: unknown
  createdAt: Date
  resultCount: number
  voted: boolean
}

export async function listRuns(userId: string, limit = 20): Promise<RunSummary[]> {
  const runs = await db
    .select()
    .from(labRuns)
    .where(eq(labRuns.userId, userId))
    .orderBy(desc(labRuns.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100))
  if (runs.length === 0) return []
  const counts = await db
    .select({
      runId: labRunResults.runId,
      n: sql<number>`count(*)::int`,
      votes: sql<number>`count(${labRunResults.vote})::int`,
    })
    .from(labRunResults)
    .where(
      inArray(
        labRunResults.runId,
        runs.map((r) => r.id),
      ),
    )
    .groupBy(labRunResults.runId)
  const byRun = new Map(counts.map((c) => [c.runId, c]))
  return runs.map((r) => ({
    id: r.id,
    kind: r.kind,
    config: r.config,
    createdAt: r.createdAt,
    resultCount: byRun.get(r.id)?.n ?? 0,
    voted: (byRun.get(r.id)?.votes ?? 0) > 0,
  }))
}

/**
 * Record the user's pick for a run: the chosen result gets vote=1, every
 * other result in the run is cleared. Returns null when the run isn't the
 * user's or the result isn't in that run.
 */
export async function recordVote(
  userId: string,
  runId: string,
  resultId: string,
): Promise<LabRunResult[] | null> {
  const run = await getRun(userId, runId)
  if (!run) return null
  const [target] = await db
    .select({ id: labRunResults.id })
    .from(labRunResults)
    .where(and(eq(labRunResults.id, resultId), eq(labRunResults.runId, runId)))
    .limit(1)
  if (!target) return null
  await db.transaction(async (tx) => {
    await tx.update(labRunResults).set({ vote: null }).where(eq(labRunResults.runId, runId))
    await tx.update(labRunResults).set({ vote: 1 }).where(eq(labRunResults.id, resultId))
  })
  const res = await getRunWithResults(userId, runId)
  return res?.results ?? null
}

export interface WinRateRow {
  provider: string
  model: string
  appearances: number
  wins: number
  winRate: number
}

/**
 * Personal leaderboard from blind votes: for every run where the user voted,
 * each participating model gets an appearance; the voted one gets a win.
 */
export async function winRates(userId: string): Promise<WinRateRow[]> {
  const rows = await db
    .select({
      provider: labRunResults.modelProvider,
      model: labRunResults.modelId,
      appearances: sql<number>`count(*)::int`,
      wins: sql<number>`count(*) filter (where ${labRunResults.vote} = 1)::int`,
    })
    .from(labRunResults)
    .innerJoin(labRuns, eq(labRuns.id, labRunResults.runId))
    .where(
      and(
        eq(labRuns.userId, userId),
        sql`exists (select 1 from lab_run_results v where v.run_id = ${labRunResults.runId} and v.vote = 1)`,
      ),
    )
    .groupBy(labRunResults.modelProvider, labRunResults.modelId)
  return rows
    .map((r) => ({ ...r, winRate: r.appearances > 0 ? r.wins / r.appearances : 0 }))
    .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || a.model.localeCompare(b.model))
}
