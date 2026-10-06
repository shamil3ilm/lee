import { eq } from 'drizzle-orm'
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
  const reset = moved
    ? { lastSha: null, lastHash: null, lastCommitSha: null, lastCommitUrl: null, publishedAt: null }
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
