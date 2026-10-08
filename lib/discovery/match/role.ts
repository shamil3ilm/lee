import { classifyRole, familiesFromEvidence, roleFamilyLabel, SKILL_GROUPS } from '../relevance/roles'
import { findTerms, normalizeForMatch } from '../relevance/text'
import type { ParsedJd } from './jd'
import type { MatchComponent, MatchJob, MatchProfile } from './types'

/**
 * Role family (0–10). The JD decides; the title only nudges:
 *   title and JD agree on a target family            10
 *   the JD reads as a target family (title odd/new)   8  "from the JD"
 *   general software title, core targets              7
 *   no target roles set (a tech role)                 7
 *   title says a target family, the JD reads another  3  "the JD reads …"
 *   another tech family                               3
 *   not a tech role (title and JD)                    0
 */

export const ROLE_MAX = 10
const CORE_FAMILIES = ['backend', 'fullstack', 'frontend']

/** Families the JD reads as (stack + description), when there is a usable JD. */
export function jdFamilies(job: MatchJob, jd: ParsedJd): string[] {
  if (jd.confidence !== 'full') return []
  // Never the title: the JD has to stand on its own.
  const text = normalizeForMatch([...(job.techStack ?? []), (job.descriptionMd ?? '').slice(0, 4_000)].join(' \n '))
  const families = familiesFromEvidence(text)
  // A platform JD that mentions one backend word ("Go for tooling") reads as DevOps, not backend.
  if (families.includes('devops') && findTerms(text, SKILL_GROUPS.backend).length <= 1) {
    return ['devops', ...families.filter((f) => f !== 'devops' && f !== 'backend' && f !== 'fullstack')]
  }
  return families
}

export function roleComponent(
  job: MatchJob,
  p: Pick<MatchProfile, 'roleFamilies' | 'customRoles'>,
  jd: ParsedJd,
  /** Share of the JD's skills the profile covers (0–1). */
  coverage: number,
): MatchComponent {
  const c = (points: number, label: string): MatchComponent => ({ key: 'role', label, points, max: ROLE_MAX })
  const custom = p.customRoles.find((r) => findTerms(normalizeForMatch(job.title), [r]).length > 0)
  if (custom) return c(ROLE_MAX, `Role: ${custom}`)
  const byTitle = classifyRole({ title: job.title })
  const fromJd = jdFamilies(job, jd)
  const titleTarget = byTitle.families.find((f) => p.roleFamilies.includes(f))
  const jdTarget = fromJd.find((f) => p.roleFamilies.includes(f))
  if (titleTarget) {
    if (fromJd.length > 0 && !jdTarget && coverage < 0.35) {
      return c(3, `Role: title says ${roleFamilyLabel(titleTarget)}, the JD reads ${roleFamilyLabel(fromJd[0]!)}`)
    }
    return c(ROLE_MAX, `Role: ${roleFamilyLabel(titleTarget)}`)
  }
  if (jdTarget && coverage >= 0.5) {
    const odd = byTitle.families.length === 0 && !byTitle.generic
    return c(8, `Role: ${roleFamilyLabel(jdTarget)} (from the JD${odd ? ', new title' : ''})`)
  }
  const tech = byTitle.engineering || fromJd.length > 0
  if (!tech) return c(0, 'Role: not a tech role')
  if (p.roleFamilies.length === 0) return c(7, 'Role: tech role (no target roles set)')
  if (byTitle.families.length === 0 && p.roleFamilies.some((t) => CORE_FAMILIES.includes(t))) {
    return c(7, 'Role: general software engineering')
  }
  const other = byTitle.families[0] ?? fromJd[0]
  return c(3, other ? `Role: ${roleFamilyLabel(other)} (not a target)` : 'Role: not a target role')
}
