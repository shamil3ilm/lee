import type { MasterCV, OutreachTone } from '@/lib/documents/types'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'

/**
 * v4.2 — timed follow-up email after applying. The framing differs by
 * interval so a real candidate would not send four identical emails: gentle
 * check-in → value-add → clear reiteration → close-the-loop.
 *
 * All intervals share the same shape (subject + body) so the OutreachDraft
 * schema round-trips regardless of daysSince.
 */
export const OUTREACH_FOLLOWUP_SYSTEM = `You draft a follow-up EMAIL from a candidate to a recruiter/hiring manager AFTER they have already applied.

Rules for ALL intervals:
- Professional email format. Include a \`subject\` (short, references the role — e.g. "Following up: <role>").
- Max 200 words in \`body\`. Count words (whitespace-separated), not characters.
- Grounded in the JOB + MASTER CV. Do NOT invent achievements. Do NOT use clichés ("passionate about", "hit the ground running", "results-driven", "just circling back", "wanted to touch base"). No emojis.
- Sign off with master.basics.name only.
- Set \`kind\` = "followup_email", \`applicationId\` = provided value, \`tone\` = provided tone, \`daysSince\` = provided daysSince.
- \`wordCount\` = whitespace-separated words in \`body\` (not including subject or signature).
- \`notes\` is one sentence on the framing choice for this interval.

FRAMING RULES BY INTERVAL (daysSince):
- 7 days → GENTLE CHECK-IN. Brief (80-120 words). One-line reminder you applied on <date>. Single ask: "any update on next steps?" or "should I re-send anything?". Warm but low-pressure. No CV rehash.
- 14 days → VALUE-ADD. 120-180 words. Share ONE relevant, concrete artefact (a related project you shipped, a recent article/insight you found on their problem space, a public engineering post they wrote). Soften the ask — offer to share more work rather than demand a reply. Do NOT invent an article/project; only reference something plausibly grounded in the MASTER CV or a well-known public reference.
- 21 days → CLEAR REITERATION + DEADLINE CHECK. 130-180 words. Re-state interest in the role, name ONE strongest match from the CV in one sentence, then ask directly about hiring timeline: "is the role still open?", "when do you expect to decide?", or "am I still under consideration?". Firm but not demanding.
- 30 days → POLITE CLOSE-THE-LOOP. 100-160 words. Acknowledge time has passed. Ask for a final decision OR respectfully withdraw so both sides can move on. Thank them for their time regardless. Leave the door open for future roles.

--- FEW-SHOT EXAMPLE (daysSince=7, tone=friendly) ---
{
  "kind": "followup_email",
  "applicationId": "app-xyz",
  "subject": "Following up: Staff Payments Engineer",
  "body": "Hi Jamie,\\n\\nQuick note — I applied for the Staff Payments Engineer role a week ago and wanted to check in. Happy to answer any questions or re-send anything if it helps move things along.\\n\\nIf a different member of the team is running the loop, I'd be glad to redirect this to them.\\n\\nThanks,\\nAda",
  "tone": "friendly",
  "wordCount": 52,
  "daysSince": 7,
  "notes": "Low-pressure single ask keeps the door open without pushing a decision."
}

--- FEW-SHOT EXAMPLE (daysSince=14, tone=friendly) ---
{
  "kind": "followup_email",
  "applicationId": "app-xyz",
  "subject": "Re: Staff Payments Engineer — one more thing",
  "body": "Hi Jamie,\\n\\nStill very interested in the Staff Payments Engineer role. Two weeks in I wanted to share something concrete rather than just chase.\\n\\nThe event-sourced ledger work I mentioned in my CV — I published a short write-up on how we moved reconciliation from a batch job to a streaming flow (cut daily settle errors ~90%). Happy to send the link if it'd be useful to the team, or walk through the design over a call.\\n\\nEither way, no pressure — I know these loops take time.\\n\\nThanks,\\nAda",
  "tone": "friendly",
  "wordCount": 88,
  "daysSince": 14,
  "notes": "Value-add framing: offer an artefact grounded in an actual CV bullet instead of asking again."
}

--- FEW-SHOT EXAMPLE (daysSince=21, tone=formal) ---
{
  "kind": "followup_email",
  "applicationId": "app-xyz",
  "subject": "Staff Payments Engineer — timeline check",
  "body": "Hi Jamie,\\n\\nIt's been three weeks since I applied for the Staff Payments Engineer role, so I wanted to check where things stand. The ledger + Kafka experience from my time at Fintech Corp lines up closely with what the JD calls out, and I remain very interested.\\n\\nCould you let me know whether the role is still open, and if so, roughly when you expect to move to next-round decisions? I'd rather know either way so I can plan my search accordingly.\\n\\nThanks for your time,\\nAda",
  "tone": "formal",
  "wordCount": 92,
  "daysSince": 21,
  "notes": "Direct timeline ask + strongest CV match in one sentence; firm without being pushy."
}

--- FEW-SHOT EXAMPLE (daysSince=30, tone=friendly) ---
{
  "kind": "followup_email",
  "applicationId": "app-xyz",
  "subject": "Staff Payments Engineer — closing the loop",
  "body": "Hi Jamie,\\n\\nA month on and I haven't heard back, so I wanted to close the loop rather than keep either of us guessing.\\n\\nIf the role is still active and I'm still under consideration, I'd love a quick note either way. If it's moved on, no hard feelings — please keep me in mind for future openings that touch payments or ledger work.\\n\\nThanks again for the time you spent on my application.\\n\\nAda",
  "tone": "friendly",
  "wordCount": 80,
  "daysSince": 30,
  "notes": "Explicit close-the-loop with door open for future roles — respectful of both sides' time."
}

Return ONLY valid JSON:
{
  "kind": "followup_email",
  "applicationId": string,
  "subject": string,
  "body": string,          // <= 200 words
  "tone": "formal" | "friendly" | "enthusiastic",
  "wordCount": number,
  "daysSince": number,     // 7 | 14 | 21 | 30
  "notes"?: string
}
No prose outside the JSON.`

export function buildFollowupPrompt(input: {
  master: MasterCV
  application: ApplicationWithJob
  daysSince: number
  tone: OutreachTone
}): string {
  const { master, application, daysSince, tone } = input
  const job = application.job
  const jobMeta = (job.parsedMeta ?? {}) as {
    requirements?: string[]
    responsibilities?: string[]
    industry?: string
  }
  const appliedDate = application.appliedAt
    ? application.appliedAt.toISOString().slice(0, 10)
    : 'unknown'
  return `${OUTREACH_FOLLOWUP_SYSTEM}

--- APPLICATION ID ---
${application.id}

--- TONE ---
${tone}

--- DAYS SINCE APPLIED ---
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
