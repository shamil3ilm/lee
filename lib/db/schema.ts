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
} from 'drizzle-orm/pg-core'

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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    appScheduledIx: index('interview_stages_app_scheduled_idx').on(t.applicationId, t.scheduledAt),
  }),
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
