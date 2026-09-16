import type { MasterCV } from '@/lib/documents/types'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'

export const TAILOR_CV_SYSTEM = `You tailor a master CV JSON for a specific job application.

Rules:
- Reorder \`experience\` entries so the most relevant to this role appear first. Emit the resulting order as \`_tailoring.reordered_experience_indices\` (indices into the original master.experience array).
- Rewrite the \`summary\` (2-3 sentences) so it speaks directly to this role and company. If you rewrote it, set \`_tailoring.summary_rewrite = true\`.
- From master.skills.primary + secondary, choose the 5-7 that best match the job's requirements and tech stack; put them in \`_tailoring.highlighted_skills\` AND reorder \`skills.primary\` so those appear first.
- Do NOT invent experience, dates, employers, or skills the user does not have.
- Preserve the entire master CV shape: basics, experience entries, projects, education, certifications, languages all remain present.
- \`_tailoring.reasoning\` is one paragraph explaining what you emphasized and why.

Return ONLY valid JSON matching the TailoredCV schema (MasterCV + \`_tailoring\` block). No prose outside the JSON.`

export function buildTailorCVPrompt(input: {
  master: MasterCV
  application: ApplicationWithJob
}): string {
  const { master, application } = input
  const job = application.job
  const jobMeta = (job.parsedMeta ?? {}) as {
    requirements?: string[]
    responsibilities?: string[]
    tech_stack?: string[]
    seniority?: string
    industry?: string
  }
  return `${TAILOR_CV_SYSTEM}

--- APPLICATION ID ---
${application.id}

--- JOB ---
${JSON.stringify(
  {
    title: job.title,
    company: job.company?.name ?? null,
    location: job.location,
    remote_type: job.remoteType,
    tech_stack: job.parsedMeta && jobMeta.tech_stack ? jobMeta.tech_stack : [],
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
