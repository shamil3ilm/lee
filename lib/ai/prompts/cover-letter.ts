import type { MasterCV } from '@/lib/documents/types'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'

// v10.1 — bump on intentional edits; see lib/ai/prompts/hash.ts for rationale.
// 1.2.0 — reads the JD requirements lee checked against the ready profile
// and the adjacent experience the user chose to mention ("Tailor to this
// JD"). Without a saved tailoring the prompt is the 1.1.0 one.
export const COVER_LETTER_PROMPT_VERSION = '1.2.0'

/** What "Tailor to this JD" saved for this application (lib/cv-fit/tailor). */
export interface CoverLetterTailoring {
  requirements: Array<{ text: string; weight: 'must' | 'nice'; status: 'met' | 'partial' | 'missing'; evidence?: string }>
  /** Missing requirements the user chose to answer with adjacent experience, with that evidence. */
  adjacent: Array<{ requirement: string; evidence: string }>
}

const TAILORING_RULES = `Use these to choose what to cite:
- Lead with requirements marked [met] and cite their evidence line (it is from the candidate's profile).
- A [partial] requirement may be described only as far as its evidence goes.
- NEVER claim a requirement marked [missing].
- ADJACENT lines may be mentioned only as related experience ("my work on X is close to Y"), never as the missing skill itself.`

export function tailoringSection(t: CoverLetterTailoring | undefined): string {
  if (!t || (t.requirements.length === 0 && t.adjacent.length === 0)) return ''
  const reqs = t.requirements
    .slice(0, 20)
    .map((r) => `- [${r.status}] ${r.text}${r.evidence && r.status !== 'missing' ? ` — evidence: "${r.evidence}"` : ''}`)
  const adj = t.adjacent.slice(0, 6).map((a) => `- For "${a.requirement}": "${a.evidence}"`)
  const parts = [
    '--- REQUIREMENTS (checked by lee against the candidate\'s ready profile) ---',
    TAILORING_RULES,
    ...reqs,
    ...(adj.length > 0 ? ['', '--- ADJACENT EXPERIENCE THE CANDIDATE CHOSE TO MENTION ---', ...adj] : []),
  ]
  return `\n\n${parts.join('\n')}`
}

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
  tailoring?: CoverLetterTailoring
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
)}${tailoringSection(input.tailoring)}`
}
