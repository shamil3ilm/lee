import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { githubRepoStats } from '@/lib/db/schema'

/** Settings › Résumé › From GitHub: the compact per-repo cache. User-scoped. */

export type RepoStatsRow = typeof githubRepoStats.$inferSelect

export interface RepoStatsInput {
  fullName: string
  isPrivate: boolean
  htmlUrl: string
  description: string | null
  topics: string[]
  languages: Array<{ name: string; share: number }>
  stars: number
  pushedAt: Date | null
  lastCommitAt: Date | null
  userCommits: number
  userPrs: number
}

export async function list(userId: string): Promise<RepoStatsRow[]> {
  return db
    .select()
    .from(githubRepoStats)
    .where(eq(githubRepoStats.userId, userId))
    .orderBy(desc(githubRepoStats.pushedAt), asc(githubRepoStats.fullName))
}

export async function get(userId: string, fullName: string): Promise<RepoStatsRow | null> {
  const [row] = await db
    .select()
    .from(githubRepoStats)
    .where(and(eq(githubRepoStats.userId, userId), eq(githubRepoStats.fullName, fullName)))
    .limit(1)
  return row ?? null
}

/** Insert or refresh the counts; the user's link and follow choices are kept. */
export async function upsert(userId: string, input: RepoStatsInput, now: Date): Promise<void> {
  await db
    .insert(githubRepoStats)
    .values({ userId, ...input, fetchedAt: now })
    .onConflictDoUpdate({
      target: [githubRepoStats.userId, githubRepoStats.fullName],
      set: { ...input, fetchedAt: now },
    })
}

export async function setLink(userId: string, fullName: string, projectId: string | null): Promise<boolean> {
  const rows = await db
    .update(githubRepoStats)
    .set({ linkedProjectId: projectId })
    .where(and(eq(githubRepoStats.userId, userId), eq(githubRepoStats.fullName, fullName)))
    .returning()
  return rows.length > 0
}

export async function setFollowDeps(userId: string, fullName: string, follow: boolean): Promise<boolean> {
  const rows = await db
    .update(githubRepoStats)
    .set({ followDeps: follow })
    .where(and(eq(githubRepoStats.userId, userId), eq(githubRepoStats.fullName, fullName)))
    .returning()
  return rows.length > 0
}

export async function removeAll(userId: string): Promise<number> {
  const rows = await db.delete(githubRepoStats).where(eq(githubRepoStats.userId, userId)).returning()
  return rows.length
}

export async function count(userId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(githubRepoStats).where(eq(githubRepoStats.userId, userId))
  return row?.n ?? 0
}
