import type { MasterCV, OutreachTone } from '@/lib/documents/types'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'

export const OUTREACH_LINKEDIN_MESSAGE_SYSTEM = `You draft a follow-up LinkedIn message from a candidate to a recruiter/hiring manager AFTER the connection request has been accepted.

Rules:
- The \`body\` MUST be between 500 and 1500 characters. Count characters, not words.
- Longer than a connection request; short enough that a busy recruiter finishes it. 3-5 short paragraphs, blank line between paragraphs.
- Open with a brief thank-you for connecting; reference the specific role or a specific company detail (product, engineering blog post, team, funding round) drawn from the JOB context.
- Middle paragraph: one paragraph on concrete relevant experience — cite an actual bullet from the MASTER CV. Do NOT invent achievements.
- Close with a clear, single ask: a short call, a referral to the hiring manager, or a note about applying / already applied.
- Do NOT include a subject line; leave \`subject\` off.
- No emojis. No clichés ("passionate", "would love", "hit the ground running", "results-driven"). Signature line optional; if included, use master.basics.name only.
- Set \`kind\` = "linkedin_message", \`applicationId\` = provided value, \`tone\` = provided tone.
- \`wordCount\` = whitespace-separated words in \`body\`.
- \`notes\` is one sentence on framing and CTA choice.

--- FEW-SHOT EXAMPLE (tone=friendly) ---
{
  "kind": "linkedin_message",
  "applicationId": "app-xyz",
  "body": "Hi Jamie — thanks for connecting. I saw the Staff Payments Engineer opening at Stripe and wanted to reach out directly.\\n\\nMost of the last three years I've been running a Go/Kafka ledger for a mid-market fintech; last year we replaced a hand-rolled reconciliation job with an event-sourced flow that cut daily settle errors from ~40 to under 3. A lot of the constraints (idempotency, multi-currency rounding, batch vs. streaming) look similar to what your team is working through publicly.\\n\\nI've already applied via the careers page (ref #ABC-123). If it would be useful, I'd be happy to jump on a 20-min call, or if you'd rather flag it to the hiring manager directly that also works — whichever is easier on your side.\\n\\nEither way, appreciate the connect.\\nAda",
  "tone": "friendly",
  "wordCount": 148,
  "notes": "Anchors on a concrete result from the CV plus a concrete public reference; single dual-CTA keeps it low-friction."
}

Return ONLY valid JSON:
{
  "kind": "linkedin_message",
  "applicationId": string,
  "body": string,        // 500-1500 chars
  "tone": "formal" | "friendly" | "enthusiastic",
  "wordCount": number,
  "notes"?: string
}
No prose outside the JSON.`

export function buildOutreachLinkedInMessagePrompt(input: {
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
  return `${OUTREACH_LINKEDIN_MESSAGE_SYSTEM}

--- APPLICATION ID ---
${application.id}

--- TONE ---
${tone}

--- JOB ---
${JSON.stringify(
  {
    title: job.title,
    company: job.company?.name ?? null,
    requirements: jobMeta.requirements ?? [],
    responsibilities: jobMeta.responsibilities ?? [],
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
    projects: (master.projects ?? []).slice(0, 3),
    skills: master.skills,
  },
  null,
  2,
)}`
}
