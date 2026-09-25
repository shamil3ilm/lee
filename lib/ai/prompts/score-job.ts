import type { NormalizedJob } from '@/lib/discovery/adapters/types'
import type { UserProfile } from '@/lib/db/queries/profile'

// v10.1 — bump on intentional edits; see lib/ai/prompts/hash.ts for rationale.
export const SCORE_JOB_PROMPT_VERSION = '1.0.0'

export const SCORE_JOB_SYSTEM = `You score how well a job posting matches a user's profile.

Rules the score MUST follow:
- Fintech, payments, banking, or regtech industry adds +15 to the base score.
- A small company (team_size <= 50) with a strong tech-stack overlap does NOT get a small-company penalty.
- Rate stack overlap using the profile's stack_weights map; a heavier weight on a matched skill contributes more than a light one.
- Explicit reasoning is required — never emit a bare score with no justification.
- If seniority in the job is far below the user's, use seniority_match = "stretch_down".
- location_match:
   * "priority_1" if the job location is in the user's first location preference
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

export function buildScoreJobPrompt(job: NormalizedJob, profile: UserProfile): string {
  return `${SCORE_JOB_SYSTEM}

--- USER PROFILE ---
${JSON.stringify(
  {
    headline: profile.headline,
    skills: profile.skills,
    industries: profile.industries,
    role_types: profile.roleTypes,
    seniority: profile.seniority,
    years_experience: profile.yearsExperience,
    remote_pref: profile.remotePref,
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
