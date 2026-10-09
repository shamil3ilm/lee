import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { applications, cvTailorings, resumeVariants, resumeVariantVersions } from '@/lib/db/schema'

/**
 * Resetting résumé variants (Settings › Profile › Reset details). A variant
 * an application used — chosen for it, or the base of its tailored CV — or
 * one published to the portfolio is ARCHIVED with every version, so the
 * application history and the published file stay explained. The rest are
 * deleted with their versions. Applications and tailorings are never
 * written here.
 */

export type VariantRow = typeof resumeVariants.$inferSelect

/** Variant ids an application or a tailored CV references. */
export async function usedVariantIds(userId: string): Promise<Set<string>> {
  const [apps, tailored] = await Promise.all([
    db
      .select({ id: applications.resumeVariantId })
      .from(applications)
      .where(and(eq(applications.userId, userId), isNotNull(applications.resumeVariantId))),
    db
      .select({ id: cvTailorings.baseVariantId })
      .from(cvTailorings)
      .where(and(eq(cvTailorings.userId, userId), isNotNull(cvTailorings.baseVariantId))),
  ])
  return new Set([...apps, ...tailored].flatMap((r) => (r.id ? [r.id] : [])))
}

export async function listAll(userId: string): Promise<VariantRow[]> {
  return db.select().from(resumeVariants).where(eq(resumeVariants.userId, userId)).orderBy(asc(resumeVariants.name))
}

export async function versionsOf(userId: string, variantIds: readonly string[]): Promise<Array<{ variantId: string; version: number; recipe: unknown; createdAt: Date }>> {
  if (variantIds.length === 0) return []
  return db
    .select({ variantId: resumeVariantVersions.variantId, version: resumeVariantVersions.version, recipe: resumeVariantVersions.recipe, createdAt: resumeVariantVersions.createdAt })
    .from(resumeVariantVersions)
    .where(and(eq(resumeVariantVersions.userId, userId), inArray(resumeVariantVersions.variantId, [...variantIds])))
    .orderBy(asc(resumeVariantVersions.variantId), asc(resumeVariantVersions.version))
}

export async function archive(userId: string, ids: readonly string[], at: Date): Promise<number> {
  if (ids.length === 0) return 0
  const rows = await db
    .update(resumeVariants)
    .set({ archivedAt: at, updatedAt: at })
    .where(and(eq(resumeVariants.userId, userId), inArray(resumeVariants.id, [...ids])))
    .returning()
  return rows.length
}

/** Delete (versions cascade). */
export async function remove(userId: string, ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0
  const rows = await db
    .delete(resumeVariants)
    .where(and(eq(resumeVariants.userId, userId), inArray(resumeVariants.id, [...ids])))
    .returning()
  return rows.length
}
