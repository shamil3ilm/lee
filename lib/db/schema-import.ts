import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './schema'

// ---------------------------------------------------------------------------
// Import provenance (lib/import). Re-exported from ./schema.ts.
//
// One row per confirmed import (public page, LinkedIn export, CV, GitHub):
//   source       'url' | 'linkedin' | 'cv' | 'github'
//   mode         'saved'     — public facts were written to the master
//                              profile (only while profile editing in lee
//                              is on, lib/profile/edit-mode.ts)
//                'suggested' — public facts became suggestions for the
//                              portfolio; only lee's own data was saved
//   imported_at  the batch timestamp; master-profile items the batch added
//                carry the same `importedAt` (and `source`), so Undo and
//                Reset remove exactly those
//   counts       { <section>: n } of what the batch saved or suggested
//   intentions   readiness the user chose per item, keyed by name, applied
//                when the item arrives (lib/import/intentions.ts)
//   changes      what Undo needs to reverse the batch (lib/import/changes.ts):
//                previous values of fields it replaced; never page text
// Names, short texts and counts only (a few KB).
// ---------------------------------------------------------------------------

export const profileImportBatches = pgTable(
  'profile_import_batches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    mode: text('mode').notNull(),
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
    counts: jsonb('counts').$type<Record<string, number>>().notNull().default({}),
    intentions: jsonb('intentions').notNull().default([]),
    changes: jsonb('changes').notNull().default({}),
    undoneAt: timestamp('undone_at', { withTimezone: true }),
  },
  (t) => ({
    userImportedIx: index('profile_import_batches_user_imported_idx').on(t.userId, t.importedAt.desc()),
  }),
)
