import * as documentsQ from '@/lib/db/queries/documents'
import * as profileQ from '@/lib/db/queries/profile'
import type { Document } from '@/lib/db/queries/documents'
import type { UserProfile } from '@/lib/db/queries/profile'
import { masterCvSchema } from '@/lib/documents/types'
import { canonicalJson } from '@/lib/portfolio/canonical'
import { publicFactsChanged } from '@/lib/portfolio/apply'
import { publicFactsLocked } from '@/lib/portfolio/lock'
import { LOCKED_MESSAGE } from '@/lib/portfolio/sync-flags'
import { readProfileLinks } from '@/lib/profile/links'
import { noticeLabel, parseDiscoveryPrefs } from '@/lib/discovery/relevance/discovery-prefs'
import { toMasterCv } from './derive'
import { newId } from './ids'
import { newWordingErrors, profileIntegrityErrors } from './integrity'
import { fromMasterCv } from './legacy'
import { emptyResumeProfile, parseResumeProfile, readResumeProfile, type ResumeProfile } from './types'

/**
 * Loading and saving the master profile.
 *
 * Source of truth: `user_profile.resume`. On every save the MasterCV is
 * re-derived and, when it changed, written as a new `master_cv` document
 * version — a snapshot that keeps the documents library, staleness checks,
 * CV Score history and every MasterCV consumer working unchanged.
 *
 * Migration: a user who only has a legacy `master_cv` document gets a
 * profile built from it (lib/resume/legacy.ts) on first load, saved once.
 */

export class ResumeValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(problems[0] ?? 'Invalid profile.')
    this.name = 'ResumeValidationError'
  }
}

/** The stored profile, or null when none is saved yet (no migration). */
export async function readStoredProfile(userId: string, row?: UserProfile | null): Promise<ResumeProfile | null> {
  const profile = row !== undefined ? row : await profileQ.get(userId)
  return readResumeProfile(profile?.resume)
}

/** A first profile from what lee already knows (settings, links, search prefs). Not saved. */
export function seedProfile(row: UserProfile | null): ResumeProfile {
  const base = emptyResumeProfile()
  if (!row) return base
  const prefs = parseDiscoveryPrefs(row.discoveryPrefs)
  const links = readProfileLinks(row.links)
  const network = (kind: string, label: string) =>
    links.filter((l) => l.kind === kind).map((l) => ({ id: newId('p'), network: label, url: l.url }))
  return parseResumeProfile({
    ...base,
    basics: {
      ...base.basics,
      label: row.headline ?? '',
      summary: (row.summaryMd ?? '').slice(0, 2000),
      url: links.find((l) => l.kind === 'portfolio')?.url ?? '',
      location: { ...base.basics.location, countryCode: prefs.basedIn ?? '' },
      profiles: [...network('github', 'GitHub'), ...network('linkedin', 'LinkedIn')],
      noticePeriod: noticeLabel(prefs.noticePeriods) ?? '',
      visaStatus: prefs.sponsorshipFor.length > 0 ? 'Requires visa sponsorship' : '',
    },
    skills:
      row.skills.length > 0
        ? [{ id: newId('g'), name: 'Skills', skills: row.skills.map((name) => ({ id: newId('sk'), name, depth: 'own' })) }]
        : [],
    languages: prefs.languages.map((l) => ({ id: newId('l'), language: l.name, fluency: l.level })),
  })
}

/**
 * The profile for the editor: stored → legacy master CV (migrated and
 * saved once) → seeded from settings (not saved until the user saves).
 */
export async function getResumeProfile(userId: string): Promise<{ profile: ResumeProfile; stored: boolean }> {
  const row = await profileQ.get(userId)
  const stored = readResumeProfile(row?.resume)
  if (stored) return { profile: stored, stored: true }
  const legacy = await documentsQ.getLatestMaster(userId)
  const parsed = legacy ? masterCvSchema.safeParse(legacy.content) : null
  if (parsed?.success) {
    const migrated = fromMasterCv(parsed.data)
    await profileQ.upsert(userId, { resume: migrated })
    return { profile: migrated, stored: true }
  }
  return { profile: seedProfile(row), stored: false }
}

/** Validate strictly; throws ResumeValidationError with user-facing problems. */
export function validateResumeProfile(input: unknown): ResumeProfile {
  let profile: ResumeProfile
  try {
    profile = parseResumeProfile(input)
  } catch {
    throw new ResumeValidationError(['Some profile fields are missing or invalid.'])
  }
  const problems = profileIntegrityErrors(profile)
  if (problems.length > 0) throw new ResumeValidationError(problems)
  return profile
}

export interface SaveResult {
  profile: ResumeProfile
  /** The master_cv snapshot written by this save; null when the derived CV did not change. */
  masterDocument: Document | null
}

/** A save that would change public facts while they come from the portfolio (lib/portfolio/lock.ts). */
export class PublicFactsLockedError extends ResumeValidationError {
  constructor() {
    super([LOCKED_MESSAGE])
    this.name = 'PublicFactsLockedError'
  }
}

export interface SaveOptions {
  /**
   * 'portfolio': a pull from the portfolio (lib/portfolio/pull.ts), the one
   * writer of public facts while they are read-only in lee.
   */
  source?: 'user' | 'portfolio'
}

/**
 * Save the profile and refresh the derived master_cv snapshot when it
 * changed. While the user's portfolio is the source (lib/portfolio/lock.ts)
 * a save that changes a public fact is refused; the lee-only overlay
 * (readiness, wordings, skill kinds, private items) saves as usual.
 */
export async function saveResumeProfile(userId: string, input: unknown, opts: SaveOptions = {}): Promise<SaveResult> {
  const profile = validateResumeProfile(input)
  const previous = await readStoredProfile(userId)
  if (opts.source !== 'portfolio' && publicFactsChanged(previous, profile) && (await publicFactsLocked(userId))) {
    throw new PublicFactsLockedError()
  }
  const wordingProblems = newWordingErrors(previous, profile)
  if (wordingProblems.length > 0) throw new ResumeValidationError(wordingProblems)
  await profileQ.upsert(userId, { resume: profile })
  const cv = toMasterCv(profile)
  if (!cv) return { profile, masterDocument: null }
  const latest = await documentsQ.getLatestMaster(userId)
  if (latest && canonicalJson(latest.content) === canonicalJson(cv)) return { profile, masterDocument: null }
  const version = await documentsQ.nextVersion(userId, null, 'master_cv')
  const masterDocument = await documentsQ.create(userId, {
    applicationId: null,
    kind: 'master_cv',
    version,
    title: `Master CV v${version}`,
    content: cv,
  })
  return { profile, masterDocument }
}
