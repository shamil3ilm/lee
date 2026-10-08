import { and, desc, eq } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { cvTailorings } from '@/lib/db/schema'

/** Saved "Tailor to this JD" copies (lib/cv-fit/tailor). Every function is userId-scoped. */

export type CvTailoringRow = typeof cvTailorings.$inferSelect

export interface NewTailoring {
  applicationId: string
  documentId: string
  jdHash: string
  baseVariantId: string | null
  baseVersion: number | null
  accepted: unknown
  gaps: unknown
  requirements: unknown
  outcome: unknown
}

export async function create(userId: string, row: NewTailoring, client: DbClient = db): Promise<CvTailoringRow> {
  const [out] = await client
    .insert(cvTailorings)
    .values({
      userId,
      applicationId: row.applicationId,
      documentId: row.documentId,
      jdHash: row.jdHash,
      baseVariantId: row.baseVariantId,
      baseVersion: row.baseVersion,
      accepted: row.accepted as never,
      gaps: row.gaps as never,
      requirements: row.requirements as never,
      outcome: row.outcome as never,
    })
    .returning()
  if (!out) throw new Error('cv_tailorings insert returned no row')
  return out
}

/** The application's most recent tailored copy, or null. */
export async function latestForApplication(userId: string, applicationId: string, client: DbClient = db): Promise<CvTailoringRow | null> {
  const [row] = await client
    .select()
    .from(cvTailorings)
    .where(and(eq(cvTailorings.userId, userId), eq(cvTailorings.applicationId, applicationId)))
    .orderBy(desc(cvTailorings.createdAt))
    .limit(1)
  return row ?? null
}
