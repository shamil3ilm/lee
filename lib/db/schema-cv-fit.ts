import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applications, documents, resumeVariants, users } from './schema'

// ---------------------------------------------------------------------------
// Best CV for each job / Tailor to this JD (lib/cv-fit). Re-exported from
// ./schema.ts.
//
// cv_tailorings — one row per saved tailored copy: the `tailored_cv`
// document it wrote, the JD it was tailored to (hash), the variant and
// version it started from, every suggestion the user accepted, the gap
// decisions and the requirement checklist the cover letter reads. Ids,
// short texts and counts only (≈ 1–3 KB). Removed with the application.
// ---------------------------------------------------------------------------

export const cvTailorings = pgTable(
  'cv_tailorings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    jdHash: text('jd_hash').notNull(),
    baseVariantId: uuid('base_variant_id').references(() => resumeVariants.id, { onDelete: 'set null' }),
    baseVersion: integer('base_version'),
    // AcceptedSuggestion[] (lib/cv-fit/tailor/types.ts).
    accepted: jsonb('accepted').notNull().default([]),
    // GapDecision[]: missing requirements → study list / cover letter / ignore.
    gaps: jsonb('gaps').notNull().default([]),
    // ChecklistItem[] after tailoring: what the cover letter reads.
    requirements: jsonb('requirements').notNull().default([]),
    // { before: Coverage, after: Coverage, scoreBefore, scoreAfter }.
    outcome: jsonb('outcome').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userAppIx: index('cv_tailorings_user_app_idx').on(t.userId, t.applicationId, t.createdAt),
    documentIx: index('cv_tailorings_document_idx').on(t.documentId),
    // FK index for ON DELETE SET NULL from resume_variants.
    variantIx: index('cv_tailorings_variant_idx').on(t.baseVariantId),
  }),
)
