import type { MasterCV } from '@/lib/documents/types'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'

export const COVER_LETTER_SYSTEM = `You draft a role-specific cover letter from a master CV and a job posting.

Rules:
- 3-4 body paragraphs. Concise, professional, no filler.
- Specific to the company and role — reference the company by name and the role title.
- Cite 1-2 concrete achievements from the master CV (real bullets or projects). Do NOT invent achievements.
- No clichés: avoid "passionate about", "team player", "hit the ground running", "results-driven", "synergy".
- Greeting should be "Dear Hiring Manager," unless a specific contact name is provided in the application.
- Closing should be a professional sign-off (e.g. "Sincerely,\\n<Name>").
- \`senderName\` = master.basics.name.
- \`applicationId\` = the value provided below.

Return ONLY valid JSON with this shape:
{
  "applicationId": string,
  "greeting": string,
  "paragraphs": string[],  // 3-4 items
  "closing": string,
  "senderName": string
}
No prose outside the JSON.`

export function buildCoverLetterPrompt(input: {
  master: MasterCV
  application: ApplicationWithJob
}): string {
  const { master, application } = input
  const job = application.job
  const jobMeta = (job.parsedMeta ?? {}) as {
    requirements?: string[]
    responsibilities?: string[]
    industry?: string
  }
  return `${COVER_LETTER_SYSTEM}

--- APPLICATION ID ---
${application.id}

--- JOB ---
${JSON.stringify(
  {
    title: job.title,
    company: job.company?.name ?? null,
    location: job.location,
    requirements: jobMeta.requirements ?? [],
    responsibilities: jobMeta.responsibilities ?? [],
    industry: jobMeta.industry ?? null,
    description: (job.descriptionMd ?? '').slice(0, 4_000),
  },
  null,
  2,
)}

--- MASTER CV ---
${JSON.stringify(
  {
    basics: master.basics,
    summary: master.summary,
    experience: master.experience.map((e) => ({
      company: e.company,
      role: e.role,
      start: e.start,
      end: e.end,
      bullets: e.bullets,
    })),
    projects: master.projects ?? [],
    skills: master.skills,
  },
  null,
  2,
)}`
}
