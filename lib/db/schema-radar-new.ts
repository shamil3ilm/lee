import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// AI Radar "What's new" (docs/ai-radar.md › What's new). SHARED, not
// user-scoped: one fetch per source per day for every account, stored once.
// Public facts only (names, links, dates, counts); per-user ranking and
// relevance are computed at read time and never stored here.
//   - radar_new_entries: one row per new entity (a cluster across sources),
//     with the best metrics of its items and the "+N variants" count;
//   - radar_new_items: the per-source items behind it (and folded variants).
// Retention (lib/db/retention/radar-new.ts) deletes entries after 60 days
// unless someone saved, watched or briefed them.
// ---------------------------------------------------------------------------

export const radarNewEntries = pgTable(
  'radar_new_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Novelty identity of the first item (lib/radar/new/novelty.ts), e.g. hf:model:org/name.
    entityKey: text('entity_key').notNull(),
    name: text('name').notNull(),
    // lib/radar/new/types.ts NEW_CATEGORIES
    category: text('category').notNull(),
    // 'open' | 'proprietary' | null (unknown)
    openness: text('openness'),
    // Model group (llm, vision…) or the tool/news kind (repo, space, release…).
    grp: text('grp'),
    url: text('url').notNull(),
    excerpt: text('excerpt').notNull().default(''),
    // Cluster keys (lib/radar/cluster.ts) plus entity:<key> of every item.
    keys: text('keys').array().notNull().default([]),
    sources: text('sources').array().notNull().default([]),
    // Lower-case topic tokens for per-user relevance (≤ 16).
    tags: text('tags').array().notNull().default([]),
    // When the thing itself was created (repo/model creation, release, post).
    createdAt: timestamp('created_at', { withTimezone: true }),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    variantCount: integer('variant_count').notNull().default(0),
    // Best metrics across its items (likes, stars, points, licence, params…) — ≤ 1 KB.
    metrics: jsonb('metrics').notNull().default({}),
  },
  (t) => ({
    entityUq: uniqueIndex('radar_new_entries_entity_uq').on(t.entityKey),
    firstSeenIx: index('radar_new_entries_first_seen_idx').on(t.firstSeenAt),
    keysIx: index('radar_new_entries_keys_idx').using('gin', t.keys),
    categoryCk: check('radar_new_entries_category_ck', sql`${t.category} in ('model', 'tool', 'release', 'paper', 'news')`),
    excerptCk: check('radar_new_entries_excerpt_ck', sql`char_length(${t.excerpt}) <= 500`),
    metricsCk: check('radar_new_entries_metrics_ck', sql`octet_length(${t.metrics}::text) <= 1024`),
    tagsCk: check('radar_new_entries_tags_ck', sql`cardinality(${t.tags}) <= 16`),
  }),
)

export const radarNewItems = pgTable(
  'radar_new_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => radarNewEntries.id, { onDelete: 'cascade' }),
    // lib/radar/new/types.ts NEW_SOURCES
    source: text('source').notNull(),
    externalId: text('external_id').notNull(),
    kind: text('kind').notNull(),
    // 'primary' | 'variant' (a quantisation / fine-tune folded under its base)
    role: text('role').notNull().default('primary'),
    title: text('title').notNull(),
    url: text('url').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    excerpt: text('excerpt').notNull().default(''),
    metrics: jsonb('metrics').notNull().default({}),
  },
  (t) => ({
    sourceExternalUq: uniqueIndex('radar_new_items_source_external_uq').on(t.source, t.externalId),
    entryIx: index('radar_new_items_entry_idx').on(t.entryId),
    sourceFetchedIx: index('radar_new_items_source_fetched_idx').on(t.source, t.fetchedAt),
    excerptCk: check('radar_new_items_excerpt_ck', sql`char_length(${t.excerpt}) <= 500`),
    metricsCk: check('radar_new_items_metrics_ck', sql`octet_length(${t.metrics}::text) <= 1024`),
  }),
)
