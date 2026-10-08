import { and, asc, desc, eq, isNull, ne } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { applications, resumeVariants, resumeVariantVersions } from '@/lib/db/schema'

/** Résumé variants and their versions. Every function is userId-scoped. */

export type ResumeVariantRow = typeof resumeVariants.$inferSelect
export type ResumeVariantVersionRow = typeof resumeVariantVersions.$inferSelect

export async function list(userId: string, opts: { archived?: boolean } = {}): Promise<ResumeVariantRow[]> {
  const filters = [eq(resumeVariants.userId, userId)]
  if (!opts.archived) filters.push(isNull(resumeVariants.archivedAt))
  return db.select().from(resumeVariants).where(and(...filters)).orderBy(desc(resumeVariants.updatedAt))
}

export async function getById(userId: string, id: string): Promise<ResumeVariantRow | null> {
  const [row] = await db
    .select()
    .from(resumeVariants)
    .where(and(eq(resumeVariants.userId, userId), eq(resumeVariants.id, id)))
    .limit(1)
  return row ?? null
}

export async function getVersion(userId: string, variantId: string, version: number): Promise<ResumeVariantVersionRow | null> {
  const [row] = await db
    .select()
    .from(resumeVariantVersions)
    .where(
      and(
        eq(resumeVariantVersions.userId, userId),
        eq(resumeVariantVersions.variantId, variantId),
        eq(resumeVariantVersions.version, version),
      ),
    )
    .limit(1)
  return row ?? null
}

export async function listVersions(userId: string, variantId: string): Promise<Array<Pick<ResumeVariantVersionRow, 'version' | 'createdAt'>>> {
  return db
    .select({ version: resumeVariantVersions.version, createdAt: resumeVariantVersions.createdAt })
    .from(resumeVariantVersions)
    .where(and(eq(resumeVariantVersions.userId, userId), eq(resumeVariantVersions.variantId, variantId)))
    .orderBy(asc(resumeVariantVersions.version))
}

export async function create(
  userId: string,
  input: { name: string; region: string; roleFamily: string | null; recipe: unknown },
): Promise<ResumeVariantRow> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(resumeVariants)
      .values({ userId, name: input.name, region: input.region, roleFamily: input.roleFamily, currentVersion: 1 })
      .returning()
    if (!row) throw new Error('resume_variants insert returned no row')
    await tx.insert(resumeVariantVersions).values({ variantId: row.id, userId, version: 1, recipe: input.recipe })
    return row
  })
}

/** Append version current+1 and make it current. */
export async function addVersion(
  userId: string,
  variant: Pick<ResumeVariantRow, 'id' | 'currentVersion'>,
  input: { recipe: unknown; region: string; roleFamily: string | null },
): Promise<ResumeVariantRow> {
  const version = variant.currentVersion + 1
  return db.transaction(async (tx) => {
    await tx.insert(resumeVariantVersions).values({ variantId: variant.id, userId, version, recipe: input.recipe })
    const [row] = await tx
      .update(resumeVariants)
      .set({ currentVersion: version, region: input.region, roleFamily: input.roleFamily, updatedAt: new Date() })
      .where(and(eq(resumeVariants.userId, userId), eq(resumeVariants.id, variant.id)))
      .returning()
    if (!row) throw new Error('resume_variants update returned no row')
    return row
  })
}

export async function updateMeta(
  userId: string,
  id: string,
  patch: Partial<Pick<ResumeVariantRow, 'name' | 'publishToPortfolio' | 'portfolioSlug' | 'archivedAt'>>,
): Promise<ResumeVariantRow | null> {
  const [row] = await db
    .update(resumeVariants)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(resumeVariants.userId, userId), eq(resumeVariants.id, id)))
    .returning()
  return row ?? null
}

/** Record which variant + version an application uses (null clears it). */
export async function setApplicationVariant(
  userId: string,
  applicationId: string,
  choice: { variantId: string; version: number } | null,
): Promise<boolean> {
  const rows = await db
    .update(applications)
    .set({ resumeVariantId: choice?.variantId ?? null, resumeVariantVersion: choice?.version ?? null, updatedAt: new Date() })
    .where(and(eq(applications.userId, userId), eq(applications.id, applicationId)))
    .returning()
  return rows.length > 0
}

// ---------------------------------------------------------------------------
// Portfolio publish bookkeeping (lib/portfolio/variants.ts)
// ---------------------------------------------------------------------------

export interface VariantPublishRecord {
  portfolioLastSha: string
  portfolioLastHash: string
  portfolioLastVersion: string
  portfolioCommitUrl: string | null
  portfolioPublishedAt: Date | null
}

/** Record what lee wrote to variants/<slug>.json (and mark that version as published when `version` is given). */
export async function recordPortfolioPublish(
  userId: string,
  variantId: string,
  record: VariantPublishRecord,
  version: number | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(resumeVariants)
      .set(record)
      .where(and(eq(resumeVariants.userId, userId), eq(resumeVariants.id, variantId)))
    if (version !== null && record.portfolioPublishedAt) {
      await tx
        .update(resumeVariantVersions)
        .set({ publishedAt: record.portfolioPublishedAt })
        .where(
          and(
            eq(resumeVariantVersions.userId, userId),
            eq(resumeVariantVersions.variantId, variantId),
            eq(resumeVariantVersions.version, version),
            isNull(resumeVariantVersions.publishedAt),
          ),
        )
    }
  })
}

/** Mark one version as published (kept by retention forever). */
export async function markVersionPublished(userId: string, variantId: string, version: number, at: Date): Promise<void> {
  await db
    .update(resumeVariantVersions)
    .set({ publishedAt: at })
    .where(
      and(
        eq(resumeVariantVersions.userId, userId),
        eq(resumeVariantVersions.variantId, variantId),
        eq(resumeVariantVersions.version, version),
      ),
    )
}

/** The file is gone from the repo: forget what lee wrote and turn the toggle off. Published versions stay marked. */
export async function clearPortfolioPublish(userId: string, variantId: string): Promise<void> {
  await db
    .update(resumeVariants)
    .set({
      publishToPortfolio: false,
      portfolioLastSha: null,
      portfolioLastHash: null,
      portfolioCommitUrl: null,
      portfolioPublishedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(resumeVariants.userId, userId), eq(resumeVariants.id, variantId)))
}

/** Another variant of this user (archived ones too) already using `slug`. */
export async function slugTaken(userId: string, slug: string, exceptId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: resumeVariants.id })
    .from(resumeVariants)
    .where(and(eq(resumeVariants.userId, userId), eq(resumeVariants.portfolioSlug, slug), ne(resumeVariants.id, exceptId)))
    .limit(1)
  return row !== undefined
}

export interface CurrentRecipeRow {
  id: string
  name: string
  region: string
  roleFamily: string | null
  version: number
  recipe: unknown
}

/** Every live variant with its current version's recipe, in one query (best-CV scoring). */
export async function listCurrentRecipes(userId: string): Promise<CurrentRecipeRow[]> {
  return db
    .select({
      id: resumeVariants.id,
      name: resumeVariants.name,
      region: resumeVariants.region,
      roleFamily: resumeVariants.roleFamily,
      version: resumeVariants.currentVersion,
      recipe: resumeVariantVersions.recipe,
    })
    .from(resumeVariants)
    .innerJoin(
      resumeVariantVersions,
      and(eq(resumeVariantVersions.variantId, resumeVariants.id), eq(resumeVariantVersions.version, resumeVariants.currentVersion)),
    )
    .where(and(eq(resumeVariants.userId, userId), isNull(resumeVariants.archivedAt)))
    .orderBy(asc(resumeVariants.name))
}
