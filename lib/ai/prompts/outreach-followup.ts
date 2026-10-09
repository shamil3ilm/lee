import type { MasterCV, OutreachTone } from '@/lib/documents/types'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'
import type { FollowupStep } from '@/lib/followups/cadence'

/**
 * Follow-up email after applying (lib/followups/cadence.ts): two short,
 * polite notes, then stop. Recruiters, GCC agencies in particular, handle
 * hundreds of applicants; more chasers hurt.
 *
 *   step 1  check-in, 5 business days after applying (3 for a GCC agency)
 *   step 2  final note, 10 business days after applying
 *
 * Both steps share the same shape (subject + body) so the OutreachDraft
 * schema round-trips.
 */
// v10.1 — bump on intentional edits; see lib/ai/prompts/hash.ts for rationale.
// 1.2.0 — region block (lib/ai/prompts/application-facts.ts).
// 2.0.0 — two steps in business days instead of 7/14/21/30 calendar days;
//         the "share an article" value-add framing is gone; shorter notes.
export const OUTREACH_FOLLOWUP_PROMPT_VERSION = '2.0.0'

export const OUTREACH_FOLLOWUP_SYSTEM = `You draft a follow-up EMAIL from a candidate to a recruiter or hiring manager AFTER they have already applied.

Rules for both steps:
- Concise and polite: the reader handles many applicants. One clear ask. No pressure, no guilt, no repeated CV.
- Include a \`subject\` (short, references the role, e.g. "Following up: <role>").
- Grounded in the JOB and MASTER CV only. Do NOT invent achievements, links, posts or projects, and do not offer to share any. Do NOT use clichés ("passionate about", "hit the ground running", "results-driven", "just circling back", "wanted to touch base"). No emojis.
- Sign off with master.basics.name only.
- Set \`kind\` = "followup_email", \`applicationId\` = provided value, \`tone\` = provided tone, \`daysSince\` = provided business days, \`followupStep\` = provided step.
- \`wordCount\` = whitespace-separated words in \`body\` (not including subject or signature).
- \`notes\` is one sentence on the framing choice.

FRAMING BY STEP:
- STEP 1 → CHECK-IN. 50-90 words. Say you applied (when), name ONE match from the CV in one sentence, and ask a single question: is there an update on next steps, or should you send anything else?
- STEP 2 → FINAL NOTE. 60-100 words. Re-state interest briefly, ask whether the role is still open and whether you are still under consideration, thank them, and close the loop politely (leave the door open for future roles). This is the last follow-up: do not promise or suggest another one.

--- FEW-SHOT EXAMPLE (step 1, tone=friendly) ---
{
  "kind": "followup_email",
  "applicationId": "app-xyz",
  "subject": "Following up: Payments Engineer",
  "body": "Hi Jamie,\\n\\nI applied for the Payments Engineer role on Monday and wanted to check in briefly. My recent work on idempotent payout APIs in Laravel lines up with what the posting describes, and I am happy to share more detail or re-send anything that would help.\\n\\nIs there an update on next steps, or someone else I should follow up with?\\n\\nThanks,\\nAda",
  "tone": "friendly",
  "wordCount": 62,
  "followupStep": 1,
  "daysSince": 5,
  "notes": "One CV match and a single low-pressure question."
}

--- FEW-SHOT EXAMPLE (step 2, tone=formal) ---
{
  "kind": "followup_email",
  "applicationId": "app-xyz",
  "subject": "Payments Engineer: a final note",
  "body": "Hi Jamie,\\n\\nA short final note on my application for the Payments Engineer role, sent two weeks ago. I remain interested: the reconciliation work in my CV is close to what your team describes.\\n\\nCould you let me know whether the role is still open and whether I am still under consideration? If it has moved on, no problem, and thank you for your time. I would be glad to hear about future openings.\\n\\nBest regards,\\nAda",
  "tone": "formal",
  "wordCount": 74,
  "followupStep": 2,
  "daysSince": 10,
  "notes": "Last note: direct status question, thanks, and a polite close."
}

Return ONLY valid JSON:
{
  "kind": "followup_email",
  "applicationId": string,
  "subject": string,
  "body": string,          // <= 100 words
  "tone": "formal" | "friendly" | "enthusiastic",
  "wordCount": number,
  "followupStep": 1 | 2,
  "daysSince": number,     // business days since applying
  "notes"?: string
}
No prose outside the JSON.`

export function buildFollowupPrompt(input: {
  master: MasterCV
  application: ApplicationWithJob
  daysSince: number
  step: FollowupStep
  tone: OutreachTone
}): string {
  const { master, application, daysSince, step, tone } = input
  const job = application.job
  const jobMeta = (job.parsedMeta ?? {}) as {
    requirements?: string[]
    responsibilities?: string[]
    industry?: string
  }
  const appliedDate = application.appliedAt ? application.appliedAt.toISOString().slice(0, 10) : 'unknown'
  return `${OUTREACH_FOLLOWUP_SYSTEM}

--- APPLICATION ID ---
${application.id}

--- TONE ---
${tone}

--- FOLLOW-UP STEP ---
${step}

--- BUSINESS DAYS SINCE APPLIED ---
${daysSince}

--- APPLIED ON (ISO date) ---
${appliedDate}

--- JOB ---
${JSON.stringify(
  {
    title: job.title,
    company: job.company?.name ?? null,
    location: job.location,
    remote_type: job.remoteType,
    requirements: jobMeta.requirements ?? [],
    responsibilities: jobMeta.responsibilities ?? [],
    industry: jobMeta.industry ?? null,
    description: (job.descriptionMd ?? '').slice(0, 2_000),
  },
  null,
  2,
)}

--- MASTER CV ---
${JSON.stringify(
  {
    basics: master.basics,
    summary: master.summary,
    experience: master.experience.slice(0, 3).map((e) => ({
      company: e.company,
      role: e.role,
      bullets: e.bullets,
    })),
    projects: (master.projects ?? []).slice(0, 3),
    skills: master.skills,
  },
  null,
  2,
)}`
}
