import { classifyRole } from '../relevance/roles'
import { requirementChecks, responsibilitiesComponent } from './coverage'
import { regionComponent, seniorityComponent, workModeComponent } from './fit'
import { parseJd, type ParsedJd } from './jd'
import { jdFamilies, roleComponent } from './role'
import { domainComponent, languageComponent, payComponent, visaComponent } from './signals'
import { SKILLS_MAX, skillsComponent } from './skills'
import type { MatchCeiling, MatchComponent, MatchDetail, MatchJob, MatchProfile } from './types'
import { MATCH_SCORE_VERSION } from './version'

/**
 * The deterministic Match Score (0–100), computed for EVERY discovery at
 * ingest with no AI call. It is the sum of explainable components, clamped:
 *
 * Everything reads the parsed JD (./jd.ts), not just the title:
 *   skills      0…35  weighted overlap of the JD's skills with READY profile
 *                     skills (must 2 · mentioned 1 · nice-to-have ½;
 *                     synonyms, concepts like "PHP framework", ½ credit for
 *                     close siblings)
 *   responsib.  0…10  JD responsibilities that match your ready work
 *   role        0…10  the JD's role family vs your targets; the title only
 *                     nudges (./role.ts)
 *   seniority   0…15  title level / years asked vs targets and your years
 *   region      0…10  posting place (or remote eligibility) vs your regions
 *   work mode   0…5   remote / hybrid / on-site vs your preference
 *   pay        −5…+5  soft: stated pay vs your floor for that region
 *   language  −25…+3  Arabic (etc.) required vs your level (−25 when mandatory)
 *   visa      −15…+5  GCC sponsorship: offered / nationals only / in-country
 *   domain      0…+10 payments, e-invoicing/ZATCA with ready evidence
 *
 * A strong, fully stated match lands in the 80s–90s. Without a usable JD
 * (email alerts, watch links) the detail is marked confidence "title_only"
 * and capped at 55 until a JD is fetched or pasted. A mandatory language
 * the user does not speak well caps it at 34 (the weak band).
 */

export const CEILINGS = { mandatoryLanguage: 34, titleOnly: 55 } as const

function ceilingOf(jd: ParsedJd, mandatoryUnmet: readonly string[]): MatchCeiling | undefined {
  if (mandatoryUnmet.length > 0) return { score: CEILINGS.mandatoryLanguage, reason: `Language: ${mandatoryUnmet.join(', ')} required` }
  if (jd.confidence === 'title_only') return { score: CEILINGS.titleOnly, reason: 'Low confidence: title only' }
  return undefined
}

export function computeMatch(job: MatchJob, profile: MatchProfile): MatchDetail {
  const jd = parseJd(job)
  const techRole = classifyRole({ title: job.title, description: job.descriptionMd, techStack: job.techStack }).engineering || jdFamilies(job, jd).length > 0
  const skills = skillsComponent(job, profile, { techRole, jd })
  const role = roleComponent(job, profile, jd, skills.component.points / SKILLS_MAX)
  const language = languageComponent(job, profile)
  const components: MatchComponent[] = [
    skills.component,
    responsibilitiesComponent(jd, profile),
    role,
    seniorityComponent(job, profile, jd),
    regionComponent(job, profile),
    workModeComponent(job, profile),
    payComponent(job, profile),
    language.component,
    visaComponent(job, profile),
    domainComponent(job, profile),
  ]
  const total = components.reduce((s, c) => s + c.points, 0)
  const ceiling = ceilingOf(jd, language.mandatoryUnmet)
  return {
    v: MATCH_SCORE_VERSION,
    score: Math.max(0, Math.min(ceiling?.score ?? 100, Math.round(total))),
    confidence: jd.confidence,
    components,
    requirements: requirementChecks(jd, profile),
    missing: [...skills.missing, ...language.missing],
    matched: skills.matched,
    ...(ceiling ? { ceiling } : {}),
  }
}
