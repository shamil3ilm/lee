import { date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, boolean } from 'drizzle-orm/pg-core'
import { users } from './schema'

// ---------------------------------------------------------------------------
// Connect GitHub / Connect LinkedIn (lib/integrations). Re-exported from
// ./schema.ts. Every row is per user; no row is ever read for another user
// and there is no owner fallback (docs/integrations-github-linkedin.md).
// ---------------------------------------------------------------------------

/**
 * One connection per user and provider ('github' | 'linkedin'). The access
 * and refresh tokens are ONE value encrypted at rest with the token vault
 * (lib/crypto/token-vault.ts: AES-256-GCM, the service-key store's scheme).
 * Nothing else here is secret; `scopes` are what the provider granted.
 */
export const integrationConnections = pgTable(
  'integration_connections',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    /** GitHub user id / LinkedIn `sub`. */
    accountId: text('account_id').notNull(),
    login: text('login'),
    displayName: text('display_name'),
    email: text('email'),
    avatarUrl: text('avatar_url'),
    scopes: text('scopes').array().notNull().default([]),
    /** `{ access, refresh }` JSON, encrypted with lib/crypto/token-vault.ts. */
    tokens: text('tokens').notNull(),
    accessExpiresAt: timestamp('access_expires_at', { withTimezone: true }),
    refreshExpiresAt: timestamp('refresh_expires_at', { withTimezone: true }),
    /** GitHub: the app installation on the user's account (null = not installed). */
    installationId: text('installation_id'),
    /** Per-connection choices: { followStarred?: boolean } (GitHub), { posting?: boolean } (LinkedIn). */
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.provider] }),
  }),
)

/**
 * In-flight OAuth authorizations: single use, ten minutes. `state_hash` is
 * the SHA-256 of the state value (the raw value only lives in the redirect
 * and an httpOnly cookie). The PKCE verifier and OIDC nonce are encrypted.
 */
export const oauthStates = pgTable(
  'oauth_states',
  {
    stateHash: text('state_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    /** `{ codeVerifier?, nonce? }` JSON, encrypted with lib/crypto/token-vault.ts. */
    secret: text('secret').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    userIx: index('oauth_states_user_idx').on(t.userId, t.createdAt),
  }),
)

/** Fixed-window counters for rate-limited actions (connect, disconnect, post). */
export const actionThrottle = pgTable(
  'action_throttle',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.action] }),
  }),
)

/**
 * Compact cache of the user's GitHub repos (Settings › Résumé › From
 * GitHub): one row per repo with counts only. Unlinked rows not refreshed
 * for GITHUB_STATS_RETENTION_DAYS are pruned (lib/db/retention/github.ts).
 */
export const githubRepoStats = pgTable(
  'github_repo_stats',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    isPrivate: boolean('is_private').notNull().default(false),
    htmlUrl: text('html_url').notNull(),
    description: text('description'),
    topics: text('topics').array().notNull().default([]),
    /** Top languages by bytes: [{ name, share }] (share 0..1, at most 5). */
    languages: jsonb('languages').$type<Array<{ name: string; share: number }>>().notNull().default([]),
    stars: integer('stars').notNull().default(0),
    pushedAt: timestamp('pushed_at', { withTimezone: true }),
    lastCommitAt: timestamp('last_commit_at', { withTimezone: true }),
    userCommits: integer('user_commits').notNull().default(0),
    userPrs: integer('user_prs').notNull().default(0),
    /** Master-profile project id this repo is evidence for (user's choice). */
    linkedProjectId: text('linked_project_id'),
    /** Follow this repo's dependency releases in Radar (user's choice). */
    followDeps: boolean('follow_deps').notNull().default(false),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userRepoUq: uniqueIndex('github_repo_stats_user_repo_uq').on(t.userId, t.fullName),
  }),
)

/**
 * LinkedIn data-export import: the profile fields the optimizer compares
 * (headline, About, positions). One row per user; replaced on re-import.
 */
export const linkedinImports = pgTable('linkedin_imports', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  headline: text('headline').notNull().default(''),
  summary: text('summary').notNull().default(''),
  /** [{ company, title, description, startDate, endDate }] (YYYY-MM). */
  positions: jsonb('positions').$type<Array<Record<string, string>>>().notNull().default([]),
  importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * LinkedIn connections from the export: name, company, position and the
 * date only (email only when the export has it AND the user opted in).
 * Private to the user; "Delete all" removes every row.
 */
export const linkedinConnections = pgTable(
  'linkedin_connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    company: text('company').notNull().default(''),
    /** Normalized company name for matching (lib/integrations/linkedin/company-key.ts). */
    companyKey: text('company_key').notNull().default(''),
    position: text('position').notNull().default(''),
    connectedOn: date('connected_on'),
    email: text('email'),
  },
  (t) => ({
    userNameCompanyUq: uniqueIndex('linkedin_connections_user_name_company_uq').on(t.userId, t.name, t.companyKey),
    userCompanyIx: index('linkedin_connections_user_company_idx').on(t.userId, t.companyKey),
  }),
)

/** Posts the user published from lee (Share on LinkedIn), newest first. */
export const linkedinPosts = pgTable(
  'linkedin_posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'achievement' | 'case_study' | 'radar' | 'open_to_work' | 'custom'. */
    sourceKind: text('source_kind').notNull(),
    text: text('text').notNull(),
    postUrn: text('post_urn'),
    url: text('url'),
    postedAt: timestamp('posted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userPostedIx: index('linkedin_posts_user_posted_idx').on(t.userId, t.postedAt),
  }),
)

// ---------------------------------------------------------------------------
// LinkedIn hiring posts (lib/linkedin-posts). Posts themselves are
// discoveries of the `linkedin_post` source; these tables hold counters,
// short-lived captures and the bookmarklet key version only.
// ---------------------------------------------------------------------------

/**
 * LinkedIn notification emails the `linkedin_post` source read: counts and
 * parser health for Settings › LinkedIn (never the body). Pruned after 120
 * days like the job-alert counters.
 */
export const linkedinPostMessages = pgTable(
  'linkedin_post_messages',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    messageId: text('message_id').notNull(),
    /** 'single' | 'digest' | 'shared' | 'other'. */
    kind: text('kind').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    postsFound: integer('posts_found').notNull().default(0),
    hiringFound: integer('hiring_found').notNull().default(0),
    /** A post notification the parser could not read (format changed?). */
    parseFailed: boolean('parse_failed').notNull().default(false),
    processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.messageId] }),
    userReceivedIx: index('linkedin_post_messages_user_received_idx').on(t.userId, t.receivedAt),
  }),
)

/**
 * "Send to lee": the text the user selected on a page and its URL, posted by
 * the bookmarklet, held until the user reviews it on Discovery › Capture
 * (≤ 4,000 characters, expires after 30 minutes, deleted on import or
 * discard). Never put in a URL.
 */
export const postCaptures = pgTable(
  'post_captures',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull().default(''),
    url: text('url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    userCreatedIx: index('post_captures_user_created_idx').on(t.userId, t.createdAt),
  }),
)

/** The bookmarklet key's version per user: bumping it revokes every older bookmarklet. */
export const captureKeys = pgTable('capture_keys', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(1),
  rotatedAt: timestamp('rotated_at', { withTimezone: true }).notNull().defaultNow(),
})
