import { boolean, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './schema'

// ---------------------------------------------------------------------------
// Compare with my current job (lib/compare, docs/job-comparison.md).
// Re-exported from ./schema.ts.
//
// One PRIVATE row per user, deliberately kept off user_profile so nothing
// that serialises the profile (the portfolio mapping, exports) can pick it
// up by accident:
//   current_job        the user's current job: pay, benefits, self-ratings,
//                      "what I want more of" (lib/compare/types.ts). Never
//                      published, never logged.
//   assumptions        FX table (with its last-updated date) and per-place
//                      tax and cost-of-living assumptions.
//   narratives         AI comparison narratives the user confirmed, keyed by
//                      opportunity ("d:<uuid>" / "a:<uuid>"), capped.
//   factor_shortlist   optional: let the comparison nudge the daily
//                      shortlist rank. Off by default.
// A few KB per user; removed with the user.
// ---------------------------------------------------------------------------

export const jobComparison = pgTable('job_comparison', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  currentJob: jsonb('current_job'),
  assumptions: jsonb('assumptions').notNull().default({}),
  narratives: jsonb('narratives').notNull().default({}),
  factorShortlist: boolean('factor_shortlist').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
