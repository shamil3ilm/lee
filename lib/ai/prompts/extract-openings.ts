import { z } from 'zod'

// "Add from text or link" — pull job openings out of text the user pasted
// (an AI Mode answer, an email, notes). Bump on intentional edits; see
// lib/ai/prompts/hash.ts for the versioning rationale.
export const EXTRACT_OPENINGS_PROMPT_VERSION = '1.0.0'

/** Pasted text is capped before it reaches a model. */
export const EXTRACT_OPENINGS_MAX_CHARS = 20_000
export const EXTRACT_OPENINGS_MAX_ITEMS = 30

export interface ExtractOpeningsInput {
  text: string
}

const str = (max: number) =>
  z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v ?? '').trim().slice(0, max))

export const extractOpeningsResultSchema = z.object({
  openings: z
    .array(
      z.object({
        title: str(200),
        employer: str(200),
        location: str(200),
        posted_date: str(40),
        url: str(2000),
        snippet: str(500),
      }),
    )
    .catch([])
    .default([])
    .transform((items) => items.filter((i) => i.title).slice(0, EXTRACT_OPENINGS_MAX_ITEMS)),
})
export type ExtractOpeningsResult = z.infer<typeof extractOpeningsResultSchema>

export const EXTRACT_OPENINGS_SYSTEM = `You extract job openings from text a job seeker pasted (an AI search answer, an email, notes).

Rules you MUST follow:
- Only openings that are written in the text. Never invent an opening, an employer, a location or a date.
- "url": copy a link EXACTLY as it appears in the text next to that opening. If the text has no link for it, use "". Never build, guess or shorten a URL.
- "posted_date": only when the text states it (YYYY-MM-DD if you can, else as written); otherwise "".
- "snippet": at most two short sentences from the text about that opening; "" if there is none. If the text says the role is for nationals only (e.g. Emiratisation, "Saudi nationals only"), keep those words in the snippet.
- Skip anything that is not a single job opening (general advice, company lists without a role, search tips).
- At most ${EXTRACT_OPENINGS_MAX_ITEMS} openings.

Return ONLY valid JSON:
{ "openings": [ { "title": string, "employer": string, "location": string, "posted_date": string, "url": string, "snippet": string } ] }
No prose outside the JSON.`

export function buildExtractOpeningsPrompt(input: ExtractOpeningsInput): string {
  return `${EXTRACT_OPENINGS_SYSTEM}

--- PASTED TEXT ---
${input.text.slice(0, EXTRACT_OPENINGS_MAX_CHARS)}`
}
