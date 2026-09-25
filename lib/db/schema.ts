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
  index,
  uniqueIndex,
  customType,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    documentIdx: index('document_assets_document_idx').on(t.documentId),
    docFilenameUq: uniqueIndex('document_assets_doc_filename_uq').on(t.documentId, t.filename),
  }),
)

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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
