import type { JobMatchResult } from '@/lib/ai/types'
import type { NormalizedJob } from './adapters/types'
import type { UserProfile } from '@/lib/db/queries/profile'
import { evaluateRelevance } from './relevance/gate'
import { searchPrefsFromProfile } from './relevance/prefs'
import { findTerms, normalizeForMatch } from './relevance/text'

/**
 * Deterministic post-AI score caps per v1 spec §8.2. The AI produces a raw
 * score; we enforce hard ceilings here so misjudged-but-obvious mismatches
 * cannot slip through.
 */
export function applyCaps(
  raw: JobMatchResult,
  job: NormalizedJob,
  profile: UserProfile,
): number {
  let score = raw.match_score

  // Location cap: mismatch + non-remote + user won't relocate = max 30
  if (
    raw.location_match === 'mismatch' &&
    job.remoteType !== 'remote' &&
    !profile.acceptRelocation
  ) {
    score = Math.min(score, 30)
  }

  // Seniority cap: stretching down is a red flag → max 40
  if (raw.seniority_match === 'stretch_down') {
    score = Math.min(score, 40)
  }

  // Must-have benefits cap: any missing must-have benefit → max 25
  const mustHaves = readMustHaves(profile)
  const benefits = normalizeBenefits(job)
  if (mustHaves.length > 0) {
    const missingAny = mustHaves.some((k) => !hasBenefit(benefits, k))
    if (missingAny) score = Math.min(score, 25)
  }

  score = applyPreferenceCaps(score, job, profile)
  return Math.max(0, Math.min(100, Math.round(score)))
}

/** Caps and bonus from the user's search preferences (lib/discovery/relevance). */
export const PREFERENCE_CAPS = {
  /** Filtered seniority (Principal / Director / Head / VP; a "Show anyway" row). */
  seniority: 40,
  /** A soft seniority stretch (Senior title, 5+ yrs asked); a strong ready match lifts it. */
  seniorityStretch: 70,
  seniorityStretchStrong: 80,
  /** Role family outside the targets. */
  role: 50,
  /** Named place outside the selected regions. */
  location: 30,
  /** Posting located in a selected GCC/India region. */
  regionBonus: 5,
  /** GCC posting about e-invoicing / ZATCA for a profile with that evidence. */
  einvoicingBonus: 8,
} as const

const EINVOICING = ['zatca', 'fatoora', 'e-invoicing', 'einvoicing', 'e-invoice', 'electronic invoicing']

/**
 * The gate already filters mismatches, but a row the user restored with
 * "Show anyway" (or one scored before preferences changed) is still scored:
 * cap it so it cannot outrank real matches, and prefer the selected regions.
 */
function applyPreferenceCaps(score: number, job: NormalizedJob, profile: UserProfile): number {
  const prefs = searchPrefsFromProfile(profile)
  if (!prefs.active) return score
  const r = evaluateRelevance(
    {
      title: job.title,
      location: job.location,
      remoteType: job.remoteType,
      descriptionMd: job.descriptionMd,
      techStack: job.techStack,
      employmentType: job.employmentType,
      salary: job.salary,
    },
    prefs,
  )
  let s = score
  const has = (prefix: string): boolean => r.reasons.some((x) => x.startsWith(prefix))
  if (has('seniority:')) s = Math.min(s, PREFERENCE_CAPS.seniority)
  if (has('role:')) s = Math.min(s, PREFERENCE_CAPS.role)
  if (has('location:')) s = Math.min(s, PREFERENCE_CAPS.location)
  // Bonuses only for postings that pass every preference, and never for a
  // soft seniority stretch (Senior title, 5+ yrs asked), which is capped.
  if (!r.pass) return s
  const stretch = r.penalties.find((p) => / title\b| yrs asked\b/.test(p))
  if (stretch) {
    return Math.min(s, /\bstrong .+ match$/.test(stretch) ? PREFERENCE_CAPS.seniorityStretchStrong : PREFERENCE_CAPS.seniorityStretch)
  }
  if (r.regions.some((t) => t !== 'remote')) s += PREFERENCE_CAPS.regionBonus
  if (r.regions.includes('gcc')) {
    const posting = normalizeForMatch(`${job.title} ${job.descriptionMd ?? ''}`.slice(0, 8_000))
    const mine = normalizeForMatch((profile.skills ?? []).join(' | '))
    if (findTerms(posting, EINVOICING).length > 0 && findTerms(mine, [...EINVOICING, 'vat', 'xades', 'ubl']).length > 0) {
      s += PREFERENCE_CAPS.einvoicingBonus
    }
  }
  return s
}

/**
 * Independent 0–100 benefits score. Sums the weights of matched benefits,
 * divides by total weight, scales to 0..100. Falls back to 0 when no weights
 * configured (so an unconfigured profile does not muddy the ranking).
 */
export function benefitsScore(
  benefits: Record<string, unknown>,
  weights: Record<string, number>,
): number {
  const entries = Object.entries(weights)
  if (entries.length === 0) return 0
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0)
  if (totalWeight <= 0) return 0
  const earned = entries.reduce(
    (sum, [key, w]) => (hasBenefit(benefits, key) ? sum + w : sum),
    0,
  )
  return Math.round((earned / totalWeight) * 100)
}

/**
 * Map a preference key (e.g. "visa_sponsorship") to a boolean check against
 * the flexible benefits object. New keys can be added without touching call
 * sites — unknown keys return false.
 */
export function hasBenefit(benefits: Record<string, unknown>, key: string): boolean {
  if (!benefits) return false
  const b = benefits as Record<string, unknown>
  switch (key) {
    case 'visa_sponsorship':
      return b.visa_sponsorship === true
    case 'relocation_package':
      return b.relocation_package === true
    case 'family_health_insurance': {
      const insurance = b.insurance as Record<string, unknown> | undefined
      return insurance?.family_covered === true
    }
    case 'remote_or_hybrid': {
      const remote = b.remote as Record<string, unknown> | undefined
      return remote?.fully_remote === true || remote?.hybrid === true
    }
    case 'compensation_meets_floor': {
      // The floor comparison itself lives outside this pure helper — treat
      // presence of any compensation info as "meets floor" here and let the
      // caller override when a real floor is known.
      const comp = b.compensation as Record<string, unknown> | undefined
      return typeof comp?.min === 'number' || typeof comp?.max === 'number'
    }
    case 'equity':
      return b.equity === true || (b.equity != null && b.equity !== false)
    case 'four_day_week':
      return b.four_day_week === true
    default:
      // Fallback: literal boolean true on the top-level key.
      return b[key] === true
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeBenefits(job: NormalizedJob): Record<string, unknown> {
  const raw = (job as unknown as { benefits?: Record<string, unknown> }).benefits
  return raw ?? {}
}

function readMustHaves(profile: UserProfile): string[] {
  const prefs = profile.benefitPrefs as { must_haves?: unknown } | null
  const mh = prefs?.must_haves
  if (Array.isArray(mh)) return mh.filter((x): x is string => typeof x === 'string')
  return []
}

/** Convenience combined-sort helper. */
export function combinedScore(matchScore: number, benefits: number): number {
  return Math.round(0.6 * matchScore + 0.4 * benefits)
}
