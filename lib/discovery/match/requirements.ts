import { parseJd, type JdSection, type ParsedJd } from './jd'
import { canonicalSkill, skillsInText } from './lexicon'
import type { MatchJob } from './types'

/**
 * The skills a posting asks for, by weight, from the parsed JD (./jd.ts):
 *   required  title, structured tech stack, and must-have lines;
 *   mentioned responsibilities and other sections;
 *   nice      nice-to-have lines ("a plus", "preferred", a Bonus section).
 * A skill keeps its strongest weight.
 */

export type ReqWeight = 'required' | 'mentioned' | 'nice'

export const REQ_WEIGHTS: Readonly<Record<ReqWeight, number>> = { required: 2, mentioned: 1, nice: 0.5 }

export interface Requirement {
  canonical: string
  weight: ReqWeight
}

const BY_SECTION: Readonly<Record<JdSection, ReqWeight>> = {
  must: 'required',
  nice: 'nice',
  responsibility: 'mentioned',
  other: 'mentioned',
}

function stronger(a: ReqWeight, b: ReqWeight): ReqWeight {
  return REQ_WEIGHTS[a] >= REQ_WEIGHTS[b] ? a : b
}

export function extractRequirements(job: MatchJob, parsed: ParsedJd = parseJd(job)): Requirement[] {
  const found = new Map<string, ReqWeight>()
  const add = (canonical: string, weight: ReqWeight): void => {
    const prev = found.get(canonical)
    found.set(canonical, prev ? stronger(prev, weight) : weight)
  }
  for (const s of skillsInText(job.title)) add(s, 'required')
  for (const t of job.techStack ?? []) {
    const c = canonicalSkill(t)
    if (c) add(c, 'required')
  }
  for (const l of parsed.lines) for (const s of l.skills) add(s, BY_SECTION[l.section])
  return [...found].map(([canonical, weight]) => ({ canonical, weight }))
}
