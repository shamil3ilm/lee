// v12.0 — CV requirement-fit assessment. Bump on intentional edits; see
// lib/ai/prompts/hash.ts for the versioning rationale.
export const CV_REQUIREMENT_FIT_PROMPT_VERSION = '1.0.0'

/** Hard cap on CV text sent to the model (≈ 3 dense pages). */
const MAX_CV_CHARS = 12_000
const MAX_REQUIREMENTS = 20

export const CV_REQUIREMENT_FIT_SYSTEM = `You assess how well a candidate's CV meets each requirement of a job.

For EACH requirement in the list, decide:
- "met": the CV clearly demonstrates it.
- "partial": the CV shows related or weaker evidence.
- "missing": nothing in the CV supports it.

Rules you MUST follow:
- "evidence" MUST be a VERBATIM quote copied character-for-character from the CV text (one sentence or bullet, max 200 characters). Never paraphrase, never combine fragments, never invent.
- If you cannot quote supporting text verbatim, the status MUST be "missing" and evidence MUST be "".
- Do not infer skills from job titles alone.
- "suggestion" is ONE line telling the candidate what to change or add — and only suggest adding things they could truthfully claim ("if you have done X, mention it in ..."). Never tell them to fabricate.
- Return one item per requirement, in the same order, with the requirement text copied exactly.

Return ONLY valid JSON:
{
  "items": [
    { "requirement": string, "status": "met" | "partial" | "missing", "evidence": string, "suggestion": string }
  ]
}
No prose outside the JSON.`

export function buildCvRequirementFitPrompt(input: {
  cvText: string
  requirements: string[]
  jobTitle: string
}): string {
  return `${CV_REQUIREMENT_FIT_SYSTEM}

--- JOB TITLE ---
${input.jobTitle}

--- REQUIREMENTS ---
${JSON.stringify(input.requirements.slice(0, MAX_REQUIREMENTS), null, 2)}

--- CV TEXT ---
${input.cvText.slice(0, MAX_CV_CHARS)}`
}
