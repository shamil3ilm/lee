import { canonicalSkill, skillsInText } from './lexicon'
import type { MatchJob } from './types'

/**
 * What a posting asks for, by weight:
 *   required  title, structured tech stack, and lines under a requirements
 *             heading ("Requirements", "Must have", "What you'll need"),
 *             or anywhere in an unstructured description;
 *   mentioned other sections (about, responsibilities, "our stack");
 *   nice      lines under a "Nice to have" / "Bonus" heading, or any line
 *             saying "a plus", "preferred", "familiarity with"…
 * A skill keeps its strongest weight.
 */

export type ReqWeight = 'required' | 'mentioned' | 'nice'

export const REQ_WEIGHTS: Readonly<Record<ReqWeight, number>> = { required: 2, mentioned: 1, nice: 0.5 }

export interface Requirement {
  canonical: string
  weight: ReqWeight
}

/** Description window read for requirements (same as the relevance gate). */
const WINDOW = 8_000

const HEADING_PREFIX = String.raw`^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*`
const REQUIRED_HEADING = new RegExp(
  HEADING_PREFIX +
    String.raw`(?:requirements?|qualifications?|minimum qualifications|basic qualifications|required skills|skills required|must[- ]haves?|what you(?:'|’)?ll need|what we(?:'|’)?re looking for|what you bring|you have|who you are|about you|your profile|skills(?: (?:and|&) experience)?|experience required|technical skills|المتطلبات|المؤهلات)\b`,
  'iu',
)
const NICE_HEADING = new RegExp(
  HEADING_PREFIX +
    String.raw`(?:nice[- ]to[- ]haves?|good[- ]to[- ]haves?|bonus(?: points)?|preferred(?: qualifications| skills)?|desirable|pluses|extra credit|it(?:'|’)?s a plus)\b`,
  'iu',
)
/** A short line that reads as a heading: markdown "#", bold-only, or "Title:". */
const ANY_HEADING = /^\s*(?:#{1,6}\s+\S.*|(?:\*\*|__)[^*_]{2,60}(?:\*\*|__)\s*:?\s*|[A-Z\p{Lu}][^.!?]{1,50}:\s*)$/u
const NICE_INLINE =
  /\b(?:nice[- ]to[- ]have|good[- ]to[- ]have|bonus|a plus|an advantage|advantageous|preferred|preferably|ideally|familiarity with|exposure to|desirable|optional|would be great|beneficial)\b/i

type Section = 'required' | 'mentioned' | 'nice'

function sectionOf(line: string): Section | null {
  if (NICE_HEADING.test(line)) return 'nice'
  if (REQUIRED_HEADING.test(line)) return 'required'
  if (ANY_HEADING.test(line)) return 'mentioned'
  return null
}

function stronger(a: ReqWeight, b: ReqWeight): ReqWeight {
  return REQ_WEIGHTS[a] >= REQ_WEIGHTS[b] ? a : b
}

/**
 * Lines with their section weight. Without a requirements heading we cannot
 * tell the asks from the story, so everything outside a "nice" section is
 * read as required.
 */
function weightedLines(description: string): Array<{ text: string; weight: ReqWeight }> {
  const lines = description.slice(0, WINDOW).split(/\r?\n/)
  const structured = lines.some((l) => sectionOf(l.trim()) === 'required')
  const other: Section = structured ? 'mentioned' : 'required'
  let current: Section = other
  const out: Array<{ text: string; weight: ReqWeight }> = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const section = sectionOf(line)
    const heading = section === 'mentioned' ? other : section
    if (heading) {
      current = heading
      // "Requirements: PHP, Laravel" carries skills on the heading line too.
      const rest = line.replace(/^[^:]*:/, '')
      if (rest !== line && rest.trim()) out.push({ text: rest, weight: current })
      continue
    }
    // Sentence by sentence: "PHP and MySQL. Kafka preferred." asks for two, prefers one.
    for (const sentence of line.split(/(?<=[.;!?])\s+/)) {
      out.push({ text: sentence, weight: current !== 'nice' && NICE_INLINE.test(sentence) ? 'nice' : current })
    }
  }
  return out
}

export function extractRequirements(job: MatchJob): Requirement[] {
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
  for (const { text, weight } of weightedLines(job.descriptionMd ?? '')) {
    for (const s of skillsInText(text)) add(s, weight)
  }
  return [...found].map(([canonical, weight]) => ({ canonical, weight }))
}
