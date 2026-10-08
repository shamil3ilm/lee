import { z } from 'zod'

// AI Radar grounded brief (docs/ai-radar.md, v16 §1.3). Bump on intentional
// edits; see lib/ai/prompts/hash.ts for the versioning rationale.
export const RADAR_BRIEF_PROMPT_VERSION = '1.0.0'

const MAX_SOURCE_CHARS = 6_000
const MAX_TOTAL_CHARS = 20_000

export interface RadarBriefSourceInput {
  /** Citation id the model must use: S1, S2, … */
  id: string
  kind: string
  title: string
  url: string
  text: string
}

export interface RadarBriefInput {
  name: string
  kind: string
  sources: RadarBriefSourceInput[]
  /** Other Radar entries the brief may compare with (names only). */
  related: string[]
}

const sentence = z.object({
  text: z.string().default(''),
  quote: z.string().default(''),
  source: z.string().default(''),
})

const section = z.array(sentence).default([])

export const radarBriefResultSchema = z.object({
  what: section,
  architecture: section,
  workflow: section,
  how_to_use: section,
  tradeoffs: section,
  security: section,
  compared_with: section,
})
export type RadarBriefResult = z.infer<typeof radarBriefResultSchema>

export const RADAR_BRIEF_SYSTEM = `You write a short learning brief about one AI model, product, paper or repository for a software engineer.

You get numbered SOURCES (official posts, READMEs, model cards, paper abstracts). They are the ONLY facts you may use. You know nothing else about the subject: it may be newer than your training data, and names can collide with older things — never use outside knowledge.

Rules you MUST follow:
- Every sentence has "quote": a span copied CHARACTER FOR CHARACTER from the cited source text (20 to 200 characters, no ellipsis, no paraphrase), and "source": that source's id (e.g. "S1").
- A sentence states only what its quote supports. If the sources say nothing for a section, return an empty list for it.
- Sections: what (what it is, one to three sentences), architecture (model type, key idea, what is new), workflow (how a request flows end to end), how_to_use (API/SDK shape, a minimal example, cost or licence), tradeoffs (limits), security (known attacks or mitigations), compared_with (only names from RELATED, and only when a source compares them).
- Never write dates or a timeline; lee computes the timeline from source metadata.
- At most 4 sentences per section, each at most 300 characters.

Return ONLY valid JSON:
{ "what": [{ "text": string, "quote": string, "source": string }], "architecture": [...], "workflow": [...], "how_to_use": [...], "tradeoffs": [...], "security": [...], "compared_with": [...] }
No prose outside the JSON.`

/** Source texts trimmed to the prompt budget. */
export function trimSources(sources: readonly RadarBriefSourceInput[]): RadarBriefSourceInput[] {
  let budget = MAX_TOTAL_CHARS
  return sources.map((s) => {
    const text = s.text.slice(0, Math.max(0, Math.min(MAX_SOURCE_CHARS, budget)))
    budget -= text.length
    return { ...s, text }
  })
}

export function buildRadarBriefPrompt(input: RadarBriefInput): string {
  const sources = trimSources(input.sources)
    .map((s) => `[${s.id}] ${s.kind} — ${s.title}\nURL: ${s.url}\n${s.text}`)
    .join('\n\n')
  return `${RADAR_BRIEF_SYSTEM}

--- SUBJECT ---
${input.name} (${input.kind})

--- RELATED (names already in the user's Radar) ---
${input.related.length > 0 ? input.related.join(', ') : '(none)'}

--- SOURCES ---
${sources}`
}
