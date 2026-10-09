import { eq, isNotNull, ne, or } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { portfolioPublish } from '@/lib/db/schema'

export type PortfolioPublishRow = typeof portfolioPublish.$inferSelect

export async function get(userId: string): Promise<PortfolioPublishRow | null> {
  const [row] = await db.select().from(portfolioPublish).where(eq(portfolioPublish.userId, userId)).limit(1)
  return row ?? null
}

/** Save repo / branch / path. A new target forgets what lee last wrote (it was another file). */
export async function saveConfig(
  userId: string,
  config: { repo: string; branch: string; path: string },
): Promise<PortfolioPublishRow> {
  const current = await get(userId)
  const moved =
    current !== null && (current.repo !== config.repo || current.branch !== config.branch || current.path !== config.path)
  // Another file: forget what lee wrote there AND what it pulled from the old one.
  const reset = moved
    ? {
        lastSha: null,
        lastHash: null,
        lastCommitSha: null,
        lastCommitUrl: null,
        publishedAt: null,
        pulledSha: null,
        pulledAt: null,
        pullCheckedAt: null,
        pullSource: null,
        pullError: null,
        lastPullDiff: [],
      }
    : {}
  const [row] = await db
    .insert(portfolioPublish)
    .values({ userId, ...config })
    .onConflictDoUpdate({ target: portfolioPublish.userId, set: { ...config, ...reset, updatedAt: new Date() } })
    .returning()
  if (!row) throw new Error('portfolio_publish upsert returned no row')
  return row
}

export interface PublishRecord {
  lastSha: string
  lastHash: string
  lastVersion: string
  lastCommitSha: string | null
  lastCommitUrl: string | null
  publishedAt: Date | null
}

export async function recordPublish(userId: string, record: PublishRecord): Promise<void> {
  await db
    .update(portfolioPublish)
    .set({ ...record, updatedAt: new Date() })
    .where(eq(portfolioPublish.userId, userId))
}

/** A look at the source that applied nothing (unchanged, missing, or failed). Upserts. */
export async function recordPullCheck(userId: string, input: { checkedAt: Date; error: string | null }): Promise<void> {
  const set = { pullCheckedAt: input.checkedAt, pullError: input.error, updatedAt: new Date() }
  await db.insert(portfolioPublish).values({ userId, ...set }).onConflictDoUpdate({ target: portfolioPublish.userId, set })
}

export interface PullRecord {
  pulledSha: string
  pulledAt: Date
  source: 'github' | 'site'
  diff: unknown[]
  orphans: unknown[]
}

/** An applied pull: the sha lee now mirrors, what changed, and the orphaned overlay. Upserts. */
export async function recordPull(userId: string, input: PullRecord): Promise<void> {
  const set = {
    pulledSha: input.pulledSha,
    pulledAt: input.pulledAt,
    pullCheckedAt: input.pulledAt,
    pullSource: input.source,
    pullError: null,
    lastPullDiff: input.diff,
    orphans: input.orphans,
    updatedAt: new Date(),
  }
  await db.insert(portfolioPublish).values({ userId, ...set }).onConflictDoUpdate({ target: portfolioPublish.userId, set })
}

export async function setOrphans(userId: string, orphans: unknown[]): Promise<void> {
  await db.update(portfolioPublish).set({ orphans, updatedAt: new Date() }).where(eq(portfolioPublish.userId, userId))
}

/** Users the daily pull visits: a repository is set, or lee has pulled before (site fallback). */
export async function listPullUsers(): Promise<string[]> {
  const rows = await db
    .select({ userId: portfolioPublish.userId })
    .from(portfolioPublish)
    .where(or(ne(portfolioPublish.repo, ''), isNotNull(portfolioPublish.pulledSha)))
  return rows.map((r) => r.userId)
}
