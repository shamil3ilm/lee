import type { MasterCV } from '@/lib/documents/types'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'

export const INTERVIEW_PREP_SYSTEM = `You produce an interview prep pack for a candidate preparing for a specific interview stage.

Rules for the JSON you must return:
- \`applicationId\` = provided value.
- \`stageId\` = provided value (may be null).
- \`stageKind\` = provided value (e.g. recruiter_screen, tech_screen, system_design, behavioral, take_home).
- \`companyResearch\`:
  * \`summary\`: 2-3 sentence overview of what the company does, drawn from what's in the JOB block. Do NOT fabricate financials, headcount, or news you have not been given.
  * \`industry\`: 1-3 short labels.
  * \`notable_facts\`: 2-4 concrete facts drawn from the JOB text (a product, a scale metric, a recent launch). If nothing is present, return an empty array — do NOT invent.
  * \`tech_stack\`: technologies gleaned from job description / requirements.
  * \`culture_signals\`: 1-3 short observations (remote-first, async, high on-call load, engineering-blog-heavy, etc.) — inferred only from the JOB text.
- \`likelyQuestions\`: 5-10 questions SPECIFIC to \`stageKind\`. Distribution:
  * recruiter_screen: mostly \`behavioral\` + \`culture\` + \`salary\`.
  * tech_screen: mostly \`technical\` + 1-2 \`behavioral\`.
  * system_design: all \`system_design\`.
  * behavioral: all \`behavioral\`.
  * take_home: mostly \`take_home\` + \`technical\`.
  Each question needs \`category\` and \`difficulty\` (easy | medium | hard).
  * For every \`behavioral\` question, include a \`star_answer\` object grounded in a REAL bullet from MASTER CV.experience — set \`cv_bullet_ref\` to the exact bullet text you referenced (or a shortened prefix). Do NOT invent projects.
  * For every \`technical\` / \`system_design\` question, include \`technical_notes\` (1-3 sentences on what to emphasize — not the full solution).
- \`talkingPoints\`: 3-5 things the candidate should raise unprompted, drawn from CV strengths that match the JOB.
- \`redFlags\`: 2-4 concrete things to probe about the company (on-call rota, growth stage, funding, team churn).
- \`yourQuestions\`: 4-6 sharp questions the candidate can ask the interviewer, tuned to stageKind (e.g. compensation questions belong in recruiter_screen only).

Return ONLY valid JSON matching the InterviewPrepPack schema. No prose outside the JSON.

--- FEW-SHOT (abbreviated) ---
For a behavioral question grounded in a CV bullet "Built event-sourced ledger cutting reconciliation errors 90%":
{
  "question": "Tell me about a time you improved reliability of a critical system.",
  "category": "behavioral",
  "difficulty": "medium",
  "star_answer": {
    "situation": "The ledger at Fintech Corp was producing ~40 daily settlement errors requiring manual reconciliation.",
    "task": "Own the redesign of reconciliation to bring errors to a low single-digit baseline within a quarter.",
    "action": "Introduced an event-sourced flow in Go/Kafka with a per-event idempotency key, replayable from a snapshot; migrated in phases behind a feature flag.",
    "result": "Daily errors fell from ~40 to under 3, freeing 6 ops hours a day and unblocking automated end-of-day reporting.",
    "cv_bullet_ref": "Built event-sourced ledger cutting reconciliation errors 90%"
  }
}`

export function buildInterviewPrepPrompt(input: {
  master: MasterCV
  application: ApplicationWithJob
  stageKind: string
  stageId?: string
}): string {
  const { master, application, stageKind, stageId } = input
  const job = application.job
  const jobMeta = (job.parsedMeta ?? {}) as {
    requirements?: string[]
    responsibilities?: string[]
    tech_stack?: string[]
    seniority?: string
    industry?: string
  }
  return `${INTERVIEW_PREP_SYSTEM}

--- APPLICATION ID ---
${application.id}

--- STAGE ID ---
${stageId ?? 'null'}

--- STAGE KIND ---
${stageKind}

--- JOB ---
${JSON.stringify(
  {
    title: job.title,
    company: job.company?.name ?? null,
    company_website: job.company?.website ?? null,
    company_tech_stack: job.company?.techStack ?? [],
    company_industry: job.company?.headquartersCountry ?? null,
    location: job.location,
    remote_type: job.remoteType,
    tech_stack: jobMeta.tech_stack ?? [],
    requirements: jobMeta.requirements ?? [],
    responsibilities: jobMeta.responsibilities ?? [],
    seniority: jobMeta.seniority ?? null,
    industry: jobMeta.industry ?? null,
    description: (job.descriptionMd ?? '').slice(0, 5_000),
  },
  null,
  2,
)}

--- MASTER CV ---
${JSON.stringify(master, null, 2)}`
}
