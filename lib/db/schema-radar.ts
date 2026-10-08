import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './schema'

// ---------------------------------------------------------------------------
// v16 AI Radar (phases 16.0 and 16.1, docs/ai-radar.md). Re-exported from
// ./schema.ts. Everything is user-scoped and compact:
//   - radar_items: one fetched item per (user, source, external id), with an
//     excerpt of at most 500 characters and a few metrics (≈ 0.6 KB a row);
//   - radar_entries: the cross-source cluster an item belongs to;
//   - radar_watch_terms: the user's terms and entities, with aliases;
//   - radar_briefs: a confirmed grounded brief per entry (≤ 16 KB of
//     sections), plus the "Learn this" module once created.
// Retention (lib/db/retention/radar.ts) deletes unwatched, unsaved items
// after 30 days and keeps saved entries and briefs.
// ---------------------------------------------------------------------------

export const radarEntries = pgTable(
  'radar_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // lib/radar/types.ts RADAR_KINDS
    kind: text('kind').notNull(),
    // Cluster keys (lib/radar/cluster.ts): arxiv:…, url:…, name:…, term:…
    keys: text('keys').array().notNull().default([]),
    // Distinct sources of its items.
    sources: text('sources').array().notNull().default([]),
    // Watch-term ids any of its items match (recomputed when terms change).
    matchedTerms: text('matched_terms').array().notNull().default([]),
    itemCount: integer('item_count').notNull().default(0),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
    savedAt: timestamp('saved_at', { withTimezone: true }),
  },
  (t) => ({
    userLastSeenIx: index('radar_entries_user_last_seen_idx').on(t.userId, t.lastSeenAt),
    keysIx: index('radar_entries_keys_idx').using('gin', t.keys),
  }),
)

export const radarItems = pgTable(
  'radar_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => radarEntries.id, { onDelete: 'cascade' }),
    // lib/radar/types.ts RADAR_SOURCES
    source: text('source').notNull(),
    externalId: text('external_id').notNull(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    // First time lee fetched it ("first seen").
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    excerpt: text('excerpt').notNull().default(''),
    // Small numbers and dates only (stars, likes, createdAt, feed id) — ≤ 1 KB.
    metrics: jsonb('metrics').notNull().default({}),
    matchedTerms: text('matched_terms').array().notNull().default([]),
  },
  (t) => ({
    userSourceExternalUq: uniqueIndex('radar_items_user_source_external_uq').on(t.userId, t.source, t.externalId),
    entryIx: index('radar_items_entry_idx').on(t.entryId),
    userFetchedIx: index('radar_items_user_fetched_idx').on(t.userId, t.fetchedAt),
    excerptCk: check('radar_items_excerpt_ck', sql`char_length(${t.excerpt}) <= 500`),
    metricsCk: check('radar_items_metrics_ck', sql`octet_length(${t.metrics}::text) <= 1024`),
  }),
)

export const radarWatchTerms = pgTable(
  'radar_watch_terms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    term: text('term').notNull(),
    aliases: text('aliases').array().notNull().default([]),
    // 'term' | 'entity'
    kind: text('kind').notNull().default('term'),
    // Muted: still listed, never highlighted, counted or notified.
    muted: boolean('muted').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userTermUq: uniqueIndex('radar_watch_terms_user_term_uq').on(t.userId, sql`lower(${t.term})`),
    termCk: check('radar_watch_terms_term_ck', sql`char_length(${t.term}) between 2 and 80`),
  }),
)

export const radarBriefs = pgTable(
  'radar_briefs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entryId: uuid('entry_id')
      .notNull()
      .unique()
      .references(() => radarEntries.id, { onDelete: 'cascade' }),
    // BriefSections (lib/radar/brief/types.ts): cited sentences per section.
    sections: jsonb('sections').notNull(),
    // The fetched primary sources the sentences cite: [{ id, kind, url, title, fetchedAt }].
    sources: jsonb('sources').notNull().default([]),
    // Computed from source metadata, never from model output.
    timeline: jsonb('timeline').notNull().default([]),
    // "Learn this": { cards: [{ id, front, back }], lab, createdAt } or null.
    module: jsonb('module'),
    promptVersion: text('prompt_version').notNull(),
    promptHash: text('prompt_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIx: index('radar_briefs_user_idx').on(t.userId),
    sectionsCk: check('radar_briefs_sections_ck', sql`octet_length(${t.sections}::text) <= 16384`),
  }),
)
