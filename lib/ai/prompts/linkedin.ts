import { z } from 'zod'

// LinkedIn post composer and profile optimizer (docs/integrations-github-linkedin.md).
// Both are drafts: the caller fact-locks them (lib/integrations/linkedin/facts.ts)
// and the user edits and confirms. Bump on intentional edits; see
// lib/ai/prompts/hash.ts for the versioning rationale.
export const LINKEDIN_POST_PROMPT_VERSION = '1.0.0'
export const LINKEDIN_PROFILE_PROMPT_VERSION = '1.0.0'

export const LINKEDIN_POST_KINDS = ['achievement', 'case_study', 'radar', 'open_to_work'] as const
export type LinkedInPostKind = (typeof LINKEDIN_POST_KINDS)[number]

export interface LinkedInPostInput {
  kind: LinkedInPostKind
  /** The ONLY facts the post may state (profile items, a case study, a Radar item). */
  facts: string[]
  /** Optional link to include (portfolio case study, Radar source). */
  link: string | null
}

export const linkedinPostResultSchema = z.object({ text: z.string().max(3000).default('') })
export type LinkedInPostResult = z.infer<typeof linkedinPostResultSchema>

const KIND_BRIEF: Readonly<Record<LinkedInPostKind, string>> = {
  achievement: 'Share one professional achievement: what the problem was, what the candidate did, the outcome.',
  case_study: 'Introduce a portfolio case study and invite readers to read it.',
  radar: 'Share one thing the candidate is learning from a recent tech news item, and why it matters to their work.',
  open_to_work: 'Announce that the candidate is open to new roles: the roles, the strengths, where (if given).',
}

export function buildLinkedInPostPrompt(input: LinkedInPostInput): string {
  return `You draft a short LinkedIn post for a software professional, in their own voice (first person).

Task: ${KIND_BRIEF[input.kind]}

Rules you MUST follow:
- Use ONLY the facts below. Never add a number, metric, employer, client, technology or claim that is not written there.
- 600 to 1200 characters. Plain text, short paragraphs, at most 3 hashtags at the end. No emojis.
- No requests to like, share or comment. No tagging people.
${input.link ? `- End with this link on its own line: ${input.link}` : '- Do not include any link.'}

Return ONLY valid JSON: { "text": string }

--- FACTS ---
${input.facts.map((f) => `- ${f}`).join('\n')}`
}

export interface LinkedInProfileInput {
  headline: string
  about: string
  targetRoles: string[]
  keywords: string[]
  /** The candidate's best CV text: the only source of facts. */
  cvText: string
}

export const linkedinProfileResultSchema = z.object({
  headlines: z.array(z.string().max(220)).max(3).default([]),
  about: z.string().max(2600).default(''),
})
export type LinkedInProfileResult = z.infer<typeof linkedinProfileResultSchema>

export function buildLinkedInProfilePrompt(input: LinkedInProfileInput): string {
  return `You improve a software professional's LinkedIn headline and About section for recruiters searching for the target roles.

Rules you MUST follow:
- Use ONLY facts from the CV below. Never add a number, employer, technology or claim the CV does not state.
- Headlines: up to 3 options, each at most 220 characters, leading with the target role and 2-4 of the keywords the CV supports.
- About: 1200 to 2000 characters, first person, the first two lines must stand alone (they show before "see more"), end with what roles the candidate is looking for.
- Plain text; no emojis.

Return ONLY valid JSON: { "headlines": string[], "about": string }

--- TARGET ROLES ---
${input.targetRoles.join(', ') || '(not set)'}

--- KEYWORDS ---
${input.keywords.join(', ') || '(none)'}

--- CURRENT HEADLINE ---
${input.headline || '(empty)'}

--- CURRENT ABOUT ---
${input.about || '(empty)'}

--- CV ---
${input.cvText.slice(0, 12000)}`
}
