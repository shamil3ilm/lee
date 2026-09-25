import type { MasterCV } from '@/lib/documents/types'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'
import type { InterviewStage } from '@/lib/db/queries/stages'

export const INTERVIEW_DEBRIEF_SYSTEM = `You produce an honest, structured post-interview debrief for a candidate. The candidate has already jotted quick reflection notes (see QUICK NOTES below) and wants those turned into a polished summary the future-them can review before follow-up decisions and next-round prep.

Rules for the JSON you must return:
- \`stageId\` = provided value (string, required).
- \`applicationId\` = provided value (string, required).
- \`summary\`: 2-3 sentences on what happened in the interview. Neutral tone — the candidate's raw notes are the source of truth. Do NOT fabricate details the notes do not support.
- \`wentWell\`: 2-5 short bullets calling out concrete positives (specific answers landed well, rapport established, prep paid off).
- \`toImprove\`: 2-5 short bullets naming concrete things to improve next time. Be direct; do NOT sugar-coat weak answers.
- \`questionsAsked\`: array of question objects extracted from QUICK NOTES. Each:
  * \`question\`: verbatim or paraphrased question text.
  * \`myAnswerQuality\`: 'strong' | 'ok' | 'weak' — judge honestly based on the candidate's own reflection in the notes.
  * \`note\`: one sentence on how to sharpen the answer if it was 'ok' or 'weak', or what made it work if 'strong'.
- \`redFlags\`: 0-4 concrete observations about the company / role / process (e.g. interviewer distracted, unclear scope, on-call load hinted). Pull only from the notes — do NOT speculate.
- \`followUpRecommendations\`: 2-5 concrete next actions. Examples: "send thank-you referencing X within 24h", "prep system-design deep-dive on Y for next round", "ask recruiter about Z before accepting the loop". Tie back to specifics from the notes and, where relevant, to a bullet in MASTER CV.experience the candidate could lean on next round.
- \`outcomeConfidence\`: one of 'likely_advance' | 'unclear' | 'likely_rejected'. Base this on tone + signals in the notes (interviewer said "we'll be in touch by Friday" is different from "we have a few more candidates to see").
- \`reasoning\`: one paragraph (3-5 sentences) explaining the outcomeConfidence. Cite specific quotes or observations from the notes.

Style rules:
- Honest > flattering. If the candidate wrote "botched the SQL question", say so in \`toImprove\` — don't reframe it as a positive.
- Concrete > generic. "Practice binary tree traversal until the recursive vs iterative tradeoffs are automatic" beats "practice more".
- Reference CV bullets by shortened prefix when a recommendation ties back to lived experience.

Return ONLY valid JSON matching the InterviewDebrief schema. No prose outside the JSON.`

export function buildInterviewDebriefPrompt(input: {
  master: MasterCV
  application: ApplicationWithJob
  stage: Pick<InterviewStage, 'id' | 'kind' | 'title' | 'scheduledAt'>
  quickNotes: string
}): string {
  const { master, application, stage, quickNotes } = input
  const job = application.job
  return `${INTERVIEW_DEBRIEF_SYSTEM}

--- APPLICATION ID ---
${application.id}

--- STAGE ID ---
${stage.id}

--- STAGE ---
${JSON.stringify(
  {
    kind: stage.kind,
    title: stage.title,
    scheduledAt: stage.scheduledAt ? stage.scheduledAt.toISOString() : null,
  },
  null,
  2,
)}

--- JOB ---
${JSON.stringify(
  {
    title: job.title,
    company: job.company?.name ?? null,
    location: job.location,
    remote_type: job.remoteType,
    description: (job.descriptionMd ?? '').slice(0, 3_000),
  },
  null,
  2,
)}

--- MASTER CV ---
${JSON.stringify(master, null, 2)}

--- QUICK NOTES (raw, from candidate) ---
${quickNotes}`
}
