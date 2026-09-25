import type { ApplicationWithJob } from '@/lib/db/queries/applications'
import type { UserProfile } from '@/lib/db/queries/profile'
import type { MasterCV, OutreachKind } from '@/lib/documents/types'
import type { InterviewStage } from '@/lib/db/queries/stages'

/**
 * Signal-check pre-flight for every AI call. Runs deterministic input
 * validation BEFORE hitting the model so we never generate confidently-wrong
 * output from an empty or under-specified prompt. See
 * `docs/superpowers/specs/2026-09-25-employ-v10-ai-trust-infrastructure-design.md`
 * §3 for the full rule catalogue.
 *
 * A failing check returns `{ok: false, code, message, fixHint?}`. Callers
 * throw `AISkippedError` and the route serializes to a 200 skip envelope so
 * the intent is refused politely — never as a 4xx (the request was valid).
 */
export type SignalResult =
  | { ok: true }
  | { ok: false; code: string; message: string; fixHint?: string }

/**
 * Domain error thrown by generator services when a signal check fails.
 * Route handlers catch it and return `{skipped: true, code, message, fixHint}`
 * with HTTP 200.
 */
export class AISkippedError extends Error {
  readonly code: string
  readonly fixHint?: string
  constructor(code: string, message: string, fixHint?: string) {
    super(message)
    this.name = 'AISkippedError'
    this.code = code
    this.fixHint = fixHint
  }
}

/** Minimum extracted text length below which we won't parse a job description. */
const PARSE_JOB_MIN_CHARS = 200

/** Days-since threshold below which a follow-up is premature. */
const FOLLOWUP_MIN_DAYS_SINCE = 3

/** Sum of profile signal fields required for discovery scoring. */
const DISCOVERY_MIN_PROFILE_SIGNALS = 3

/**
 * `parseJob` signal check. Input text must look like an actual JD:
 * - Long enough to contain a role + responsibilities.
 * - Contains at least one capitalized token (a proper noun — company name,
 *   product, tech stack). Empty and lorem-ipsum-style inputs fail both.
 */
export function checkParseJobSignal(text: string): SignalResult {
  const trimmed = (text ?? '').trim()
  if (trimmed.length < PARSE_JOB_MIN_CHARS) {
    return {
      ok: false,
      code: 'parse_job_too_short',
      message: `Job description is too short (${trimmed.length} chars) to parse reliably.`,
      fixHint: 'Paste at least a couple of paragraphs from the JD.',
    }
  }
  // Look for at least one capitalized word (proper noun / brand / tech).
  // Skip the very first character because titles are always capitalized.
  const rest = trimmed.slice(1)
  if (!/[A-Z]/.test(rest)) {
    return {
      ok: false,
      code: 'parse_job_no_proper_nouns',
      message: 'No proper nouns detected — this does not look like a job description.',
      fixHint: 'Paste the raw JD text (with company name, role, and requirements).',
    }
  }
  return { ok: true }
}

/**
 * `tailorCV` signal check. Requires a master CV with at least one experience
 * entry, plus a job with a company name — everything the prompt anchors on.
 */
export function checkTailorCVSignal(
  app: ApplicationWithJob | null | undefined,
  master: MasterCV | null | undefined,
): SignalResult {
  const masterCheck = requireMaster(master)
  if (!masterCheck.ok) return masterCheck
  return requireJobAndCompany(app)
}

/**
 * `coverLetter` signal check. Same requirements as tailorCV — a cover
 * letter without CV context or a company name to address is hallucinated.
 */
export function checkCoverLetterSignal(
  app: ApplicationWithJob | null | undefined,
  master: MasterCV | null | undefined,
): SignalResult {
  const masterCheck = requireMaster(master)
  if (!masterCheck.ok) return masterCheck
  return requireJobAndCompany(app)
}

/**
 * `outreach` signal check. Requires the sender's name (basics.name), a job
 * title, and a company name. LinkedIn messages additionally require at
 * least one linked contact — you can't send a warm message to nobody.
 *
 * The linked-contacts check is left to the caller (the contact array is
 * loaded on demand); pass it in via `linkedContactCount`.
 */
export function checkOutreachSignal(
  app: ApplicationWithJob | null | undefined,
  master: MasterCV | null | undefined,
  kind: OutreachKind,
  opts: { linkedContactCount?: number } = {},
): SignalResult {
  if (!master?.basics?.name?.trim()) {
    return {
      ok: false,
      code: 'outreach_no_sender_name',
      message: 'Your CV has no name yet — outreach would be unsigned.',
      fixHint: 'Set your name on Settings → CV before drafting outreach.',
    }
  }
  const jobCheck = requireJobAndCompany(app)
  if (!jobCheck.ok) return jobCheck
  if (kind === 'linkedin_message' && (opts.linkedContactCount ?? 0) === 0) {
    return {
      ok: false,
      code: 'outreach_no_linked_contact',
      message: 'LinkedIn message needs a linked contact — otherwise there is no one to send it to.',
      fixHint: 'Link a contact to this application first (Contacts → link).',
    }
  }
  return { ok: true }
}

/**
 * `followup_email` signal check. Requires an applied-at date so daysSince is
 * meaningful, and refuses to nudge inside the first 3 days after applying.
 */
export function checkFollowupSignal(
  app: ApplicationWithJob | null | undefined,
  daysSince: number | null | undefined,
): SignalResult {
  if (!app) {
    return {
      ok: false,
      code: 'followup_no_application',
      message: 'Application not found.',
    }
  }
  if (!app.appliedAt) {
    return {
      ok: false,
      code: 'followup_no_applied_at',
      message: 'Cannot draft a follow-up: no applied-at date on this application.',
      fixHint: 'Set the applied-at date on the application first (backfill via the status picker).',
    }
  }
  const d = typeof daysSince === 'number' ? daysSince : Number.NaN
  if (!Number.isFinite(d)) {
    return {
      ok: false,
      code: 'followup_missing_days_since',
      message: 'Follow-up needs a days-since value.',
      fixHint: 'Pick a 7/14/21/30-day interval, or backfill applied-at so it can be computed.',
    }
  }
  if (d < FOLLOWUP_MIN_DAYS_SINCE) {
    return {
      ok: false,
      code: 'followup_too_soon',
      message: `Only ${d} days since applying — following up now looks impatient.`,
      fixHint: 'Wait until at least day 7 before the first nudge.',
    }
  }
  return { ok: true }
}

/**
 * `interview_prep_pack` signal check. Requires the master CV (the STAR
 * answers pull from actual experience bullets) — everything else is a
 * soft warning we do not fail on so the user can still generate a pack
 * from a stub stage.
 */
export function checkPrepPackSignal(
  app: ApplicationWithJob | null | undefined,
  master: MasterCV | null | undefined,
  _stage?: Pick<InterviewStage, 'kind'> | null,
): SignalResult {
  const masterCheck = requireMaster(master)
  if (!masterCheck.ok) return masterCheck
  if (!app) {
    return {
      ok: false,
      code: 'prep_no_application',
      message: 'Application not found.',
    }
  }
  return { ok: true }
}

/**
 * `interview_debrief` signal check. Refuses to reflect on nothing — the
 * post-interview honest-tone prompt would otherwise hallucinate praise.
 * Requires the stage to be completed and quickNotes to have more than the
 * blank template scaffold.
 */
export function checkDebriefSignal(
  stage: Pick<InterviewStage, 'status'> | null | undefined,
  quickNotes: string | null | undefined,
): SignalResult {
  if (!stage) {
    return {
      ok: false,
      code: 'debrief_no_stage',
      message: 'Interview stage not found.',
    }
  }
  if (stage.status !== 'completed') {
    return {
      ok: false,
      code: 'debrief_stage_not_completed',
      message: 'Debrief only makes sense after the stage is marked completed.',
      fixHint: 'Mark the stage complete before drafting a debrief.',
    }
  }
  const stripped = stripDebriefScaffold(quickNotes ?? '')
  if (stripped.length === 0) {
    return {
      ok: false,
      code: 'debrief_empty_notes',
      message: 'Debrief notes are empty — the AI has nothing to summarise.',
      fixHint: 'Write a few bullets on what happened before generating the AI summary.',
    }
  }
  return { ok: true }
}

/**
 * `discovery_scoring` signal check. Skips the entire per-user cron cycle
 * when the profile has almost no signals to match on. Threshold: fewer
 * than 3 combined skills/industries/role_types.
 */
export function checkDiscoveryScoringSignal(
  profile: UserProfile | null | undefined,
): SignalResult {
  if (!profile) {
    return {
      ok: false,
      code: 'discovery_no_profile',
      message: 'No profile yet — discovery scoring would guess.',
      fixHint: 'Fill in your profile on Settings → Profile so we can score matches.',
    }
  }
  const signals =
    (profile.skills?.length ?? 0) +
    (profile.industries?.length ?? 0) +
    (profile.roleTypes?.length ?? 0)
  if (signals < DISCOVERY_MIN_PROFILE_SIGNALS) {
    return {
      ok: false,
      code: 'discovery_profile_thin',
      message: `Profile only has ${signals} signals (need ${DISCOVERY_MIN_PROFILE_SIGNALS}) — scoring skipped.`,
      fixHint:
        'Add at least a few skills, industries and role types on Settings → Profile.',
    }
  }
  return { ok: true }
}

/**
 * `expense_classify` signal check. Fails when both description and vendor
 * are empty — the LLM would just pick "other" with high confidence.
 */
export function checkExpenseClassifySignal(
  description: string | null | undefined,
  vendor?: string | null | undefined,
): SignalResult {
  const d = (description ?? '').trim()
  const v = (vendor ?? '').trim()
  if (d.length === 0 && v.length === 0) {
    return {
      ok: false,
      code: 'expense_no_signal',
      message: 'Need a vendor or description to classify this expense.',
      fixHint: 'Type at least a vendor name or short description.',
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function requireMaster(master: MasterCV | null | undefined): SignalResult {
  if (!master) {
    return {
      ok: false,
      code: 'no_master_cv',
      message: 'No master CV yet — cannot generate a grounded document.',
      fixHint: 'Populate your CV at Settings → CV first.',
    }
  }
  if (!master.experience || master.experience.length === 0) {
    return {
      ok: false,
      code: 'master_no_experience',
      message: 'Your master CV has no experience entries — output would be empty.',
      fixHint: 'Add at least one experience entry on Settings → CV.',
    }
  }
  return { ok: true }
}

function requireJobAndCompany(
  app: ApplicationWithJob | null | undefined,
): SignalResult {
  if (!app) {
    return {
      ok: false,
      code: 'no_application',
      message: 'Application not found.',
    }
  }
  if (!app.job?.title?.trim()) {
    return {
      ok: false,
      code: 'job_no_title',
      message: 'Job has no title — nothing to tailor to.',
      fixHint: 'Add a job title on the application first.',
    }
  }
  const companyName = app.job?.company?.name?.trim() ?? ''
  if (!companyName) {
    return {
      ok: false,
      code: 'job_no_company',
      message: 'Job has no company — output would address "your company".',
      fixHint: 'Link this job to a company (or add one) before generating.',
    }
  }
  return { ok: true }
}

/**
 * Strip the default debrief template scaffold so a user who only opened
 * the dialog (no typing) still trips the empty-notes guard. Removes
 * markdown headings, standalone `-`/`*` bullets, and blank lines.
 */
function stripDebriefScaffold(raw: string): string {
  const cleaned = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (line.length === 0) return false
      // Section headings.
      if (line.startsWith('#')) return false
      // Empty bullets left by the template scaffold.
      if (/^[-*]\s*$/.test(line)) return false
      return true
    })
    .join(' ')
    .trim()
  return cleaned
}

// Exported for tests.
export const _internal = {
  PARSE_JOB_MIN_CHARS,
  FOLLOWUP_MIN_DAYS_SINCE,
  DISCOVERY_MIN_PROFILE_SIGNALS,
  stripDebriefScaffold,
}
