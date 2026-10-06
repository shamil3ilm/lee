import { canonicalJson } from './canonical'

/**
 * Field-level diff between the repo's profile.json and the file lee would
 * write, grouped by section so the user can pick a side per section (or
 * take one side wholesale). Client-safe.
 */

export const DIFF_SECTIONS = [
  'basics',
  'work',
  'projects',
  'skills',
  'education',
  'languages',
  'certificates',
  'portfolio',
  'other',
] as const
export type DiffSection = (typeof DIFF_SECTIONS)[number]

export const SECTION_LABELS: Readonly<Record<DiffSection, string>> = {
  basics: 'Basics',
  work: 'Work',
  projects: 'Projects',
  skills: 'Skills',
  education: 'Education',
  languages: 'Languages',
  certificates: 'Certificates',
  portfolio: 'Portfolio page (case studies, 60-second view)',
  other: 'Other sections',
}

export type Side = 'lee' | 'repo'
export type Choices = Partial<Record<DiffSection, Side>>

export interface FieldChange {
  path: string
  repo: unknown
  lee: unknown
}

export interface SectionDiff {
  section: DiffSection
  label: string
  changes: FieldChange[]
}

type Doc = Record<string, unknown>
const KNOWN_TOP = new Set(['$schema', 'basics', 'work', 'projects', 'skills', 'education', 'languages', 'certificates', 'meta'])
const MAX_CHANGES = 100

function isObject(v: unknown): v is Doc {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** The value of one section in a profile.json document. */
export function sectionValue(doc: Doc, section: DiffSection): unknown {
  if (section === 'other') {
    return Object.fromEntries(Object.entries(doc).filter(([k]) => !KNOWN_TOP.has(k)))
  }
  if (section === 'portfolio') {
    const meta = isObject(doc.meta) ? doc.meta : {}
    const x = isObject(meta['x-portfolio']) ? meta['x-portfolio'] : {}
    // `order` follows lee's item order and version/lastModified change on
    // every publish: neither is a hand edit worth a decision.
    return {
      canonical: meta.canonical,
      displayName: x.displayName,
      caseStudies: x.caseStudies,
      quickView: x.quickView,
    }
  }
  return doc[section]
}

function walk(path: string, repo: unknown, lee: unknown, out: FieldChange[]): void {
  if (out.length >= MAX_CHANGES) return
  if (canonicalJson(repo) === canonicalJson(lee)) return
  if (Array.isArray(repo) && Array.isArray(lee)) {
    const n = Math.max(repo.length, lee.length)
    for (let i = 0; i < n; i++) walk(`${path}/${i}`, repo[i], lee[i], out)
    return
  }
  if (isObject(repo) && isObject(lee)) {
    const keys = [...new Set([...Object.keys(repo), ...Object.keys(lee)])]
    for (const k of keys) walk(`${path}/${k}`, repo[k], lee[k], out)
    return
  }
  out.push({ path: path || '/', repo, lee })
}

/** Sections that differ, with their changed leaf fields. */
export function diffDocuments(repo: Doc, lee: Doc): SectionDiff[] {
  return DIFF_SECTIONS.flatMap((section) => {
    const changes: FieldChange[] = []
    walk(`/${section}`, sectionValue(repo, section), sectionValue(lee, section), changes)
    return changes.length > 0 ? [{ section, label: SECTION_LABELS[section], changes }] : []
  })
}

export function parseChoices(value: unknown): Choices {
  if (!isObject(value)) return {}
  const out: Choices = {}
  for (const s of DIFF_SECTIONS) {
    const v = value[s]
    if (v === 'lee' || v === 'repo') out[s] = v
  }
  return out
}
