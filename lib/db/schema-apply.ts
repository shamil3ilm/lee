import { index, jsonb, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { applications, discoveries, resumeVariants, users } from './schema'

// ---------------------------------------------------------------------------
// Apply faster (lib/apply). Re-exported from ./schema.ts.
//
// Three compact tables:
//   shortlist_entries   — the daily shortlist snapshot the queue job writes
//                         after the discovery polls, so /shortlist reads a
//                         small precomputed table. ≈ 300 B a row; N (≤ 10) a
//                         day; pruned after 30 days (lib/db/retention/apply.ts).
//   discovery_feedback  — the "Not for me" reason per dismissed posting, as
//                         derived keys only (role family, region, company
//                         key), never posting text. Pruned after 180 days.
//   application_preps   — Prepare-application progress per application
//                         (resume), what was used when it was marked applied,
//                         and the scheduled follow-up nudge. One row per
//                         application; removed with the application.
// ---------------------------------------------------------------------------

export const shortlistEntries = pgTable(
  'shortlist_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // The user's local calendar day (yyyy-mm-dd) the snapshot is for.
    day: text('day').notNull(),
    discoveryId: uuid('discovery_id')
      .notNull()
      .references(() => discoveries.id, { onDelete: 'cascade' }),
    rank: smallint('rank').notNull(),
    // Composite 0–100 (lib/apply/rank.ts).
    score: smallint('score').notNull(),
    // RankReason[]: [{ kind, label, points }] — short labels, ≤ 10 items.
    reasons: jsonb('reasons').notNull().default([]),
    variantId: uuid('variant_id').references(() => resumeVariants.id, { onDelete: 'set null' }),
    // 'open' | 'later' | 'dismissed' | 'preparing'
    state: text('state').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userDayDiscoveryUq: uniqueIndex('shortlist_entries_user_day_discovery_uq').on(t.userId, t.day, t.discoveryId),
    userDayRankIx: index('shortlist_entries_user_day_rank_idx').on(t.userId, t.day, t.rank),
    discoveryIx: index('shortlist_entries_discovery_idx').on(t.discoveryId),
    // FK index for ON DELETE SET NULL from resume_variants.
    variantIx: index('shortlist_entries_variant_idx').on(t.variantId).where(sql`${t.variantId} is not null`),
  }),
)

export const discoveryFeedback = pgTable(
  'discovery_feedback',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // No FK: dismissed discoveries are slimmed and pruned by retention, but
    // the feedback outlives them (it is what keeps similar postings lower).
    discoveryId: uuid('discovery_id').notNull(),
    // lib/apply/feedback.ts DISMISS_REASONS
    reason: text('reason').notNull(),
    roleFamily: text('role_family'),
    // Region tag of the posting: 'ae' | 'gcc' | 'in' | 'remote'.
    region: text('region'),
    // Company domain, else the lower-cased company name.
    companyKey: text('company_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userDiscoveryUq: uniqueIndex('discovery_feedback_user_discovery_uq').on(t.userId, t.discoveryId),
    userCreatedIx: index('discovery_feedback_user_created_idx').on(t.userId, t.createdAt),
  }),
)

export const applicationPreps = pgTable(
  'application_preps',
  {
    applicationId: uuid('application_id')
      .primaryKey()
      .references(() => applications.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // PrepProgress (lib/apply/progress.ts): per-step status, the document
    // ids/versions made, the CV Score delta and what "Mark applied" recorded.
    // Ids and numbers only; ≤ 2 KB.
    progress: jsonb('progress').notNull().default({}),
    // Set once every step before "Mark applied" is done or skipped.
    preparedAt: timestamp('prepared_at', { withTimezone: true }),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    // The follow-up nudge scheduled on "Mark applied":
    // 'pending' | 'done' | 'cancelled' (a Gmail-matched reply arrived).
    followupDueAt: timestamp('followup_due_at', { withTimezone: true }),
    followupStatus: text('followup_status'),
    followupClosedAt: timestamp('followup_closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userFollowupIx: index('application_preps_user_followup_idx').on(t.userId, t.followupStatus, t.followupDueAt),
    userPreparedIx: index('application_preps_user_prepared_idx').on(t.userId, t.preparedAt),
  }),
)
