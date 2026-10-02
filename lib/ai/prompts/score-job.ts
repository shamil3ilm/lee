import type { NormalizedJob } from '@/lib/discovery/adapters/types'
import type { UserProfile } from '@/lib/db/queries/profile'
import { regionLabel } from '@/lib/discovery/relevance/places'
import { searchPrefsFromProfile } from '@/lib/discovery/relevance/prefs'
import { roleFamilyLabel } from '@/lib/discovery/relevance/roles'
import { SENIORITY_LABELS } from '@/lib/discovery/relevance/seniority'

// v10.1 — bump on intentional edits; see lib/ai/prompts/hash.ts for rationale.
// 1.1.0 — search preferences (target roles, seniority levels, regions,
// remote scope) and a master-CV digest; region and seniority rules.
export const SCORE_JOB_PROMPT_VERSION = '1.1.0'

/**
 * Extra grounding for the scoring prompt. The digest comes from the
 * profile and the MASTER CV only (lib/discovery/relevance/suggest.ts
 * `profileDigest`); tailored CVs never feed scoring.
 */
export interface ScoreJobContext {
  cvDigest?: string
}

export const SCORE_JOB_SYSTEM = `You score how well a job posting matches a user's profile.

Rules the score MUST follow:
- Fintech, payments, banking, or regtech industry adds +15 to the base score.
- A small company (team_size <= 50) with a strong tech-stack overlap does NOT get a small-company penalty.
- Rate stack overlap using the profile's stack_weights map and the master CV digest; a heavier weight on a matched skill contributes more than a light one.
- Explicit reasoning is required — never emit a bare score with no justification.
- target_roles lists the role families the user wants; a posting outside them scores lower.
- target_seniority lists the levels the user accepts. If the posting asks for a higher level (a Senior/Lead/Staff/Principal title, or more years of experience than the user has), use seniority_match = "stretch_up" and score it lower; if far below, use "stretch_down".
- target_regions are the user's preferred places. Prefer postings located in them; a remote role open to the user's location is fine unless remote_scope is "none".
- If seniority in the job is far below the user's, use seniority_match = "stretch_down".
- location_match:
   * "priority_1" if the job location is in the user's first location preference or target_regions
   * "priority_2" if in a secondary preference
   * "priority_3" if in willing_to_relocate_to
   * "remote" if the job is remote and the user allows remote
   * "mismatch" otherwise

Return ONLY valid JSON matching this schema:
{
  "match_score": number 0..100,
  "strengths": string[],
  "red_flags": string[],
  "reasoning": string (1 paragraph),
  "location_match": "priority_1" | "priority_2" | "priority_3" | "remote" | "mismatch",
  "seniority_match": "match" | "stretch_up" | "stretch_down" | "mismatch",
  "stack_overlap": string[],
  "stack_gaps": string[],
  "industry_match": "strong" | "adjacent" | "weak" | "mismatch"
}
No prose outside the JSON.`

export function buildScoreJobPrompt(
  job: NormalizedJob,
  profile: UserProfile,
  context: ScoreJobContext = {},
): string {
  const prefs = searchPrefsFromProfile(profile)
  return `${SCORE_JOB_SYSTEM}

--- USER PROFILE ---
${JSON.stringify(
  {
    headline: profile.headline,
    skills: profile.skills,
    industries: profile.industries,
    role_types: profile.roleTypes,
    target_roles: prefs.roleFamilies.map(roleFamilyLabel).concat(prefs.customRoles),
    seniority: profile.seniority,
    target_seniority: prefs.seniority.map((l) => SENIORITY_LABELS[l]),
    years_experience: profile.yearsExperience,
    remote_pref: profile.remotePref,
    remote_scope: prefs.remoteScope,
    target_regions: prefs.regions.map(regionLabel),
    location_prefs: profile.locationPrefs,
    accept_relocation: profile.acceptRelocation,
    willing_to_relocate_to: profile.willingToRelocateTo,
    stack_weights: profile.stackWeights,
    must_haves: profile.mustHaves,
    dealbreakers: profile.dealbreakers,
  },
  null,
  2,
)}
${context.cvDigest ? `\n--- MASTER CV DIGEST ---\n${context.cvDigest}\n` : ''}
--- JOB ---
${JSON.stringify(
  {
    title: job.title,
    company: job.companyName,
    location: job.location,
    remote_type: job.remoteType,
    employment_type: job.employmentType,
    tech_stack: job.techStack,
    description: (job.descriptionMd ?? '').slice(0, 6_000),
  },
  null,
  2,
)}`
}
