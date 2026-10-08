import { niceToHaveFromDescription } from '@/lib/cv-score/jd'
import { detectYearsRequired } from '../relevance/seniority'
import {
  detectLanguages,
  detectNationalsOnly,
  detectPresenceRequired,
  detectShifts,
  detectVisaOffered,
  type LanguageMention,
} from '../relevance/signals'
import { relocationOffered } from '../relevance/remote'
import { findTerms, normalizeForMatch } from '../relevance/text'
import { EINVOICING_TERMS, PAYMENTS_TERMS } from './evidence'
import { skillsInText } from './lexicon'
import type { MatchJob } from './types'

/**
 * The full job description, parsed (deterministic, English plus common GCC
 * wording). The Match Score compares the profile with THIS, not the title:
 *   responsibilities · must-haves vs nice-to-haves (headings, and cues like
 *   "required", "must", "preferred", "bonus", "a plus") · years per line and
 *   overall · tools and stack · domain · education and certifications ·
 *   languages · work authorisation / visa / relocation · shifts.
 * "Nice to have" sections reuse the CV scorer's reader (lib/cv-score/jd).
 */

export type JdSection = 'must' | 'nice' | 'responsibility' | 'other'

export interface JdLine {
  text: string
  section: JdSection
  /** Canonical skills and concepts the line names. */
  skills: string[]
  /** "3+ years of PHP" → 3. */
  years: number | null
}

export interface ParsedJd {
  lines: JdLine[]
  must: JdLine[]
  nice: JdLine[]
  responsibilities: JdLine[]
  /** Every skill the JD names (title and structured stack included). */
  stack: string[]
  /** Smallest overall years ask. */
  years: number | null
  domains: string[]
  education: string[]
  certifications: string[]
  languages: LanguageMention[]
  workAuth: string[]
  shifts: string | null
  /** "title_only": no usable description, so the score rests on the title. */
  confidence: 'full' | 'title_only'
}

const WINDOW = 8_000
/** Below this much description text (and with no requirement lines) the JD is not usable. */
export const MIN_JD_CHARS = 200

const HEADING_PREFIX = String.raw`^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*`
const MUST_HEADING = new RegExp(
  HEADING_PREFIX +
    String.raw`(?:requirements?|qualifications?|minimum qualifications|basic qualifications|required skills|skills required|must[- ]haves?|what you(?:'|’)?ll need|what we(?:'|’)?re looking for|what you bring|you have|who you are|about you|your profile|skills(?: (?:and|&) experience)?|experience required|technical skills|candidate profile|desired candidate profile|المتطلبات|المؤهلات|الشروط)(?![\p{L}\p{N}])`,
  'iu',
)
const NICE_HEADING = new RegExp(
  HEADING_PREFIX +
    String.raw`(?:nice[- ]to[- ]haves?|good[- ]to[- ]haves?|bonus(?: points)?|preferred(?: qualifications| skills)?|desirable|pluses|extra credit|it(?:'|’)?s a plus|added advantage)(?![\p{L}\p{N}])`,
  'iu',
)
const RESPONSIBILITY_HEADING = new RegExp(
  HEADING_PREFIX +
    String.raw`(?:(?:key |main |your )?responsibilities|duties|what you(?:'|’)?ll do|what you will do|the role|your role|role overview|job description|day[- ]to[- ]day|you will|in this role|job purpose|المهام|المسؤوليات|الوصف الوظيفي)(?![\p{L}\p{N}])`,
  'iu',
)
/** A short line that reads as a heading: markdown "#", bold-only, or "Title:". */
const ANY_HEADING = /^\s*(?:#{1,6}\s+\S.*|(?:\*\*|__)[^*_]{2,60}(?:\*\*|__)\s*:?\s*|[A-Z\p{Lu}][^.!?]{1,50}:\s*)$/u
export const NICE_CUE =
  /\b(?:nice[- ]to[- ]have|good[- ]to[- ]have|bonus|a plus|an advantage|added advantage|advantageous|preferred|preferably|ideally|familiarity with|exposure to|desirable|optional|would be great|beneficial)\b/i
const MUST_CUE = /\b(?:required|must|mandatory|essential|minimum|at least|proven|strong (?:experience|knowledge))\b/i

const EDUCATION =
  /\b(?:bachelor(?:'?s)?|master(?:'?s)?|b\.?\s?sc|m\.?\s?sc|b\.?\s?tech|m\.?\s?tech|b\.?e\.?|mca|bca|mba|ph\.?d|degree in [a-z ,&/]{3,40}|computer science degree|graduate degree)\b/gi
const CERTIFICATIONS =
  /\b(?:aws certified[a-z -]{0,30}|azure (?:fundamentals|administrator|developer|solutions architect)|google cloud certified[a-z -]{0,30}|pmp|cbap|ccba|ecba|cissp|cisa|cism|itil|(?:certified )?scrum master|csm|psm|cpa|cfa|acca|oracle certified[a-z -]{0,30}|sap certified[a-z -]{0,30}|zend certified|laravel certified|istqb|power bi (?:certification|certified)|pl-300)\b/gi

function sectionOf(line: string): JdSection | 'heading' | null {
  if (NICE_HEADING.test(line)) return 'nice'
  if (MUST_HEADING.test(line)) return 'must'
  if (RESPONSIBILITY_HEADING.test(line)) return 'responsibility'
  if (ANY_HEADING.test(line)) return 'heading'
  return null
}

const YEARS_IN_LINE = /(\d{1,2})\s*\+?\s*(?:(?:-|to|–)\s*\d{1,2}\s*)?(?:years?|yrs?)/i

function lineYears(text: string): number | null {
  const m = YEARS_IN_LINE.exec(text)
  const n = m ? Number(m[1]) : NaN
  return Number.isFinite(n) && n >= 1 && n <= 20 ? n : null
}

function line(text: string, section: JdSection): JdLine {
  return { text: text.replace(/^\s*(?:[-*•·]|\d{1,2}[.)])\s*/, '').trim(), section, skills: [...skillsInText(text)], years: lineYears(text) }
}

/**
 * Sectioned lines. With no requirements heading every line outside a nice
 * or responsibilities section is read as a must-have (we cannot tell the
 * asks from the story); a "preferred / a plus" cue makes a line nice, a
 * "required / must" cue keeps it a must anywhere.
 */
function sectionLines(description: string): JdLine[] {
  const raw = description.slice(0, WINDOW).split(/\r?\n/)
  const structured = raw.some((l) => sectionOf(l.trim()) === 'must')
  const fallback: JdSection = structured ? 'other' : 'must'
  let current: JdSection = fallback
  const out: JdLine[] = []
  for (const r of raw) {
    const t = r.trim()
    if (!t) continue
    const s = sectionOf(t)
    if (s) {
      current = s === 'heading' ? fallback : s
      const rest = t.replace(/^[^:]*:/, '')
      if (rest !== t && rest.trim()) out.push(line(rest, current))
      continue
    }
    for (const sentence of t.split(/(?<=[.;!?])\s+/)) {
      if (!sentence.trim()) continue
      let section = current
      if (section !== 'nice' && NICE_CUE.test(sentence)) section = 'nice'
      else if ((section === 'other' || section === 'responsibility') && MUST_CUE.test(sentence) && skillsInText(sentence).size > 0) section = 'must'
      out.push(line(sentence, section))
    }
  }
  return out
}

function matches(text: string, re: RegExp): string[] {
  re.lastIndex = 0
  return [...new Set([...text.matchAll(re)].map((m) => m[0].trim().replace(/\s+/g, ' ')))]
}

function workAuthOf(description: string): string[] {
  const out: string[] = []
  if (detectNationalsOnly(description)) out.push('nationals only')
  if (detectVisaOffered(description)) out.push('visa / relocation offered')
  else if (relocationOffered(description)) out.push('relocation offered')
  if (detectPresenceRequired(description)) out.push('must already be in the country')
  return out
}

function minOf(values: ReadonlyArray<number | null>): number | null {
  const ns = values.filter((v): v is number => v !== null)
  return ns.length > 0 ? Math.min(...ns) : null
}

/** Per line, so "Arabic is required" is not undone by a "Preferred" heading below it. */
function languagesOf(title: string, lines: readonly JdLine[]): LanguageMention[] {
  const out = new Map<string, boolean>()
  for (const l of [title, ...lines.map((x) => x.text)]) {
    for (const m of detectLanguages({ title: '', description: l })) out.set(m.language, (out.get(m.language) ?? false) || m.required)
  }
  return [...out].map(([language, required]) => ({ language, required }))
}

export function parseJd(job: MatchJob): ParsedJd {
  const description = (job.descriptionMd ?? '').slice(0, WINDOW)
  const lines = sectionLines(description)
  // The CV scorer's "nice to have" reader catches headings this one misses.
  const niceTexts = new Set(niceToHaveFromDescription(description).map((t) => t.trim()))
  const tagged = lines.map((l) => (l.section !== 'nice' && niceTexts.has(l.text) ? { ...l, section: 'nice' as const } : l))
  const stack = new Set<string>([...skillsInText(job.title), ...(job.techStack ?? []).flatMap((t) => [...skillsInText(t)])])
  for (const l of tagged) for (const s of l.skills) stack.add(s)
  const norm = normalizeForMatch(`${job.title}\n${description}`)
  const plain = description.replace(/[#*_`>\-\s]+/g, ' ').trim()
  const must = tagged.filter((l) => l.section === 'must')
  const confident = plain.length >= MIN_JD_CHARS || must.some((l) => l.skills.length > 0) || (job.techStack ?? []).length > 0
  return {
    lines: tagged,
    must,
    nice: tagged.filter((l) => l.section === 'nice'),
    responsibilities: tagged.filter((l) => l.section === 'responsibility'),
    stack: [...stack],
    // "3+ years of PHP" in a must-have line counts even without the word "experience".
    years: detectYearsRequired(description) ?? minOf(must.map((l) => l.years)),
    domains: [
      ...(findTerms(norm, PAYMENTS_TERMS).length > 0 ? ['payments'] : []),
      ...(findTerms(norm, EINVOICING_TERMS).length > 0 ? ['e-invoicing'] : []),
      ...(findTerms(norm, ['erp', 'odoo', 'netsuite', 'sap', 'oracle ebs', 'dynamics 365']).length > 0 ? ['ERP'] : []),
      ...(findTerms(norm, ['data analysis', 'business intelligence', 'power bi', 'tableau', 'dashboards', 'etl']).length > 0 ? ['data'] : []),
    ],
    education: matches(description, EDUCATION),
    certifications: matches(description, CERTIFICATIONS),
    languages: languagesOf(job.title, tagged),
    workAuth: workAuthOf(description),
    shifts: detectShifts({ title: job.title, description }),
    confidence: confident ? 'full' : 'title_only',
  }
}
