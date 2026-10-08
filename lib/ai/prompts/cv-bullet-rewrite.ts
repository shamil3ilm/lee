// v12.0 — weak-opener CV bullet rewrite (autofix preview). Bump on
// intentional edits; see lib/ai/prompts/hash.ts.
// 1.1.0 — optional JOB TERMS section ("Tailor to this JD" wordings). Without
// terms the prompt is byte-for-byte the 1.0.0 one.
export const CV_BULLET_REWRITE_PROMPT_VERSION = '1.1.0'

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

const JOB_TERMS_RULES = `--- JOB TERMS ---
Words from the job ad. Where a bullet ALREADY describes the same thing, prefer the job's word for it.
Never add a term, tool, skill or claim because it is listed here; a bullet that describes none of them keeps its own words.
Keep the bullet's verbs for design work ("designed", "specified", "defined"): never turn them into building, implementing or shipping.`

export function buildCvBulletRewritePrompt(input: {
  bullets: { id: string; text: string; role?: string; company?: string }[]
  terms?: readonly string[]
}): string {
  const terms = (input.terms ?? []).slice(0, 30)
  const jobTerms = terms.length > 0 ? `

${JOB_TERMS_RULES}
${JSON.stringify(terms)}` : ''
  return `${CV_BULLET_REWRITE_SYSTEM}${jobTerms}

--- BULLETS ---
${JSON.stringify(input.bullets.slice(0, 20), null, 2)}`
}
