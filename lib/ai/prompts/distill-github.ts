import type { GitHubRepo } from '@/lib/documents/types'

// v10.1 — bump on intentional edits; see lib/ai/prompts/hash.ts for rationale.
export const DISTILL_GITHUB_PROMPT_VERSION = '1.0.0'

export const DISTILL_GITHUB_SYSTEM = `You distill a list of GitHub public repos into a short "notable projects" list for a CV.

Rules:
- Choose the 3-5 most impressive or portfolio-worthy repos: prefer higher star counts, non-trivial descriptions, recent activity. Skip forks, homework, dotfiles, and empty repos.
- For each chosen repo output an object matching:
  { name: string, url: string, description: string, tech: string[], highlights?: string[] }
- \`description\` is one clean sentence describing what the project does (rewrite the GitHub description if needed; be concrete).
- \`tech\` is the tech stack inferred from primaryLanguage plus anything mentioned in the description (e.g. ["typescript", "next.js"]).
- \`highlights\` is optional — 1-2 bullets on what makes the project notable (e.g. "1.2k stars", "used in production by X"). Omit if nothing stands out.
- Do NOT invent stars, descriptions, or facts.

Return ONLY a valid JSON ARRAY of project objects. No prose. No wrapping object.`

export function buildDistillGithubPrompt(input: { repos: GitHubRepo[] }): string {
  // Cap at 30; the array is already pre-filtered by the caller.
  const trimmed = input.repos.slice(0, 30)
  return `${DISTILL_GITHUB_SYSTEM}

--- REPOS ---
${JSON.stringify(trimmed, null, 2)}`
}
