import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './schema'

// ---------------------------------------------------------------------------
// v13 Playground core engine (phase 13.0). Re-exported from ./schema.ts.
//
// Content (skill graph, items, cards, achievements) is versioned JSON under
// content/academy/; these tables hold only per-user state and history.
// History is APPEND-ONLY and kept forever (spec §10.1): attempts and rating
// snapshots are never deleted by retention. lib/db/retention/academy.ts only
// COMPACTS old rows (drops per-axis detail and advice text, keeps every
// score), so growth stays small on Neon Free's 0.5 GB. Rough size: an
// attempt ≈ 0.6 KB fresh, ≈ 0.35 KB compacted; a rating snapshot ≈ 90 B; a
// plan ≈ 1.5 KB/day (compacted to ≈ 0.4 KB after 60 days). Ten attempts a
// day for five years is ≈ 18k attempts ≈ 7 MB with history.
// ---------------------------------------------------------------------------

/** One row per (user, skill) with evidence: Glicko rating + deviation. */
export const academySkillRatings = pgTable(
  'academy_skill_ratings',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    skillId: text('skill_id').notNull(),
    rating: real('rating').notNull(),
    deviation: real('deviation').notNull(),
    // 0 Unassessed … 5 Expert (lib/academy/levels.ts)
    level: smallint('level').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    lastPracticedAt: timestamp('last_practiced_at', { withTimezone: true }),
    // Placement explanation: { explanation, sources: [{label, note}] }, ≤ 1 KB.
    // Null once the skill has attempts and the seed no longer applies.
    seed: jsonb('seed'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.skillId] }),
    levelCk: check('academy_skill_ratings_level_ck', sql`${t.level} between 0 and 5`),
  }),
)

/**
 * Every attempt, append-only (§10.1): the item, the content-pack and engine
 * versions it was played on, the seed (choice order), timings, the capped
 * submission and multi-axis evaluation, XP and the rating move.
 */
export const academyAttempts = pgTable(
  'academy_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemId: text('item_id').notNull(),
    skillId: text('skill_id').notNull(),
    // lib/academy/content/schema.ts ITEM_FORMATS
    format: text('format').notNull(),
    // 'practice' | 'plan' | 'diagnostic'
    mode: text('mode').notNull().default('practice'),
    planDate: date('plan_date', { mode: 'string' }),
    planItemId: text('plan_item_id'),
    contentVersion: text('content_version').notNull(),
    engineVersion: text('engine_version').notNull(),
    seed: integer('seed').notNull().default(0),
    difficulty: smallint('difficulty').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    elapsedSec: integer('elapsed_sec'),
    // Capped at ~1 KB (lib/academy/service/caps.ts).
    submission: jsonb('submission'),
    // AttemptEvaluation (lib/academy/evaluation/types.ts), capped at ~2 KB.
    evaluation: jsonb('evaluation'),
    composite: smallint('composite'),
    xpAwarded: smallint('xp_awarded').notNull().default(0),
    ratingBefore: real('rating_before'),
    ratingAfter: real('rating_after'),
    // Set by retention when detail was compacted (scores kept).
    compactedAt: timestamp('compacted_at', { withTimezone: true }),
  },
  (t) => ({
    userStartedIx: index('academy_attempts_user_started_idx').on(t.userId, t.startedAt.desc()),
    userSkillIx: index('academy_attempts_user_skill_idx').on(t.userId, t.skillId, t.submittedAt),
    compositeCk: check('academy_attempts_composite_ck', sql`${t.composite} is null or ${t.composite} between 0 and 100`),
  }),
)

/** Rating/level snapshot per skill after every attempt and placement seed (§10.1). */
export const academyRatingHistory = pgTable(
  'academy_rating_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    skillId: text('skill_id').notNull(),
    attemptId: uuid('attempt_id').references(() => academyAttempts.id, { onDelete: 'cascade' }),
    // 'attempt' | 'diagnostic' | 'placement'
    kind: text('kind').notNull(),
    rating: real('rating').notNull(),
    deviation: real('deviation').notNull(),
    level: smallint('level').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userSkillCreatedIx: index('academy_rating_history_user_skill_idx').on(t.userId, t.skillId, t.createdAt),
  }),
)

/** SM-2 state per concept card the user has met. */
export const academyReviews = pgTable(
  'academy_reviews',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cardId: text('card_id').notNull(),
    skillId: text('skill_id').notNull(),
    ease: real('ease').notNull().default(2.5),
    intervalDays: smallint('interval_days').notNull().default(0),
    repetitions: smallint('repetitions').notNull().default(0),
    lapses: smallint('lapses').notNull().default(0),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.cardId] }),
    userDueIx: index('academy_reviews_user_due_idx').on(t.userId, t.dueAt),
  }),
)

/** One plan per user per local day; `items` = PlanItem[] (capped ~4 KB). */
export const academyPlans = pgTable(
  'academy_plans',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    items: jsonb('items').notNull().default([]),
    // lib/academy/selector/plan.ts planSignature: inputs the plan came from.
    signature: text('signature').notNull().default(''),
    // 'generated' | 'regenerated'
    reason: text('reason').notNull().default('generated'),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    compactedAt: timestamp('compacted_at', { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.date] }),
  }),
)

export const academyAchievements = pgTable(
  'academy_achievements',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    achievementId: text('achievement_id').notNull(),
    earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
    attemptId: uuid('attempt_id').references(() => academyAttempts.id, { onDelete: 'set null' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.achievementId] }),
  }),
)

/** XP, rank, streak, preferences (Settings live on the Playground hub) and placement progress. */
export const academyUserState = pgTable('academy_user_state', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  xp: integer('xp').notNull().default(0),
  // lib/academy/content/schema.ts RANKS
  rank: text('rank').notNull().default('intern'),
  streakDays: smallint('streak_days').notNull().default(0),
  bestStreak: smallint('best_streak').notNull().default(0),
  lastActiveDate: date('last_active_date', { mode: 'string' }),
  timeBudgetMin: smallint('time_budget_min').notNull().default(20),
  // lib/academy/selector/types.ts PLAN_MODES
  mode: text('mode').notNull().default('balanced'),
  reviewsDone: integer('reviews_done').notNull().default(0),
  placementStartedAt: timestamp('placement_started_at', { withTimezone: true }),
  placementCompletedAt: timestamp('placement_completed_at', { withTimezone: true }),
  // Domain ids the diagnostic covers (fixed when it starts).
  placementDomains: jsonb('placement_domains').$type<string[]>().notNull().default([]),
  // Hash of the profile evidence last used to seed (re-seed on change).
  profileSignature: text('profile_signature'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// v13 phase 13.1 — coding workbench. Problems are versioned content
// (content/academy/problems/); every Submit is also an academy_attempts row
// (format 'coding'), so ratings, XP and history work as in 13.0. These
// tables hold only what the workbench needs on top, kept compact for Neon
// Free: per-problem progress (~150 B/row), the code of recent submissions
// (capped at 16 KB; the last 20 per problem plus the best and latest
// accepted are kept, lib/db/queries/academySubmissions.ts), the daily
// problem (~80 B/day) and mock assessments (~1 KB each).
// ---------------------------------------------------------------------------

export const academyProblemProgress = pgTable(
  'academy_problem_progress',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    problemSlug: text('problem_slug').notNull(),
    // 'attempted' | 'solved'
    status: text('status').notNull().default('attempted'),
    submissions: integer('submissions').notNull().default(0),
    accepted: integer('accepted').notNull().default(0),
    bestRuntimeMs: integer('best_runtime_ms'),
    bestLanguage: text('best_language'),
    // Progressive hints revealed (each one is recorded once).
    hintsUsed: smallint('hints_used').notNull().default(0),
    // Set when the user gave up and opened the solution before solving.
    gaveUpAt: timestamp('gave_up_at', { withTimezone: true }),
    firstSolvedAt: timestamp('first_solved_at', { withTimezone: true }),
    lastSubmittedAt: timestamp('last_submitted_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.problemSlug] }),
    statusCk: check('academy_problem_progress_status_ck', sql`${t.status} in ('attempted', 'solved')`),
  }),
)

export const academySubmissions = pgTable(
  'academy_submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    problemSlug: text('problem_slug').notNull(),
    attemptId: uuid('attempt_id').references(() => academyAttempts.id, { onDelete: 'set null' }),
    mockId: uuid('mock_id'),
    language: text('language').notNull(),
    // lib/academy/runner/verdict.ts VERDICTS
    verdict: text('verdict').notNull(),
    passed: smallint('passed').notNull(),
    total: smallint('total').notNull(),
    runtimeMs: integer('runtime_ms'),
    memoryKb: integer('memory_kb'),
    code: text('code').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userProblemIx: index('academy_submissions_user_problem_idx').on(t.userId, t.problemSlug, t.createdAt.desc()),
    codeCk: check('academy_submissions_code_ck', sql`octet_length(${t.code}) <= 16384`),
  }),
)

/** One adaptive daily problem per user per local day (the daily streak counts solved days). */
export const academyDailyProblems = pgTable(
  'academy_daily_problems',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    problemSlug: text('problem_slug').notNull(),
    solvedAt: timestamp('solved_at', { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.date] }),
  }),
)

/** A timed mock assessment: 2–3 problems, 60–90 minutes, scored at the end. */
export const academyMockAssessments = pgTable(
  'academy_mock_assessments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    problemSlugs: jsonb('problem_slugs').$type<string[]>().notNull(),
    durationMin: smallint('duration_min').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    score: smallint('score'),
    // Per problem: { slug, solved, submissions, bestPassRate } (≤ 1 KB).
    results: jsonb('results'),
  },
  (t) => ({
    userStartedIx: index('academy_mock_assessments_user_started_idx').on(t.userId, t.startedAt.desc()),
    scoreCk: check('academy_mock_assessments_score_ck', sql`${t.score} is null or ${t.score} between 0 and 100`),
  }),
)
