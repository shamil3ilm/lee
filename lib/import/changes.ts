import { z } from 'zod'

/**
 * What Undo needs to reverse one import batch (profile_import_batches.changes).
 * Master-profile items the batch ADDED are found by provenance (`source` +
 * `importedAt`), so only replaced values are kept here: previous field
 * values, previous items and the previous page evidence. Every restore is
 * guarded: a value the user changed again after the import is left alone.
 */

const before = z.object({ before: z.string().nullable(), after: z.string().nullable() })

export const importChangesSchema = z.object({
  /** Flat profile fields (Settings › Profile). */
  headline: before.optional(),
  summaryMd: before.optional(),
  seniority: before.optional(),
  yearsExperience: z.object({ before: z.number().nullable(), after: z.number().nullable() }).optional(),
  skillsAdded: z.array(z.string()).optional(),
  industriesAdded: z.array(z.string()).optional(),
  roleTypesAdded: z.array(z.string()).optional(),
  stackWeightsAdded: z.array(z.string()).optional(),
  /** Profile links (user_profile.links). */
  linksAdded: z.array(z.string()).optional(),
  linksUpdated: z.array(z.object({ id: z.string(), before: z.unknown(), after: z.unknown() })).optional(),
  /** Master-profile items an update replaced (before + the id). */
  resumeUpdated: z.array(z.object({ section: z.enum(['work', 'projects', 'education', 'certificates', 'languages']), id: z.string(), before: z.unknown() })).optional(),
  /** Page evidence (user_profile.linked_profile) before the import; null = none. */
  linkedBefore: z.unknown().optional(),
  /** LinkedIn optimizer import (linkedin_imports) before the import; null = none. */
  linkedinImportBefore: z.unknown().optional(),
  /** Connections were imported in this batch (rows carry import_batch_id). */
  connections: z.boolean().optional(),
})
export type ImportChanges = z.infer<typeof importChangesSchema>

export function readChanges(value: unknown): ImportChanges {
  const p = importChangesSchema.safeParse(value)
  return p.success ? p.data : {}
}
