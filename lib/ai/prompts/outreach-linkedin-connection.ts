import type { MasterCV, OutreachTone } from '@/lib/documents/types'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'

export const OUTREACH_LINKEDIN_CONNECTION_SYSTEM = `You draft a short LinkedIn connection request from a candidate to a recruiter/hiring manager at a specific company.

Rules:
- STRICT: the \`body\` field MUST be <= 300 characters (LinkedIn hard limit). Count characters, not words.
- Warm but not desperate; specific to the person's company/team; no clichés.
- Reference ONE concrete relevance point (a shared stack, a recent product/launch, a specific team) drawn from the JOB and MASTER CV.
- Do NOT invent facts, tenure, or common connections. Do NOT include emojis.
- Avoid: "passionate about", "hit the ground running", "results-driven", "excited to connect", "would love to pick your brain".
- Do NOT include a subject line (connection requests have no subject); leave \`subject\` off.
- Set \`kind\` = "linkedin_connection", \`applicationId\` = provided value, \`tone\` = provided tone.
- \`wordCount\` = whitespace-separated words in \`body\`.
- \`notes\` is one sentence on why this framing (why the reference point is likely to land).

--- FEW-SHOT EXAMPLES ---
Example (tone=friendly):
{
  "kind": "linkedin_connection",
  "applicationId": "app-xyz",
  "body": "Hi Jamie — saw the Stripe billing infra post last week; I've been building event-sourced ledgers in Go for the past two years and would love to swap notes.",
  "tone": "friendly",
  "wordCount": 30,
  "notes": "Ledger/event-sourcing overlap is a concrete technical hook that matches the recent public post."
}

Example (tone=formal):
{
  "kind": "linkedin_connection",
  "applicationId": "app-xyz",
  "body": "Hi Priya — I lead observability at Fintech Corp and noticed your team is scaling Prometheus federation at Datadog. I'd like to connect and follow your work.",
  "tone": "formal",
  "wordCount": 26
}

Return ONLY valid JSON matching this shape:
{
  "kind": "linkedin_connection",
  "applicationId": string,
  "subject"?: string,
  "body": string,        // <= 300 chars
  "tone": "formal" | "friendly" | "enthusiastic",
  "wordCount": number,
  "notes"?: string
}
No prose outside the JSON.`

export function buildOutreachLinkedInConnectionPrompt(input: {
  master: MasterCV
  application: ApplicationWithJob
  tone: OutreachTone
}): string {
  const { master, application, tone } = input
  const job = application.job
  return `${OUTREACH_LINKEDIN_CONNECTION_SYSTEM}

--- APPLICATION ID ---
${application.id}

--- TONE ---
${tone}

--- JOB ---
${JSON.stringify(
  {
    title: job.title,
    company: job.company?.name ?? null,
    tech_stack: job.company?.techStack ?? [],
    description: (job.descriptionMd ?? '').slice(0, 2_000),
  },
  null,
  2,
)}

--- MASTER CV (summary) ---
${JSON.stringify(
  {
    name: master.basics.name,
    headline: master.basics.headline,
    summary: master.summary,
    top_experience: master.experience.slice(0, 2).map((e) => ({
      company: e.company,
      role: e.role,
      bullets: e.bullets.slice(0, 3),
    })),
    skills: master.skills.primary.slice(0, 8),
  },
  null,
  2,
)}`
}
