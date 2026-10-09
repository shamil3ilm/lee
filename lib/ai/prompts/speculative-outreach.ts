import { z } from 'zod'
import type { SpeculativeFacts } from '@/lib/company-discovery/outreach'
import { withApplicationFacts } from './application-facts'

// Speculative "Reach out" draft (lib/company-discovery/outreach.ts). Bump on
// intentional edits; see lib/ai/prompts/hash.ts for the versioning rationale.
export const SPECULATIVE_OUTREACH_PROMPT_VERSION = '1.0.0'

export const speculativeOutreachResultSchema = z.object({
  subject: z.string().max(200).nullable().default(null),
  body: z.string().min(1).max(4_000),
})
export type SpeculativeOutreachResult = z.infer<typeof speculativeOutreachResultSchema>

export type SpeculativeOutreachInput = SpeculativeFacts

export const SPECULATIVE_OUTREACH_SYSTEM = `You write a SHORT speculative note from a software engineer to a company that has NO open posting the candidate knows of. The candidate sends it themselves.

Rules you MUST follow:
- Use ONLY the FACTS below. Do not add any number, year count, skill, technology, product, client, achievement, link or email address that is not in the FACTS. Never claim the company is hiring, never mention a specific opening, salary or referral that is not listed.
- channel "email": 90-170 words, a plain subject line under 70 characters. channel "linkedin": under 600 characters, no subject (null).
- Structure: one line on why this company (its domain from the FACTS), one or two lines on the candidate (headline, ready skills, the highlight quoted closely), one clear low-pressure ask (a short chat, or to be considered for future roles).
- If contact.kind is "referral", address that person by first name and ask whether they could point the candidate to the right person; do not say they referred anyone.
- No emojis, no clichés ("passionate", "hit the ground running", "results-driven", "I hope this email finds you well").
- Sign with the candidate's name only.

Return ONLY valid JSON: { "subject": string | null, "body": string }`

export function buildSpeculativeOutreachPrompt(input: SpeculativeOutreachInput): string {
  const { regionFacts, ...rest } = input
  const prompt = `${SPECULATIVE_OUTREACH_SYSTEM}

--- FACTS ---
${JSON.stringify(rest, null, 2)}`
  return withApplicationFacts(prompt, regionFacts)
}
