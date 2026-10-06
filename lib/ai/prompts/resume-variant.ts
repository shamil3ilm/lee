import { z } from 'zod'

// Résumé variants — AI proposals the user confirms (lib/variants/proposals.ts
// filters every answer through readiness and the fact lock first).
export const RESUME_VARIANT_PROMPT_VERSION = '1.0.0'

export interface VariantItemForAi {
  id: string
  kind: 'highlight' | 'project'
  /** Where it lives: "PayFlow — Backend Engineer", "Project: Open Ledger". */
  context: string
  text: string
  /** True when the candidate owns only the design/domain side of it. */
  designOnly: boolean
}

export interface ResumeVariantInput {
  region: string
  roleFamily: string | null
  headline: string
  summary: string
  /** Only interview-ready (or design-only) items: nothing else is ever sent. */
  items: VariantItemForAi[]
  job?: { title: string; description: string } | null
}

export const resumeVariantResultSchema = z.object({
  headline: z.string().max(200).default(''),
  summary: z.string().max(1200).default(''),
  selectedIds: z.array(z.string()).max(60).default([]),
  wordings: z.array(z.object({ id: z.string(), text: z.string().max(400) })).max(30).default([]),
})
export type ResumeVariantResult = z.infer<typeof resumeVariantResultSchema>

export const RESUME_VARIANT_SYSTEM = `You help a candidate prepare one résumé variant (a region + role version of their CV).

Rules you MUST follow:
- Use ONLY the items below. Select by id; never invent an item, employer, skill or number.
- Pick the items that best fit the region and role (and the job, when given), most relevant first.
- You may propose a sharper wording for an item. A wording must keep every number exactly as written in the item and add no new facts.
- Items marked DESIGN-ONLY are work the candidate designed or owns as domain knowledge, not code they wrote: word them as design or domain work ("designed", "specified", "defined"), never as built/implemented/coded/shipped.
- Write a headline (max 12 words) and a 2-3 sentence summary from the items only.

Return ONLY valid JSON:
{ "headline": string, "summary": string, "selectedIds": [string], "wordings": [ { "id": string, "text": string } ] }
No prose outside the JSON.`

export function buildResumeVariantPrompt(input: ResumeVariantInput): string {
  return `${RESUME_VARIANT_SYSTEM}

--- TARGET ---
Region: ${input.region}
Role family: ${input.roleFamily ?? '(general)'}
Current headline: ${input.headline || '(none)'}
Current summary: ${input.summary || '(none)'}

--- JOB ---
${input.job ? `${input.job.title}\n${input.job.description.slice(0, 3_000)}` : '(none)'}

--- ITEMS ---
${input.items.map((i) => `[${i.id}] ${i.designOnly ? 'DESIGN-ONLY ' : ''}${i.context}: ${i.text}`).join('\n')}`
}
