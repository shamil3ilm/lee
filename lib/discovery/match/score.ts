import { regionComponent, roleComponent, seniorityComponent, workModeComponent } from './fit'
import { domainComponent, languageComponent, payComponent, visaComponent } from './signals'
import { skillsComponent } from './skills'
import type { MatchComponent, MatchDetail, MatchJob, MatchProfile } from './types'
import { MATCH_SCORE_VERSION } from './version'

/**
 * The deterministic Match Score (0–100), computed for EVERY discovery at
 * ingest with no AI call. It is the sum of explainable components, clamped:
 *
 *   skills      0…40  weighted overlap with READY profile skills
 *                     (required 2 · mentioned 1 · nice-to-have ½; synonyms,
 *                     concepts like "PHP framework", ½ credit for siblings)
 *   role        0…15  title's role family vs target roles
 *   seniority   0…15  title level / years asked vs targets and your years
 *   region      0…10  posting place (or remote eligibility) vs your regions
 *   work mode   0…5   remote / hybrid / on-site vs your preference
 *   pay        −5…+5  soft: stated pay vs your floor for that region
 *   language  −10…+3  Arabic (etc.) required vs your level
 *   visa      −15…+5  GCC sponsorship: offered / nationals only / in-country
 *   domain      0…+10 payments, e-invoicing/ZATCA with ready evidence
 *
 * A strong, fully stated match lands in the 80s–90s; an unstated posting
 * with a good title and stack in the 60s–70s.
 */

export function computeMatch(job: MatchJob, profile: MatchProfile): MatchDetail {
  const role = roleComponent(job, profile)
  const skills = skillsComponent(job, profile, { techRole: role.points > 0 })
  const language = languageComponent(job, profile)
  const components: MatchComponent[] = [
    skills.component,
    role,
    seniorityComponent(job, profile),
    regionComponent(job, profile),
    workModeComponent(job, profile),
    payComponent(job, profile),
    language.component,
    visaComponent(job, profile),
    domainComponent(job, profile),
  ]
  const total = components.reduce((s, c) => s + c.points, 0)
  return {
    v: MATCH_SCORE_VERSION,
    score: Math.max(0, Math.min(100, Math.round(total))),
    components,
    missing: [...skills.missing, ...language.missing],
    matched: skills.matched,
  }
}
