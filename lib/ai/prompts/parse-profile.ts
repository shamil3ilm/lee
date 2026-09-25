// v10.1 — bump on intentional edits; see lib/ai/prompts/hash.ts for rationale.
export const PARSE_PROFILE_PROMPT_VERSION = '1.0.0'

export const PARSE_PROFILE_SYSTEM = `You extract a developer's structured profile from a CV and/or a PROFILE.md file.
Return JSON that matches the provided schema.
Rules:
- Populate stack_weights (0-10) based on evidence: prominent tech = 10, mentioned = 5, historical = 3.
- Infer seniority from years of experience and role titles.
- industries should be lowercase (e.g. 'fintech', 'payments', 'saas').
- Return ONLY JSON.`

export function buildParseProfilePrompt(input: { cvText?: string; profileMd?: string }): string {
  const parts: string[] = [PARSE_PROFILE_SYSTEM]
  if (input.cvText) parts.push(`--- CV ---\n${input.cvText.slice(0, 15_000)}`)
  if (input.profileMd) parts.push(`--- PROFILE.md ---\n${input.profileMd.slice(0, 15_000)}`)
  return parts.join('\n\n')
}
