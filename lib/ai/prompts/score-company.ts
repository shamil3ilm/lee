import type { NormalizedCompany } from '@/lib/discovery/adapters/types'
import type { UserProfile } from '@/lib/db/queries/profile'

export const SCORE_COMPANY_SYSTEM = `You score how well a company matches a user's profile for a job search.

Rules the score MUST follow:
- Fintech, payments, banking, or regtech companies add +15 to the base score.
- Match the user's company_size_weights map when scoring size; if a user weights "1-10" high, prefer small companies.
- If the company's location matches one of the user's location_prefs (or the user is open to remote work worldwide), boost the score.
- Explicit reasoning is required.

Return ONLY valid JSON matching this schema:
{
  "match_score": number 0..100,
  "strengths": string[],
  "red_flags": string[],
  "reasoning": string,
  "industry_match": "strong" | "adjacent" | "weak" | "mismatch",
  "size_match": "match" | "small" | "large"
}
No prose outside the JSON.`

export function buildScoreCompanyPrompt(
  company: NormalizedCompany,
  profile: UserProfile,
): string {
  return `${SCORE_COMPANY_SYSTEM}

--- USER PROFILE ---
${JSON.stringify(
  {
    industries: profile.industries,
    remote_pref: profile.remotePref,
    location_prefs: profile.locationPrefs,
    company_size_weights: profile.companySizeWeights,
    must_haves: profile.mustHaves,
    dealbreakers: profile.dealbreakers,
  },
  null,
  2,
)}

--- COMPANY ---
${JSON.stringify(
  {
    name: company.name,
    domain: company.domain,
    industry: company.industry,
    size: company.size,
    stage: company.stage,
    hq_country: company.hqCountry,
    hq_city: company.hqCity,
    description: company.description,
  },
  null,
  2,
)}`
}
