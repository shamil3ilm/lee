import { parseJd, type JdSection, type ParsedJd } from './jd'
import { canonicalSkill, skillsInText } from './lexicon'
import type { MatchJob } from './types'

/**
 * The skills a posting asks for, by weight, from the parsed JD (./jd.ts):
 *   required  title, structured tech stack, and must-have lines;
 *   mentioned responsibilities and other sections;
 *   nice      nice-to-have lines ("a plus", "preferred", a Bonus section).
 * A skill keeps its strongest weight. Alternatives in one line ("Power BI
 * or Tableau", "AWS/Azure/GCP", "PHP/Laravel or Go") are ONE requirement,
 * met by any member (`anyOf`), unless a member is also asked on its own.
 */

export type ReqWeight = 'required' | 'mentioned' | 'nice'

export const REQ_WEIGHTS: Readonly<Record<ReqWeight, number>> = { required: 2, mentioned: 1, nice: 0.5 }

export interface Requirement {
  /** The skill, or for an any-of group its members joined: "power bi|tableau". */
  canonical: string
  weight: ReqWeight
  /** Alternatives (sorted): any one of them meets the requirement. */
  anyOf?: string[]
}

/** Separators that list things all required; "or" and "/" inside a chunk offer a choice. */
const ALL_OF = /,|;|\band\b|\bplus\b|\+|\bwith\b|\(|\)|:/i
const ONE_OF = /\bor\b|\//i

/** "Strong SQL and Power BI or Tableau" → [["power bi", "tableau"]]. */
export function anyOfGroups(text: string): string[][] {
  const out: string[][] = []
  for (const chunk of text.split(ALL_OF)) {
    if (!ONE_OF.test(chunk)) continue
    const members = [...skillsInText(chunk)].sort()
    if (members.length >= 2) out.push(members)
  }
  return out
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
  // One map in the order things are asked; a group's key is its members joined.
  const found = new Map<string, Requirement>()
  const add = (canonical: string, weight: ReqWeight, anyOf?: string[]): void => {
    const prev = found.get(canonical)
    found.set(canonical, prev ? { ...prev, weight: stronger(prev.weight, weight) } : { canonical, weight, ...(anyOf ? { anyOf } : {}) })
  }
  for (const s of skillsInText(job.title)) add(s, 'required')
  for (const t of job.techStack ?? []) {
    const c = canonicalSkill(t)
    if (c) add(c, 'required')
  }
  for (const l of parsed.lines) {
    const lineGroups = anyOfGroups(l.text).filter((g) => g.every((m) => l.skills.includes(m)))
    const grouped = new Set(lineGroups.flat())
    for (const s of l.skills) {
      const group = lineGroups.find((g) => g.includes(s))
      if (!grouped.has(s)) add(s, BY_SECTION[l.section])
      else if (group && group[0] === s) add(group.join('|'), BY_SECTION[l.section], group)
    }
  }
  // A group with a member also asked on its own adds nothing: that member carries it.
  return [...found.values()].filter((r) => !r.anyOf || !r.anyOf.some((m) => found.has(m)))
}
