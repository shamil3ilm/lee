import { classifyRole, isNonEngineeringTitle } from '../relevance/roles'
import { requirementChecks, responsibilitiesComponent } from './coverage'
import { seniorityComponent, workModeComponent } from './fit'
import { regionFit } from './region'
import { parseJd, type ParsedJd } from './jd'
import { jdFamilies, OFF_TARGET_ROLE_POINTS, roleComponent, roleOffTargetLabel } from './role'
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
 *   domain      0…+10 payments, e-invoicing/ZATCA with ready evidence, in a
 *                     role you target (another family: at most +2)
 *
 * A strong, fully stated match lands in the 80s–90s. Without a usable JD
 * (email alerts, watch links) the detail is marked confidence "title_only"
 * and capped at 55 until a JD is fetched or pasted. A mandatory language
 * the user does not speak well caps it at 34 (the weak band). A posting the
 * user cannot take (remote only for other countries, on-site elsewhere with
 * no relocation they accept) caps it at 30, whatever the other parts add:
 * "Not eligible: remote only for Indonesia or Vietnam". A non-tech role caps
 * at 25 ("Not a tech role: Category Executive"), a tech role outside your
 * target families at 45; for both the context parts (seniority, region,
 * work mode, visa) count none / half. The lowest ceiling wins, and it also
 * holds the Match / AI blend down (cappedFit, blendedSql).
 */

export const CEILINGS = { notTech: 25, ineligible: 30, mandatoryLanguage: 34, offTarget: 45, titleOnly: 55 } as const

interface CeilingInputs {
  jd: ParsedJd
  title: string
  role: MatchComponent
  mandatoryUnmet: readonly string[]
  ineligible: string | null
}

/** Every ceiling that applies; the lowest wins (its reason is the one shown). */
function ceilingOf(i: CeilingInputs): MatchCeiling | undefined {
  const all: MatchCeiling[] = []
  if (i.role.points === 0) all.push({ score: CEILINGS.notTech, reason: `Not a tech role: ${i.title}` })
  else if (i.role.points <= OFF_TARGET_ROLE_POINTS) {
    all.push({ score: CEILINGS.offTarget, reason: `Role outside your targets: ${roleOffTargetLabel(i.role.label)}` })
  }
  if (i.ineligible) all.push({ score: CEILINGS.ineligible, reason: `Not eligible: ${i.ineligible}` })
  if (i.mandatoryUnmet.length > 0) all.push({ score: CEILINGS.mandatoryLanguage, reason: `Language: ${i.mandatoryUnmet.join(', ')} required` })
  if (i.jd.confidence === 'title_only') all.push({ score: CEILINGS.titleOnly, reason: 'Low confidence: title only' })
  return all.reduce<MatchCeiling | undefined>((low, c) => (!low || c.score < low.score ? c : low), undefined)
}

/** Context parts (where, when, how, visa) that only matter for a role you would do. */
const CONTEXT_KEYS: ReadonlySet<string> = new Set(['seniority', 'region', 'workMode', 'visa'])

/**
 * Role relevance scales the context points: full for a role you target
 * (7+), half for another tech family, none for a non-tech role, so a
 * Category Executive in Dubai cannot collect ~40 points for being in Dubai.
 * Penalties are never scaled.
 */
function scaleContext(c: MatchComponent, role: MatchComponent): MatchComponent {
  if (!CONTEXT_KEYS.has(c.key) || c.points <= 0 || role.points >= 7) return c
  if (role.points === 0) return { ...c, points: 0, label: `${c.label} (not counted: not a tech role)` }
  return { ...c, points: Math.round(c.points / 2), label: `${c.label} (counts half: role outside your targets)` }
}

export function computeMatch(job: MatchJob, profile: MatchProfile): MatchDetail {
  const jd = parseJd(job)
  // A non-engineering title is never "a tech role with no stack named" (no neutral skills points).
  const techRole =
    !isNonEngineeringTitle(job.title) &&
    (classifyRole({ title: job.title, description: job.descriptionMd, techStack: job.techStack }).engineering || jdFamilies(job, jd).length > 0)
  const skills = skillsComponent(job, profile, { techRole, jd })
  const role = roleComponent(job, profile, jd, skills.component.points / SKILLS_MAX)
  const language = languageComponent(job, profile)
  const region = regionFit(job, profile)
  // Off-target roles (another family) never earn the domain or strong-area credit in full.
  const offTarget = role.points <= OFF_TARGET_ROLE_POINTS ? roleOffTargetLabel(role.label) : null
  const raw: MatchComponent[] = [
    skills.component,
    responsibilitiesComponent(jd, profile),
    role,
    seniorityComponent(job, profile, jd, { offTarget: offTarget !== null }),
    region.component,
    workModeComponent(job, profile),
    payComponent(job, profile),
    language.component,
    visaComponent(job, profile),
    domainComponent(job, profile, { offTargetRole: offTarget, notTech: role.points === 0 }),
  ]
  const components = raw.map((c) => scaleContext(c, role))
  const total = components.reduce((s, c) => s + c.points, 0)
  const ceiling = ceilingOf({ jd, title: job.title, role, mandatoryUnmet: language.mandatoryUnmet, ineligible: region.ineligible })
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
