import { z } from 'zod'

// Discovery relevance — optional AI refinement of role suggestions. Bump on
// intentional edits; see lib/ai/prompts/hash.ts for the versioning rationale.
export const SUGGEST_ROLES_PROMPT_VERSION = '1.0.0'

export interface SuggestRolesInput {
  /** Profile + master-CV digest (lib/discovery/relevance/suggest.ts). Never a tailored CV. */
  digest: string
  /** Families the model may pick from: id + label. */
  families: ReadonlyArray<{ id: string; label: string }>
  /** Families already targeted or already suggested by the rules. */
  exclude: readonly string[]
}

export const suggestRolesResultSchema = z.object({
  suggestions: z
    .array(
      z.object({
        family: z.string(),
        reason: z.string().max(300).default(''),
      }),
    )
    .max(8)
    .default([]),
})
export type SuggestRolesResult = z.infer<typeof suggestRolesResultSchema>

export const SUGGEST_ROLES_SYSTEM = `You suggest adjacent job-role families a candidate could realistically apply for.

Rules you MUST follow:
- Use ONLY the candidate profile and master CV digest below. Do not assume skills that are not written there.
- Pick at most 4 families from the allowed list, by id. Never pick an id from the excluded list.
- Each reason cites concrete evidence from the digest (a skill, a CV role or a project) in one short sentence.
- Prefer roles that match the candidate's current level; do not suggest senior leadership roles.
- If nothing fits, return an empty list.

Return ONLY valid JSON:
{ "suggestions": [ { "family": string, "reason": string } ] }
No prose outside the JSON.`

export function buildSuggestRolesPrompt(input: SuggestRolesInput): string {
  const allowed = input.families.filter((f) => !input.exclude.includes(f.id))
  return `${SUGGEST_ROLES_SYSTEM}

--- ALLOWED FAMILIES ---
${allowed.map((f) => `${f.id}: ${f.label}`).join('\n')}

--- EXCLUDED ---
${input.exclude.join(', ') || '(none)'}

--- CANDIDATE PROFILE + MASTER CV DIGEST ---
${input.digest}`
}
