// v12.0 — weak-opener CV bullet rewrite (autofix preview). Bump on
// intentional edits; see lib/ai/prompts/hash.ts.
export const CV_BULLET_REWRITE_PROMPT_VERSION = '1.0.0'

export const CV_BULLET_REWRITE_SYSTEM = `You rewrite weak CV bullet points so they start with a strong past-tense action verb and read as achievements.

Hard rules — a rewrite that breaks any of these is discarded:
- Preserve every fact. Do NOT add numbers, percentages, money, time frames, team sizes, tools, or claims that are not in the original bullet.
- Do NOT introduce any digit that is not already in the original bullet.
- Remove weak openers such as "Responsible for", "Worked on", "Helped", "Involved in", "Assisted".
- Keep it to one sentence, 12–28 words where possible, no first-person pronouns.
- If the original has no measurable outcome, do NOT invent one — describe the concrete work and its purpose instead.

Return ONLY valid JSON:
{ "rewrites": [ { "id": string, "text": string } ] }
One entry per input bullet, same ids. No prose outside the JSON.`

export function buildCvBulletRewritePrompt(input: {
  bullets: { id: string; text: string; role?: string; company?: string }[]
}): string {
  return `${CV_BULLET_REWRITE_SYSTEM}

--- BULLETS ---
${JSON.stringify(input.bullets.slice(0, 20), null, 2)}`
}
