import type { MasterCV, OutreachTone } from '@/lib/documents/types'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'

export const OUTREACH_RECRUITER_REPLY_SYSTEM = `You draft an email reply to an INBOUND recruiter message about the role in the JOB block.

Rules:
- Professional email format. Include a \`subject\` (short, references the role — e.g. "Re: <role> at <company>").
- \`body\` is 150-400 words. Count words (whitespace-separated), not characters.
- Confirm continued interest in the role, briefly (1-2 sentences) reinforce the strongest match from the MASTER CV, ask 1-2 concrete questions about the role/team/comp (choose the ones most useful to a real candidate — team size, tech stack, hybrid/remote policy, compensation range, interview loop shape, timeline).
- Close with a clear CTA for next step (share availability windows, propose a 30-min call this week, or ask what times work).
- Sign off with master.basics.name only.
- Do NOT invent achievements. Do NOT use clichés ("passionate about", "hit the ground running", "results-driven"). No emojis.
- Set \`kind\` = "recruiter_reply", \`applicationId\` = provided value, \`tone\` = provided tone.
- \`wordCount\` = whitespace-separated words in \`body\` (not including subject or signature line).
- \`notes\` is one sentence on why these specific questions/CTA.

--- FEW-SHOT EXAMPLE (tone=friendly) ---
{
  "kind": "recruiter_reply",
  "applicationId": "app-xyz",
  "subject": "Re: Staff Payments Engineer at Stripe",
  "body": "Hi Jamie,\\n\\nThanks for reaching out — yes, the Staff Payments Engineer role is very much of interest, and the ledger/reconciliation surface area you described in the note lines up closely with the last two years of my work.\\n\\nQuick context on my side: at Fintech Corp I own the Go/Kafka ledger that clears ~$X/day; last year we cut daily settlement errors from 40 to under 3 by moving reconciliation to an event-sourced flow. Happy to walk through the design if it's useful.\\n\\nA couple of questions before we schedule a call:\\n1. What's the team's current split between deep systems work and platform enablement (i.e. supporting product teams that build on top of the ledger)?\\n2. What's the ballpark comp band for this level in EMEA, and is there flexibility on remote-first?\\n\\nI'm free Tuesday afternoon or any time Wednesday-Thursday next week (UK time) — happy to hold a 30-min slot. Or if it's easier, send a Calendly and I'll grab something.\\n\\nThanks again,\\nAda",
  "tone": "friendly",
  "wordCount": 175,
  "notes": "Questions focus on scope + comp — the two things a real staff-level candidate needs to know before the loop starts."
}

Return ONLY valid JSON:
{
  "kind": "recruiter_reply",
  "applicationId": string,
  "subject": string,
  "body": string,          // 150-400 words
  "tone": "formal" | "friendly" | "enthusiastic",
  "wordCount": number,
  "notes"?: string
}
No prose outside the JSON.`

export function buildOutreachRecruiterReplyPrompt(input: {
  master: MasterCV
  application: ApplicationWithJob
  tone: OutreachTone
}): string {
  const { master, application, tone } = input
  const job = application.job
  const jobMeta = (job.parsedMeta ?? {}) as {
    requirements?: string[]
    responsibilities?: string[]
    industry?: string
  }
  return `${OUTREACH_RECRUITER_REPLY_SYSTEM}

--- APPLICATION ID ---
${application.id}

--- TONE ---
${tone}

--- JOB ---
${JSON.stringify(
  {
    title: job.title,
    company: job.company?.name ?? null,
    location: job.location,
    remote_type: job.remoteType,
    salary_min: job.salaryMin,
    salary_max: job.salaryMax,
    salary_currency: job.salaryCurrency,
    requirements: jobMeta.requirements ?? [],
    responsibilities: jobMeta.responsibilities ?? [],
    industry: jobMeta.industry ?? null,
    description: (job.descriptionMd ?? '').slice(0, 3_000),
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
    skills: master.skills,
  },
  null,
  2,
)}`
}
