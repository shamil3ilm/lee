import type { MasterCV } from '@/lib/documents/types'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'

// v10.1 — bump on intentional edits; see lib/ai/prompts/hash.ts for rationale.
// 1.1.0 — starts from the chosen résumé variant (not the raw master) and
// keeps design/domain-only bullets framed as design work.
export const TAILOR_CV_PROMPT_VERSION = '1.1.0'

/** The résumé variant a tailoring starts from (lib/variants). */
export interface TailorVariantContext {
  name: string
  version: number
  /** Bullets the user owns as design/domain work, not hands-on implementation. */
  domainOnly: string[]
}

export interface TailorCVInput {
  /** The STARTING CV: the rendered variant, or the derived master CV. */
  master: MasterCV
  application: ApplicationWithJob
  variant?: TailorVariantContext
}

export const TAILOR_CV_SYSTEM = `You tailor a starting CV JSON for a specific job application.

Rules:
- Work ONLY inside the starting CV. It was already curated by the candidate (a résumé variant or their master CV): never add an employer, project, bullet, skill, number or date that is not in it.
- Reorder \`experience\` entries so the most relevant to this role appear first. Emit the resulting order as \`_tailoring.reordered_experience_indices\` (indices into the starting experience array).
- Rewrite the \`summary\` (2-3 sentences) so it speaks directly to this role and company. If you rewrote it, set \`_tailoring.summary_rewrite = true\`. Use only facts and numbers that appear in the starting CV.
- From skills.primary + secondary, choose the 5-7 that best match the job's requirements and tech stack; put them in \`_tailoring.highlighted_skills\` AND reorder \`skills.primary\` so those appear first.
- Bullets listed under DESIGN-ONLY describe work the candidate owns as design or domain knowledge, not as hand-written code. Keep them framed that way ("designed", "specified", "defined"); never rephrase them as building, implementing, coding or shipping.
- Preserve the starting CV's shape: basics, experience entries, projects, education, certifications, languages all remain present.
- \`_tailoring.reasoning\` is one paragraph explaining what you emphasized and why.

Return ONLY valid JSON matching the TailoredCV schema (MasterCV + \`_tailoring\` block). No prose outside the JSON.`

export function buildTailorCVPrompt(input: TailorCVInput): string {
  const { master, application, variant } = input
  const job = application.job
  const jobMeta = (job.parsedMeta ?? {}) as {
    requirements?: string[]
    responsibilities?: string[]
    tech_stack?: string[]
    seniority?: string
    industry?: string
  }
  const source = variant ? `RÉSUMÉ VARIANT "${variant.name}" v${variant.version}` : 'MASTER CV'
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

--- DESIGN-ONLY ---
${variant && variant.domainOnly.length > 0 ? variant.domainOnly.map((b) => `- ${b}`).join('\n') : '(none)'}

--- STARTING CV (${source}) ---
${JSON.stringify(master, null, 2)}`
}
