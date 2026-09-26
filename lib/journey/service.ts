import { and, asc, count, desc, eq, gte, inArray, isNotNull, lt, lte, sql } from 'drizzle-orm'
import { discoveryNotQuarantinedSql } from '@/lib/db/queries/riskAssessments'
import { db } from '@/lib/db/client'
import {
  accounts,
  applications,
  discoveries,
  documents,
  interviewStages,
  sources,
  todos,
  userProfile,
} from '@/lib/db/schema'
import { findFollowupCandidates } from '@/lib/followups/service'
import * as cvScoresQ from '@/lib/db/queries/cvScores'
import { findLowestCvFit } from './cv-fit'
import { todoIsActiveSql } from '@/lib/db/queries/todos'

/**
 * v11 journey dashboard — pure server logic. Every time-dependent function
 * takes `now` explicitly so results are deterministic under test.
 */

export const GMAIL_READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const HOUR_MS = 60 * 60 * 1000
export const INTERVIEW_PREP_WINDOW_MS = 48 * HOUR_MS
const DEFAULT_DISCOVERY_MIN_SCORE = 75
// Completed stages older than this no longer nag for a debrief — memory has
// faded and it would otherwise block every lower-priority action forever.
export const DEBRIEF_LOOKBACK_MS = 14 * 24 * HOUR_MS

// ---------------------------------------------------------------------------
// Setup checklist
// ---------------------------------------------------------------------------

export type SetupItemKey = 'profile' | 'master_cv' | 'cv_score' | 'source' | 'google' | 'application'

export interface SetupItem {
  key: SetupItemKey
  label: string
  done: boolean
  href: string
}

export interface SetupChecklist {
  items: SetupItem[]
  completed: number
  total: number
}

async function exists(query: Promise<unknown[]>): Promise<boolean> {
  const rows = await query
  return rows.length > 0
}

export async function getSetupChecklist(userId: string): Promise<SetupChecklist> {
  const [profile, hasMasterCv, hasCvScore, hasSource, google, hasApplication] = await Promise.all([
    db.query.userProfile.findFirst({
      where: eq(userProfile.userId, userId),
      columns: { skills: true, headline: true },
    }),
    exists(
      db
        .select({ id: documents.id })
        .from(documents)
        .where(and(eq(documents.userId, userId), eq(documents.kind, 'master_cv')))
        .limit(1),
    ),
    cvScoresQ.hasAny(userId),
    exists(db.select({ id: sources.id }).from(sources).where(eq(sources.userId, userId)).limit(1)),
    db.query.accounts.findFirst({
      where: and(eq(accounts.userId, userId), eq(accounts.provider, 'google')),
      columns: { scope: true },
    }),
    exists(
      db
        .select({ id: applications.id })
        .from(applications)
        .where(eq(applications.userId, userId))
        .limit(1),
    ),
  ])

  const profileImported =
    !!profile && (profile.skills.length > 0 || (profile.headline ?? '').trim() !== '')
  const googleConnected = (google?.scope ?? '').split(' ').includes(GMAIL_READ_SCOPE)

  const items: SetupItem[] = [
    { key: 'profile', label: 'Import your profile', done: profileImported, href: '/settings/profile' },
    { key: 'master_cv', label: 'Save your master CV', done: hasMasterCv, href: '/settings/cv' },
    { key: 'cv_score', label: 'Score your CV', done: hasCvScore, href: '/cv-score' },
    { key: 'source', label: 'Add a discovery source', done: hasSource, href: '/settings/sources' },
    { key: 'google', label: 'Connect Google', done: googleConnected, href: '/settings/integrations' },
    {
      key: 'application',
      label: 'Track your first application',
      done: hasApplication,
      href: '/applications/new',
    },
  ]
  return { items, completed: items.filter((i) => i.done).length, total: items.length }
}

// ---------------------------------------------------------------------------
// Next best action
// ---------------------------------------------------------------------------

export type NextActionKind =
  | 'overdue_todo'
  | 'interview_prep'
  | 'debrief'
  | 'follow_up'
  | 'cv_fit'
  | 'discovery'
  | 'add_application'

export interface NextBestAction {
  kind: NextActionKind
  title: string
  description: string
  href: string
  ctaLabel: string
}

// Relational `with` for interview-stage probes: just the job title and
// company name (never the job description) for the action copy.
const STAGE_JOB_LABEL = {
  application: {
    columns: { id: true },
    with: {
      job: {
        columns: { title: true },
        with: { company: { columns: { name: true } } },
      },
    },
  },
} as const

function roleLabel(title: string, company: string | null | undefined): string {
  return company ? `${title} at ${company}` : title
}

async function overdueTodoAction(userId: string, now: Date): Promise<NextBestAction | null> {
  const [todo] = await db
    .select({ title: todos.title, dueAt: todos.dueAt })
    .from(todos)
    .where(and(eq(todos.userId, userId), todoIsActiveSql(), lt(todos.dueAt, now)))
    .orderBy(desc(todos.priority), asc(todos.dueAt))
    .limit(1)
  if (!todo) return null
  return {
    kind: 'overdue_todo',
    title: `Overdue: ${todo.title}`,
    description: 'This todo slipped past its due date. Clear it or reschedule it.',
    href: '/todos',
    ctaLabel: 'Open todos',
  }
}

async function interviewPrepAction(userId: string, now: Date): Promise<NextBestAction | null> {
  const upcoming = await db.query.interviewStages.findMany({
    where: and(
      eq(interviewStages.userId, userId),
      eq(interviewStages.status, 'scheduled'),
      gte(interviewStages.scheduledAt, now),
      lte(interviewStages.scheduledAt, new Date(now.getTime() + INTERVIEW_PREP_WINDOW_MS)),
    ),
    orderBy: (s, { asc: ascending }) => [ascending(s.scheduledAt)],
    with: STAGE_JOB_LABEL,
  })
  if (upcoming.length === 0) return null

  const appIds = [...new Set(upcoming.map((s) => s.applicationId))]
  const packs = await db
    .select({ applicationId: documents.applicationId })
    .from(documents)
    .where(
      and(
        eq(documents.userId, userId),
        eq(documents.kind, 'interview_prep_pack'),
        inArray(documents.applicationId, appIds),
      ),
    )
  const prepped = new Set(packs.map((p) => p.applicationId))
  const stage = upcoming.find((s) => !prepped.has(s.applicationId))
  if (!stage) return null
  const job = stage.application.job
  return {
    kind: 'interview_prep',
    title: `Prepare for ${stage.title ?? stage.kind.replace(/_/g, ' ')}`,
    description: `${roleLabel(job.title, job.company?.name)} — interview within 48 hours and no prep pack yet.`,
    href: `/applications/${stage.applicationId}`,
    ctaLabel: 'Generate prep pack',
  }
}

async function debriefAction(userId: string, now: Date): Promise<NextBestAction | null> {
  const completed = await db.query.interviewStages.findMany({
    where: and(
      eq(interviewStages.userId, userId),
      eq(interviewStages.status, 'completed'),
      gte(interviewStages.updatedAt, new Date(now.getTime() - DEBRIEF_LOOKBACK_MS)),
    ),
    orderBy: (s, { desc: descending }) => [descending(s.updatedAt)],
    with: STAGE_JOB_LABEL,
  })
  const stage = completed.find((s) => (s.debriefNotesMd ?? '').trim() === '')
  if (!stage) return null
  const job = stage.application.job
  return {
    kind: 'debrief',
    title: `Debrief your ${stage.title ?? stage.kind.replace(/_/g, ' ')}`,
    description: `${roleLabel(job.title, job.company?.name)} — capture what went well while it's fresh.`,
    href: `/applications/${stage.applicationId}`,
    ctaLabel: 'Write debrief',
  }
}

async function followUpAction(userId: string, now: Date): Promise<NextBestAction | null> {
  const [candidate] = await findFollowupCandidates(userId, now)
  if (!candidate) return null
  return {
    kind: 'follow_up',
    title: `Follow up on ${roleLabel(candidate.jobTitle, candidate.companyName)}`,
    description: `Applied ${candidate.daysSince} days ago with no reply. A short nudge keeps you visible.`,
    href: `/applications/${candidate.applicationId}`,
    ctaLabel: 'Draft follow-up',
  }
}

async function cvFitAction(userId: string): Promise<NextBestAction | null> {
  const low = await findLowestCvFit(userId)
  if (!low) return null
  return {
    kind: 'cv_fit',
    title: `Your CV scores ${low.overall} for ${low.companyName ?? low.jobTitle} — tailor before applying`,
    description: `${roleLabel(low.jobTitle, low.companyName)} — tailor your CV to the job, then score it again.`,
    href: `/applications/${low.applicationId}`,
    ctaLabel: 'Tailor CV',
  }
}

async function discoveryAction(userId: string): Promise<NextBestAction | null> {
  const profile = await db.query.userProfile.findFirst({
    where: eq(userProfile.userId, userId),
    columns: { notifyDiscoveryMinScore: true },
  })
  const minScore = profile?.notifyDiscoveryMinScore ?? DEFAULT_DISCOVERY_MIN_SCORE
  const [row] = await db
    .select({
      title: sql<string | null>`${discoveries.normalized}->>'title'`,
      companyName: sql<string | null>`${discoveries.normalized}->>'companyName'`,
      matchScore: discoveries.matchScore,
    })
    .from(discoveries)
    .where(
      and(
        eq(discoveries.userId, userId),
        eq(discoveries.status, 'new'),
        discoveryNotQuarantinedSql(),
        isNotNull(discoveries.matchScore),
        gte(discoveries.matchScore, minScore),
      ),
    )
    .orderBy(desc(discoveries.matchScore), desc(discoveries.createdAt))
    .limit(1)
  if (!row) return null
  return {
    kind: 'discovery',
    title: `Review a ${row.matchScore}% match`,
    description: `${roleLabel(row.title ?? 'Untitled role', row.companyName)} is waiting in Discovery.`,
    href: `/discoveries?sort=match&minScore=${minScore}`,
    ctaLabel: 'Review matches',
  }
}

const FALLBACK_ACTION: NextBestAction = {
  kind: 'add_application',
  title: 'Add an application',
  description: 'Nothing urgent. Track a role you are interested in to keep momentum.',
  href: '/applications/new',
  ctaLabel: 'Add application',
}

/**
 * First match wins, in spec §2.7 priority order. All probes run in parallel;
 * the highest-priority non-empty result is returned. The v12 CV-fit nudge sits
 * after follow-ups (time-sensitive, already applied) and before new
 * discoveries: finish preparing roles you saved before adding more.
 */
export async function getNextBestAction(userId: string, now: Date): Promise<NextBestAction> {
  // Every probe is an independent read — run them concurrently (one round
  // trip of latency instead of six) and keep the first hit in priority order.
  const results = await Promise.all([
    overdueTodoAction(userId, now),
    interviewPrepAction(userId, now),
    debriefAction(userId, now),
    followUpAction(userId, now),
    cvFitAction(userId),
    discoveryAction(userId),
  ])
  return results.find((a): a is NextBestAction => a !== null) ?? FALLBACK_ACTION
}

// ---------------------------------------------------------------------------
// Journey strip counts
// ---------------------------------------------------------------------------

export interface JourneyCounts {
  found: number
  applied: number
  interviewing: number
  offers: number
}

export async function getJourneyCounts(userId: string): Promise<JourneyCounts> {
  const [foundRows, statusRows] = await Promise.all([
    db
      .select({ c: count() })
      .from(discoveries)
      .where(
        and(eq(discoveries.userId, userId), eq(discoveries.status, 'new'), discoveryNotQuarantinedSql()),
      ),
    db
      .select({ status: applications.status, c: count() })
      .from(applications)
      .where(eq(applications.userId, userId))
      .groupBy(applications.status),
  ])
  const byStatus = new Map(statusRows.map((r) => [r.status, Number(r.c)]))
  const of = (s: string): number => byStatus.get(s) ?? 0
  return {
    found: Number(foundRows[0]?.c ?? 0),
    applied: of('applied'),
    interviewing: of('screen') + of('interview'),
    offers: of('offer'),
  }
}
