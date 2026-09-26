import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  integer,
  uuid,
  boolean,
  jsonb,
  smallint,
  real,
  index,
  uniqueIndex,
  customType,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// bytea custom type. Drizzle has no first-class bytea column; both
// postgres-js (Neon prod) and PGlite (tests) accept a Uint8Array on write
// and return a Uint8Array on read. We surface both sides as Node's `Buffer`
// so callers get a familiar API — `Buffer` extends Uint8Array so passing it
// to the driver is a no-op cast.
// ---------------------------------------------------------------------------

const bytea = customType<{ data: Buffer; driverData: Uint8Array; default: false }>({
  dataType() {
    return 'bytea'
  },
  toDriver(value: Buffer): Uint8Array {
    return value
  },
  fromDriver(value: Uint8Array): Buffer {
    return Buffer.isBuffer(value) ? value : Buffer.from(value)
  },
})

// ---------------------------------------------------------------------------
// Auth.js schema (compatible with @auth/drizzle-adapter)
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('emailVerified', { withTimezone: true, mode: 'date' }),
  image: text('image'),
})

export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (a) => ({ pk: primaryKey({ columns: [a.provider, a.providerAccountId] }) }),
)

export const sessions = pgTable('sessions', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: uuid('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true, mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable(
  'verificationTokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (vt) => ({ pk: primaryKey({ columns: [vt.identifier, vt.token] }) }),
)

// ---------------------------------------------------------------------------
// Domain tables
// ---------------------------------------------------------------------------

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    domain: text('domain'),
    headquartersCity: text('headquarters_city'),
    headquartersCountry: text('headquarters_country'),
    officeLocations: text('office_locations').array().notNull().default([]),
    remoteFriendly: boolean('remote_friendly'),
    size: text('size'),
    stage: text('stage'),
    website: text('website'),
    techStack: text('tech_stack').array().notNull().default([]),
    isWatched: boolean('is_watched').notNull().default(false),
    stance: text('stance'),
    interestLevel: smallint('interest_level'),
    notesMd: text('notes_md'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userDomainUq: uniqueIndex('companies_user_domain_uq').on(t.userId, t.domain),
    userWatchedIx: index('companies_user_watched_idx').on(t.userId, t.isWatched),
  }),
)

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    linkedinUrl: text('linkedin_url'),
    role: text('role'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userCompanyIx: index('contacts_user_company_idx').on(t.userId, t.companyId) }),
)

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    sourceUrl: text('source_url').notNull(),
    location: text('location'),
    remoteType: text('remote_type'),
    employmentType: text('employment_type'),
    salaryMin: integer('salary_min'),
    salaryMax: integer('salary_max'),
    salaryCurrency: text('salary_currency'),
    descriptionMd: text('description_md'),
    parsedMeta: jsonb('parsed_meta').notNull().default({}),
    benefits: jsonb('benefits').notNull().default({}),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userUrlUq: uniqueIndex('jobs_user_source_url_uq').on(t.userId, t.sourceUrl),
    userCompanyIx: index('jobs_user_company_idx').on(t.userId, t.companyId),
  }),
)

export const applications = pgTable(
  'applications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('saved'),
    source: text('source'),
    referredByContactId: uuid('referred_by_contact_id').references(() => contacts.id, {
      onDelete: 'set null',
    }),
    interestLevel: smallint('interest_level'),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    nextActionAt: timestamp('next_action_at', { withTimezone: true }),
    priority: smallint('priority').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userStatusIx: index('applications_user_status_idx').on(t.userId, t.status),
    userNextIx: index('applications_user_next_action_idx').on(t.userId, t.nextActionAt),
  }),
)

export const applicationContacts = pgTable(
  'application_contacts',
  {
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.applicationId, t.contactId, t.role] }) }),
)

export const interviewStages = pgTable(
  'interview_stages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    title: text('title'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    durationMinutes: integer('duration_minutes'),
    location: text('location'),
    meetingUrl: text('meeting_url'),
    status: text('status').notNull().default('scheduled'),
    outcome: text('outcome'),
    prepNotesMd: text('prep_notes_md'),
    debriefNotesMd: text('debrief_notes_md'),
    // v3: id of the Google Calendar event created for this stage (nullable
    // when the stage was never pushed, when push failed, or when the stage
    // was created before Calendar integration existed).
    googleEventId: text('google_event_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    appScheduledIx: index('interview_stages_app_scheduled_idx').on(t.applicationId, t.scheduledAt),
    // perf — journey probes + calendar views filter by (user, status) and
    // range on scheduled_at without an application id.
    userStatusScheduledIx: index('interview_stages_user_status_scheduled_idx').on(
      t.userId,
      t.status,
      t.scheduledAt,
    ),
  }),
)

// ---------------------------------------------------------------------------
// v3: Gmail sync dedup — one row per processed thread id per user. Insert on
// every processing pass regardless of match so subsequent sync runs skip the
// thread. Nullable matched_application_id keeps the row when the application
// is later deleted (dedup should survive) while still surfacing links for
// analytics.
// ---------------------------------------------------------------------------

export const processedGmailThreads = pgTable(
  'processed_gmail_threads',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    threadId: text('thread_id').notNull(),
    matchedApplicationId: uuid('matched_application_id').references(() => applications.id, {
      onDelete: 'set null',
    }),
    processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.threadId] }) }),
)

export const activities = pgTable(
  'activities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    appCreatedIx: index('activities_app_created_idx').on(t.applicationId, t.createdAt),
    // perf — dashboard "emails today" + follow-up nudges filter by
    // (user, kind) and a created_at window.
    userKindCreatedIx: index('activities_user_kind_created_idx').on(
      t.userId,
      t.kind,
      t.createdAt,
    ),
  }),
)

// ---------------------------------------------------------------------------
// Discovery hooks (empty in v1, populated in v1.5)
// ---------------------------------------------------------------------------

export const userProfile = pgTable('user_profile', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  headline: text('headline'),
  summaryMd: text('summary_md'),
  careerNarrativeMd: text('career_narrative_md'),
  skills: text('skills').array().notNull().default([]),
  industries: text('industries').array().notNull().default([]),
  roleTypes: text('role_types').array().notNull().default([]),
  seniority: text('seniority'),
  yearsExperience: integer('years_experience'),
  employmentTypes: text('employment_types').array().notNull().default([]),
  remotePref: text('remote_pref').notNull().default('any'),
  locationPrefs: jsonb('location_prefs').notNull().default([]),
  acceptRelocation: boolean('accept_relocation').notNull().default(false),
  willingToRelocateTo: text('willing_to_relocate_to').array().notNull().default([]),
  compFloorAnnual: integer('comp_floor_annual'),
  compCurrency: text('comp_currency'),
  stackWeights: jsonb('stack_weights').notNull().default({}),
  companySizeWeights: jsonb('company_size_weights').notNull().default({}),
  benefitPrefs: jsonb('benefit_prefs').notNull().default({}),
  mustHaves: text('must_haves').array().notNull().default([]),
  dealbreakers: text('dealbreakers').array().notNull().default([]),
  keywords: text('keywords').array().notNull().default([]),
  // AI provider selection: null = use env default. Persisted here so users
  // can flip models at runtime via the UI without redeploying.
  aiProvider: text('ai_provider'),
  aiModel: text('ai_model'),
  // v8.2 — decision provider selection. Same pattern as aiProvider above:
  // null = fall back to env DECISION_PROVIDER / LAYA_ENDPOINT so users can
  // flip the classification/discovery-decision backend without a redeploy.
  // Kept nullable + orthogonal to `aiProvider` because decision tasks
  // (choice / yesNo / score) are a different modality from free-form gen.
  decisionProvider: text('decision_provider'),
  layaEndpoint: text('laya_endpoint'),
  // v3 sync timestamps — updated at the end of each successful sync. Null
  // means the user has never run that sync (or has never connected the
  // corresponding Google scope).
  syncedGmailAt: timestamp('synced_gmail_at', { withTimezone: true }),
  syncedCalendarAt: timestamp('synced_calendar_at', { withTimezone: true }),
  // v4 weekly digest — set to true by default so all users receive the
  // Monday email until they explicitly opt out. digestLastSentAt is null
  // until the first send; used as a same-week idempotency guard.
  weeklyDigestEnabled: boolean('weekly_digest_enabled').notNull().default(true),
  digestLastSentAt: timestamp('digest_last_sent_at', { withTimezone: true }),
  // v6.2 — per-discovery-cycle notifications. Independent of the Monday-only
  // weekly digest above; these fire after every cron pass when the cycle
  // ingests a new discovery whose match score clears `notifyDiscoveryMinScore`.
  // Email is opt-in (defaults to false — reuses the gmail.send scope but many
  // users won't want another inbox notification), browser is opt-in-by-default
  // (defaults to true — same permission as the existing todo poller).
  notifyDiscoveryEmail: boolean('notify_discovery_email').notNull().default(false),
  notifyDiscoveryBrowser: boolean('notify_discovery_browser').notNull().default(true),
  notifyDiscoveryMinScore: smallint('notify_discovery_min_score').notNull().default(75),
  // Watermark for the email channel — the service uses it to compute the
  // "since" window so a user who was silent for 3 days gets one summary email
  // per cycle rather than a flood. Null → first send picks a 24h window.
  discoveryEmailLastSentAt: timestamp('discovery_email_last_sent_at', { withTimezone: true }),
  // v4.1 per-user IANA timezone. Used for calendar events, digest scheduling,
  // and any date rendering that must reflect the user's local time regardless
  // of the server region. Defaults to Asia/Dubai (Shamil's home tz) so
  // existing rows behave identically to the previous hardcoded constant.
  timezone: text('timezone').notNull().default('Asia/Dubai'),
  // v17 §1 — Scam Shield network checks (RDAP domain age + DNS-over-HTTPS
  // MX). Off by default: they send posting domains to rdap.org and
  // Cloudflare. Toggled in Settings › Scam Shield.
  scamNetChecks: boolean('scam_net_checks').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sources = pgTable(
  'sources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    config: jsonb('config').notNull().default({}),
    enabled: boolean('enabled').notNull().default(true),
    lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
    lastError: text('last_error'),
    errorCount: integer('error_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userEnabledIx: index('sources_user_enabled_idx').on(t.userId, t.enabled) }),
)

export const discoveries = pgTable(
  'discoveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    sourceJobId: text('source_job_id').notNull(),
    raw: jsonb('raw').notNull(),
    normalized: jsonb('normalized').notNull(),
    matchScore: smallint('match_score'),
    benefitsScore: smallint('benefits_score'),
    matchReasoning: jsonb('match_reasoning'),
    status: text('status').notNull().default('new'),
    savedApplicationId: uuid('saved_application_id').references(() => applications.id, {
      onDelete: 'set null',
    }),
    // v10.1 — link a discovery row to the ai_call_logs row that scored it.
    // Enables the dismiss/save actions to write an implicit rating signal
    // back to the exact call that produced the score. Nullable because
    // discoveries can exist without a score (thin profile → scoring skipped).
    scoredByCallId: uuid('scored_by_call_id').references(() => aiCallLogs.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    srcJobUq: uniqueIndex('discoveries_source_job_uq').on(t.sourceId, t.sourceJobId),
    userStatusScoreIx: index('discoveries_user_status_score_idx').on(
      t.userId,
      t.status,
      t.matchScore,
    ),
    // perf — FK index so ON DELETE SET NULL from ai_call_logs retention does
    // not seq-scan discoveries per deleted log row. Partial: most rows are
    // unscored or already detached.
    scoredByCallIx: index('discoveries_scored_by_call_idx')
      .on(t.scoredByCallId)
      .where(sql`${t.scoredByCallId} is not null`),
  }),
)

export const companyDiscoveries = pgTable(
  'company_discoveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    sourceCompanyId: text('source_company_id').notNull(),
    raw: jsonb('raw').notNull(),
    normalized: jsonb('normalized').notNull(),
    matchScore: smallint('match_score'),
    matchReasoning: jsonb('match_reasoning'),
    status: text('status').notNull().default('new'),
    addedCompanyId: uuid('added_company_id').references(() => companies.id, {
      onDelete: 'set null',
    }),
    // v10.1 — same as discoveries.scoredByCallId; enables implicit signal on
    // dismiss/save of scored company discoveries.
    scoredByCallId: uuid('scored_by_call_id').references(() => aiCallLogs.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    srcCompanyUq: uniqueIndex('company_discoveries_source_company_uq').on(
      t.sourceId,
      t.sourceCompanyId,
    ),
    userStatusScoreIx: index('company_discoveries_user_status_score_idx').on(
      t.userId,
      t.status,
      t.matchScore,
    ),
    // perf — same FK index as discoveries.scored_by_call_id (retention).
    scoredByCallIx: index('company_discoveries_scored_by_call_idx')
      .on(t.scoredByCallId)
      .where(sql`${t.scoredByCallId} is not null`),
  }),
)

// ---------------------------------------------------------------------------
// Relations (needed for Drizzle's `with:` query API)
// ---------------------------------------------------------------------------

export const companiesRelations = relations(companies, ({ many }) => ({
  jobs: many(jobs),
  contacts: many(contacts),
}))

export const contactsRelations = relations(contacts, ({ one }) => ({
  company: one(companies, {
    fields: [contacts.companyId],
    references: [companies.id],
  }),
}))

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  company: one(companies, {
    fields: [jobs.companyId],
    references: [companies.id],
  }),
  applications: many(applications),
}))

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  job: one(jobs, {
    fields: [applications.jobId],
    references: [jobs.id],
  }),
  referredByContact: one(contacts, {
    fields: [applications.referredByContactId],
    references: [contacts.id],
  }),
  stages: many(interviewStages),
  activities: many(activities),
  applicationContacts: many(applicationContacts),
}))

export const applicationContactsRelations = relations(applicationContacts, ({ one }) => ({
  application: one(applications, {
    fields: [applicationContacts.applicationId],
    references: [applications.id],
  }),
  contact: one(contacts, {
    fields: [applicationContacts.contactId],
    references: [contacts.id],
  }),
}))

export const interviewStagesRelations = relations(interviewStages, ({ one }) => ({
  application: one(applications, {
    fields: [interviewStages.applicationId],
    references: [applications.id],
  }),
}))

export const activitiesRelations = relations(activities, ({ one }) => ({
  application: one(applications, {
    fields: [activities.applicationId],
    references: [applications.id],
  }),
}))

// ---------------------------------------------------------------------------
// Documents (v2: CV + cover letter storage, versioned per application)
// ---------------------------------------------------------------------------

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Nullable: the master CV has no application; tailored CVs and cover
    // letters always do. `set null` preserves the document row when the
    // application is deleted so history survives.
    applicationId: uuid('application_id').references(() => applications.id, {
      onDelete: 'set null',
    }),
    // 'master_cv' | 'tailored_cv' | 'cover_letter'
    kind: text('kind').notNull(),
    version: integer('version').notNull().default(1),
    title: text('title').notNull(),
    // Structured JSON — shape depends on `kind`; validated at write time via
    // Zod schemas in lib/documents/types.ts.
    content: jsonb('content').notNull(),
    aiPromptHash: text('ai_prompt_hash'),
    // {provider, model, tokens, latencyMs}
    aiGenerationMeta: jsonb('ai_generation_meta').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userAppIdx: index('documents_user_app_idx').on(t.userId, t.applicationId, t.createdAt),
    userKindIdx: index('documents_user_kind_idx').on(t.userId, t.kind),
  }),
)

export const documentsRelations = relations(documents, ({ one }) => ({
  application: one(applications, {
    fields: [documents.applicationId],
    references: [applications.id],
  }),
}))

// ---------------------------------------------------------------------------
// v5.2 — document assets. Files (images, PDFs, arbitrary attachments) that
// belong to a LaTeX document, referenced from the .tex source by filename
// and bundled with the compile request to latexonline.cc.
//
// Bytes are stored directly in Postgres as `bytea`. For personal-use scale
// (few MB per doc, 20-asset cap, 500MB Neon free tier) this avoids a new
// external dependency (S3/R2) and keeps ownership + backup with the
// document row itself. Move to object storage before scaling to multiple
// power users.
// ---------------------------------------------------------------------------

export const documentAssets = pgTable(
  'document_assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    // How the file is referenced from LaTeX (e.g. 'photo.jpg' or 'cover.pdf').
    // Sanitised before insert — no directory separators, no '..', spaces
    // collapsed to underscores. Unique per document so `\includegraphics{name}`
    // is unambiguous.
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    bytes: bytea('bytes').notNull(),
    // perf — hex sha256 of `bytes`, written on upload so the LaTeX PDF cache
    // key can be computed without reading asset bytes. Null for rows
    // uploaded before this column existed (hashed in SQL on demand).
    sha256: text('sha256'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    documentIdx: index('document_assets_document_idx').on(t.documentId),
    docFilenameUq: uniqueIndex('document_assets_doc_filename_uq').on(t.documentId, t.filename),
  }),
)

// ---------------------------------------------------------------------------
// perf — compiled LaTeX PDF cache. At most ONE row per document (PK on
// document_id) so storage stays bounded; `cache_key` is a sha256 over the
// .tex source and every asset's sha256, so any edit invalidates it. Written
// through the Postgres asset store (lib/storage) — a future object-storage
// backend can hold the bytes elsewhere behind the same interface.
// ---------------------------------------------------------------------------

export const documentPdfCache = pgTable('document_pdf_cache', {
  documentId: uuid('document_id')
    .primaryKey()
    .references(() => documents.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  cacheKey: text('cache_key').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  bytes: bytea('bytes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const documentAssetsRelations = relations(documentAssets, ({ one }) => ({
  document: one(documents, {
    fields: [documentAssets.documentId],
    references: [documents.id],
  }),
}))

// ---------------------------------------------------------------------------
// v7 — Personal expense tracker. Adjacent to the job-hunt domain but standalone:
// same user, same DB. `amount_cents` stores integer minor units (multiply by
// currency's decimal exponent when displaying — INR / AED / USD / EUR use 2). Default currency is INR (lib/money/currency.ts). Two
// indexes cover the hot paths on the /expenses page: (user, date) drives the
// month filter and recent-transactions list; (user, category) drives the
// per-category rollups and budget checks.
// ---------------------------------------------------------------------------

export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Date-only, no time component. Postgres `date` maps cleanly to a JS
    // string like '2026-09-25' when read via postgres-js, which is what the
    // UI wants — do NOT convert to a Date in queries so month filtering can
    // stay a lexicographic string prefix comparison.
    date: text('date').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('INR'),
    // Top-level category — one of the enum values documented in the spec.
    // Stored as text (not a Postgres enum) so adding a new category is a code
    // change, not a migration. Freeform subcategory allows fine-grained
    // classification (e.g. subscription/streaming, transport/uber).
    category: text('category').notNull(),
    subcategory: text('subcategory'),
    vendor: text('vendor'),
    description: text('description'),
    recurring: boolean('recurring').notNull().default(false),
    recurringPeriod: text('recurring_period'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userDateIx: index('expenses_user_date_idx').on(t.userId, t.date),
    userCategoryIx: index('expenses_user_category_idx').on(t.userId, t.category),
  }),
)

export const expenseBudgets = pgTable(
  'expense_budgets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    monthlyCapCents: integer('monthly_cap_cents').notNull(),
    currency: text('currency').notNull().default('INR'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCategoryUq: uniqueIndex('expense_budgets_user_category_uq').on(t.userId, t.category),
  }),
)

// ---------------------------------------------------------------------------
// v8 — Todos. General-purpose task list. Optional links to application /
// stage / contact / company so a todo can be scoped to any pipeline entity
// (or free-standing). All FKs use `set null` on delete: deleting the linked
// application should not destroy the todo — the user may still want to keep
// the reminder around after archiving. `tags[]` is a Postgres text array so
// the UI can filter without a join table.
// ---------------------------------------------------------------------------

export const todos = pgTable(
  'todos',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    notesMd: text('notes_md'),
    // 'open' | 'done' | 'archived'
    status: text('status').notNull().default('open'),
    // 0 = none, 1 = low, 2 = med, 3 = high
    priority: smallint('priority').notNull().default(0),
    dueAt: timestamp('due_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    applicationId: uuid('application_id').references(() => applications.id, {
      onDelete: 'set null',
    }),
    stageId: uuid('stage_id').references(() => interviewStages.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    tags: text('tags').array().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userStatusDueIx: index('todos_user_status_due_idx').on(t.userId, t.status, t.dueAt),
    applicationIx: index('todos_application_idx').on(t.applicationId),
  }),
)

export const todosRelations = relations(todos, ({ one }) => ({
  application: one(applications, {
    fields: [todos.applicationId],
    references: [applications.id],
  }),
  stage: one(interviewStages, {
    fields: [todos.stageId],
    references: [interviewStages.id],
  }),
  contact: one(contacts, {
    fields: [todos.contactId],
    references: [contacts.id],
  }),
  company: one(companies, {
    fields: [todos.companyId],
    references: [companies.id],
  }),
}))

export const aiCallLogs = pgTable('ai_call_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  provider: text('provider').notNull(),
  kind: text('kind').notNull(),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  latencyMs: integer('latency_ms'),
  status: text('status').notNull(),
  error: text('error'),
  // v10 — feedback loop. `documentId` links a generation call back to the
  // document it produced, so ratings on the document can be routed to the
  // right row. `userRating` is 1 (👎) or 5 (👍); `userAction` captures the
  // implicit signal (regenerated → 👎, used → 👍, dismissed → 👎).
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  userRating: smallint('user_rating'),
  userAction: text('user_action'),
  // v10 — signal-check observability. `signalCheckPassed=false` means the
  // call was refused before hitting the model; `signalCheckCode` carries the
  // reason so analytics can group skips by kind.
  signalCheckPassed: boolean('signal_check_passed'),
  signalCheckCode: text('signal_check_code'),
  // v10.1 — prompt versioning. `promptHash` is the first 12 chars of a sha256
  // of the exact prompt text sent to the model. `promptVersion` is a
  // semver-ish string bumped by hand when a prompt builder is intentionally
  // changed. Together they let analytics roll up ratings per prompt version
  // and detect silent-behavior changes when only the hash moves.
  promptHash: text('prompt_hash'),
  promptVersion: text('prompt_version'),
  // v14 — model id actually called (e.g. 'openai/gpt-oss-20b'). Nullable so
  // pre-v14 rows stay valid; Model Lab writes it for every arena call.
  model: text('model'),
  // v18 — usage tracking. `httpStatus` is the provider's HTTP status for the
  // attempt (429 rows are rate-limited retries); `audioSeconds` is the
  // transcribed audio duration when the provider reports it, else
  // `inputBytes` carries the upload size. Counts only — never content.
  httpStatus: smallint('http_status'),
  audioSeconds: real('audio_seconds'),
  inputBytes: integer('input_bytes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // perf — every analytics / usage query filters by (user, created_at window).
  userCreatedIx: index('ai_call_logs_user_created_idx').on(t.userId, t.createdAt),
  // perf — rating writeback + ON DELETE SET NULL from documents look up by
  // document_id; only generation calls carry one.
  documentIx: index('ai_call_logs_document_idx')
    .on(t.documentId)
    .where(sql`${t.documentId} is not null`),
}))

// ---------------------------------------------------------------------------
// v12.0 — CV scores. One row per scoring run (history + tailoring deltas).
// `overall` mirrors scores.total.score for cheap sorting/filtering; `scores`
// holds every HEADLINE score ({score, grade, weight, skipped?, reason?});
// `dimensions` keeps the raw per-dimension details and `findings` the
// CvFinding[] list. `scorer_version` makes rule-set changes explicit so
// scores from different versions are never compared as equal.
// ---------------------------------------------------------------------------

export const cvScores = pgTable(
  'cv_scores',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Null for uploaded files (no stored document).
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    // Null = general (no JD) score.
    applicationId: uuid('application_id').references(() => applications.id, {
      onDelete: 'set null',
    }),
    // master_cv | tailored_cv | latex_cv | upload
    sourceKind: text('source_kind').notNull(),
    // Document title or uploaded file name — for history labels.
    sourceLabel: text('source_label').notNull().default(''),
    overall: smallint('overall').notNull(),
    grade: text('grade').notNull(),
    // 'jd' | 'general'
    mode: text('mode').notNull().default('general'),
    scores: jsonb('scores').notNull(),
    dimensions: jsonb('dimensions').notNull(),
    findings: jsonb('findings').notNull(),
    // Skipped dimensions/scores with reasons, Total Match weights, target.
    meta: jsonb('meta').notNull().default({}),
    scorerVersion: text('scorer_version').notNull(),
    aiCallId: uuid('ai_call_id').references(() => aiCallLogs.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userAppCreatedIx: index('cv_scores_user_app_created_idx').on(
      t.userId,
      t.applicationId,
      t.createdAt.desc(),
    ),
    userDocCreatedIx: index('cv_scores_user_doc_created_idx').on(
      t.userId,
      t.documentId,
      t.createdAt.desc(),
    ),
    // perf — FK index for ON DELETE SET NULL when ai_call_logs are pruned.
    aiCallIx: index('cv_scores_ai_call_idx')
      .on(t.aiCallId)
      .where(sql`${t.aiCallId} is not null`),
  }),
)

// ---------------------------------------------------------------------------
// v14 — Model Lab. Provider API keys are stored AES-256-GCM encrypted (see
// lib/lab/crypto.ts); only `key_last4` is ever shown back to the client.
// ---------------------------------------------------------------------------

export const labProviderKeys = pgTable(
  'lab_provider_keys',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    encryptedKey: text('encrypted_key').notNull(),
    iv: text('iv').notNull(),
    authTag: text('auth_tag').notNull(),
    keyLast4: text('key_last4').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userProviderUq: uniqueIndex('lab_provider_keys_user_provider_uq').on(t.userId, t.provider),
  }),
)

// kind: 'arena' | 'eval' | 'agent'
export const labRuns = pgTable(
  'lab_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    config: jsonb('config').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCreatedIx: index('lab_runs_user_created_idx').on(t.userId, t.createdAt),
  }),
)

export const labRunResults = pgTable(
  'lab_run_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references(() => labRuns.id, { onDelete: 'cascade' }),
    modelProvider: text('model_provider').notNull(),
    modelId: text('model_id').notNull(),
    blindLabel: text('blind_label'),
    output: text('output'),
    outputJson: jsonb('output_json'),
    metrics: jsonb('metrics'),
    schemaValid: boolean('schema_valid'),
    error: text('error'),
    // 1 = picked as the winner of a blind vote; null = not voted
    vote: smallint('vote'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    runIx: index('lab_run_results_run_idx').on(t.runId),
  }),
)

export const labRunsRelations = relations(labRuns, ({ many }) => ({
  results: many(labRunResults),
}))

export const labRunResultsRelations = relations(labRunResults, ({ one }) => ({
  run: one(labRuns, { fields: [labRunResults.runId], references: [labRuns.id] }),
}))

// ---------------------------------------------------------------------------
// v17 §1 — Scam Shield. One assessment per (user, target). `target_id` is
// polymorphic (discoveries.id or jobs.id), so no FK. `level` is rule-based
// and can only be raised by a second opinion, never lowered. Rows are never
// deleted by the pipeline; quarantine is a query-time filter:
//   user_verdict = 'confirmed_scam'
//   OR (level = 'likely_scam' AND user_verdict IS NULL AND NOT allow_listed)
// ---------------------------------------------------------------------------

export const jobRiskAssessments = pgTable(
  'job_risk_assessments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // 'discovery' | 'job'
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    score: smallint('score').notNull(),
    // 'safe' | 'caution' | 'likely_scam'
    level: text('level').notNull(),
    signals: jsonb('signals').notNull().default([]),
    rulesVersion: text('rules_version').notNull(),
    // Network facts used ({ domains: [{ domain, registeredAt, ageDays, hasMx }] }).
    net: jsonb('net'),
    // True when the target matched the user's allow-list at assessment time.
    allowListed: boolean('allow_listed').notNull().default(false),
    // null | 'not_scam' | 'confirmed_scam' — only ever set by the user.
    userVerdict: text('user_verdict'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userTargetUq: uniqueIndex('job_risk_assessments_user_target_uq').on(
      t.userId,
      t.targetType,
      t.targetId,
    ),
    userLevelIx: index('job_risk_assessments_user_level_idx').on(t.userId, t.targetType, t.level),
  }),
)

// Per-domain network facts, shared across users (public data). Each check
// has its own status + timestamp so a failed MX lookup can be retried
// without re-running RDAP.
export const scamDomainCache = pgTable('scam_domain_cache', {
  domain: text('domain').primaryKey(),
  registeredAt: timestamp('registered_at', { withTimezone: true }),
  // 'ok' | 'not_found' | 'error'
  ageStatus: text('age_status'),
  ageCheckedAt: timestamp('age_checked_at', { withTimezone: true }),
  hasMx: boolean('has_mx'),
  // 'ok' | 'error'
  mxStatus: text('mx_status'),
  mxCheckedAt: timestamp('mx_checked_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Per-user "not a scam" memory. kind: 'domain' | 'company'.
export const scamAllowList = pgTable(
  'scam_allow_list',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    value: text('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userKindValueUq: uniqueIndex('scam_allow_list_user_kind_value_uq').on(t.userId, t.kind, t.value),
  }),
)

// ---------------------------------------------------------------------------
// v18 — latest provider rate-limit snapshot per (user, provider, model).
// Upserted from response headers (Groq `x-ratelimit-*`); never appended, so
// the table stays at one row per model a user has called. Groq semantics:
// `limit/remaining_requests` are requests per DAY, `limit/remaining_tokens`
// are tokens per MINUTE (https://console.groq.com/docs/rate-limits).
// ---------------------------------------------------------------------------

export const aiQuotaSnapshots = pgTable(
  'ai_quota_snapshots',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    limitRequests: integer('limit_requests'),
    remainingRequests: integer('remaining_requests'),
    resetRequestsAt: timestamp('reset_requests_at', { withTimezone: true }),
    limitTokens: integer('limit_tokens'),
    remainingTokens: integer('remaining_tokens'),
    resetTokensAt: timestamp('reset_tokens_at', { withTimezone: true }),
    // Set from `retry-after` on a 429; null otherwise.
    retryAfterAt: timestamp('retry_after_at', { withTimezone: true }),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.provider, t.model] }) }),
)
