import { z } from 'zod'

// "Compare with my current job" narrative (docs/job-comparison.md). Bump on
// intentional edits; see lib/ai/prompts/hash.ts for the versioning rationale.
export const COMPARE_NARRATIVE_PROMPT_VERSION = '1.0.0'

const MAX_FACTS = 60

export interface CompareNarrativeFact {
  /** Citation id the model must use. */
  id: string
  text: string
}

/**
 * Only facts lee already computed and shows (posting quotes, the user's own
 * notes, rule outcomes, relative pay). The current salary itself is never
 * sent: pay facts are the posting's range and the estimated difference.
 */
export interface CompareNarrativeInput {
  jobTitle: string
  companyName: string | null
  facts: CompareNarrativeFact[]
  unknowns: CompareNarrativeFact[]
}

const claim = z.object({ text: z.string().default(''), cites: z.array(z.string()).default([]) })

export const compareNarrativeResultSchema = z.object({
  summary: z.array(claim).default([]),
  questions: z.array(claim).default([]),
})
export type CompareNarrativeResult = z.infer<typeof compareNarrativeResultSchema>

export const COMPARE_NARRATIVE_SYSTEM = `You help a job seeker compare a job opportunity with their CURRENT job.

You get numbered FACTS (already computed from the posting, the user's own notes and their assumptions) and UNKNOWNS (things nobody has stated yet). They are the ONLY information you may use.

Rules you MUST follow:
- Every summary sentence cites one or more fact ids in "cites". Never cite an id that is not in the lists.
- Never invent or recompute figures. Any number you write must appear in a cited fact. Prefer words ("higher", "unknown") over numbers.
- Estimates stay estimates: say "estimated" or "likely" when a fact is an estimate.
- Unknown is not bad and not good: say it is unknown and what to ask.
- "questions": short questions the user can ask the recruiter or HR about the UNKNOWNS (benefits, visa, growth path, hours). Cite the unknown's id.
- At most 5 summary sentences and 6 questions. Each at most 250 characters. Plain, friendly English.

Return ONLY valid JSON:
{
  "summary": [{ "text": string, "cites": string[] }],
  "questions": [{ "text": string, "cites": string[] }]
}
No prose outside the JSON.`

export function buildCompareNarrativePrompt(input: CompareNarrativeInput): string {
  return `${COMPARE_NARRATIVE_SYSTEM}

--- OPPORTUNITY ---
${input.jobTitle}${input.companyName ? ` at ${input.companyName}` : ''}

--- FACTS ---
${JSON.stringify(input.facts.slice(0, MAX_FACTS), null, 2)}

--- UNKNOWNS ---
${JSON.stringify(input.unknowns.slice(0, MAX_FACTS), null, 2)}`
}
