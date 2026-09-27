import { z } from 'zod'

// Company reputation summary (docs/company-reviews.md). Bump on intentional
// edits; see lib/ai/prompts/hash.ts for the versioning rationale.
export const REPUTATION_SUMMARY_PROMPT_VERSION = '1.0.0'

const MAX_SIGNALS = 40

export interface ReputationSummarySignal {
  /** Citation id the model must use. */
  id: string
  source: string
  title: string
  date: string | null
  category: string | null
}

export interface ReputationSummaryInput {
  companyName: string
  facts: string | null
  signals: ReputationSummarySignal[]
}

const claim = z.object({
  text: z.string().default(''),
  cites: z.array(z.string()).default([]),
})

export const reputationSummaryResultSchema = z.object({
  pros: z.array(claim).default([]),
  cons: z.array(claim).default([]),
  red_flags: z
    .array(
      claim.extend({
        category: z
          .enum(['unpaid_salaries', 'visa_contract', 'layoffs', 'toxic_culture', 'fraud', 'other'])
          .catch('other'),
        gcc_relevance: z.string().default(''),
      }),
    )
    .default([]),
  gcc_note: z.string().default(''),
})
export type ReputationSummaryResult = z.infer<typeof reputationSummaryResultSchema>

export const REPUTATION_SUMMARY_SYSTEM = `You summarise an employer's reputation for a job seeker targeting the GCC (UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman).

You get a numbered list of SIGNALS: news headlines, Hacker News items, and the user's own notes from review sites. They are the ONLY facts you may use.

Rules you MUST follow:
- Every claim cites one or more signal ids from the list in "cites". Never cite an id that is not in the list.
- Never state anything the cited signals do not support. No outside knowledge, no guesses. When the signals are thin, return fewer claims.
- A headline is a report, not a proven fact: write "reported", "according to …".
- red_flags only for: unpaid_salaries (salary delays, wage theft), visa_contract (visa cancellation, contract breaches, withheld passports), layoffs, toxic_culture, fraud, other.
- gcc_relevance: one sentence on why the flag matters for someone hired into the GCC (e.g. visa tied to the employer, end-of-service gratuity, salary delays under WPS). Empty when not relevant.
- gcc_note: one or two sentences overall; empty if nothing GCC-specific.
- Max 5 pros, 5 cons, 5 red flags. Each text max 300 characters.

Return ONLY valid JSON:
{
  "pros": [{ "text": string, "cites": string[] }],
  "cons": [{ "text": string, "cites": string[] }],
  "red_flags": [{ "category": string, "text": string, "cites": string[], "gcc_relevance": string }],
  "gcc_note": string
}
No prose outside the JSON.`

export function buildReputationSummaryPrompt(input: ReputationSummaryInput): string {
  return `${REPUTATION_SUMMARY_SYSTEM}

--- COMPANY ---
${input.companyName}${input.facts ? `\n${input.facts}` : ''}

--- SIGNALS ---
${JSON.stringify(input.signals.slice(0, MAX_SIGNALS), null, 2)}`
}
