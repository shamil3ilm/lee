import { roleFamily } from '@/lib/discovery/relevance/roles'
import { findTerms, normalizeForMatch } from '@/lib/discovery/relevance/text'
import { backedSkillIds, isReady } from '@/lib/resume/readiness'
import type { Highlight, ResumeProfile } from '@/lib/resume/types'
import { recipeSchema, type Recipe, type Region, type RegionField, type RegionFields, type SectionKey } from './types'

/**
 * Starting points. A region preset sets sections, template and region
 * fields; a role preset (from the user's accepted role families) picks and
 * orders master items so the matching ones lead. Both only ever pick
 * INTERVIEW-READY items — anything else is added by hand (domain-ready
 * items in design wording, ai_assisted ones as an explicit override).
 */

export interface RegionPreset {
  sections: SectionKey[]
  template: Recipe['template']
  fields: RegionFields
}

const ALL_OFF: RegionFields = {
  phone: false,
  location: false,
  nationality: false,
  visaStatus: false,
  noticePeriod: false,
  expectedSalary: false,
  photo: false,
  dateOfBirth: false,
  maritalStatus: false,
}

export const REGION_PRESETS: Readonly<Record<Region, RegionPreset>> = {
  // GCC: nationality, visa status, notice period, languages (Arabic level),
  // phone with country code. Photo and date of birth available but off.
  gcc: {
    sections: ['summary', 'work', 'skills', 'projects', 'education', 'languages', 'certificates'],
    template: 'brand',
    fields: { ...ALL_OFF, phone: true, location: true, nationality: true, visaStatus: true, noticePeriod: true },
  },
  // India: no photo; expected CTC optional and off.
  india: {
    sections: ['summary', 'skills', 'work', 'projects', 'education', 'certificates'],
    template: 'ats',
    fields: { ...ALL_OFF, phone: true, location: true },
  },
  // Remote / US / EU: ATS-plain; never photo, date of birth or marital status.
  remote: {
    sections: ['summary', 'work', 'projects', 'skills', 'education', 'certificates'],
    template: 'ats',
    fields: { ...ALL_OFF, phone: true, location: true },
  },
}

/** Fields a region never shows, whatever the toggle says. */
export const LOCKED_OFF: Readonly<Record<Region, readonly RegionField[]>> = {
  gcc: [],
  india: ['photo'],
  remote: ['photo', 'dateOfBirth', 'maritalStatus'],
}

export function fieldOn(recipe: Pick<Recipe, 'region' | 'fields'>, field: RegionField): boolean {
  return recipe.fields[field] && !LOCKED_OFF[recipe.region].includes(field)
}

interface Caps {
  jobs: number
  firstJobBullets: number
  jobBullets: number
  projects: number
  projectBullets: number
  skills: number
}

export const LENGTH_CAPS: Readonly<Record<1 | 2, Caps>> = {
  1: { jobs: 3, firstJobBullets: 4, jobBullets: 3, projects: 2, projectBullets: 2, skills: 12 },
  2: { jobs: 8, firstJobBullets: 6, jobBullets: 5, projects: 4, projectBullets: 3, skills: 24 },
}

/** Relevance of a text to a role family: how many of its title/skill terms it mentions. */
export function familyScorer(familyId: string | null): (text: string) => number {
  const family = familyId ? roleFamily(familyId) : undefined
  if (!family) return () => 0
  const terms = [...family.titles, ...family.skills]
  return (text) => findTerms(normalizeForMatch(text), terms).length
}

/** Stable sort by score, highest first. */
function byScore<T>(list: readonly T[], score: (x: T) => number): T[] {
  return list
    .map((x, i) => ({ x, i, s: score(x) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((e) => e.x)
}

function pickHighlights(list: readonly Highlight[], score: (t: string) => number, cap: number) {
  return byScore(list.filter(isReady), (h) => score(h.text))
    .slice(0, cap)
    .map((h) => ({ id: h.id, wordingId: null }))
}

/** A new recipe from the region + role presets over the current master profile. */
export function buildRecipe(
  profile: ResumeProfile,
  opts: { region: Region; roleFamily: string | null; lengthTarget?: 1 | 2 },
): Recipe {
  const preset = REGION_PRESETS[opts.region]
  const caps = LENGTH_CAPS[opts.lengthTarget ?? 1]
  const score = familyScorer(opts.roleFamily)
  const work = profile.work
    .filter((w) => w.highlights.some(isReady))
    .slice(0, caps.jobs)
    .map((w, i) => ({ id: w.id, highlights: pickHighlights(w.highlights, score, i === 0 ? caps.firstJobBullets : caps.jobBullets) }))
  const projects = byScore(
    profile.projects.filter(isReady),
    (p) => score([p.name, p.description, ...p.keywords, ...p.highlights.map((h) => h.text)].join(' ')),
  )
    .slice(0, caps.projects)
    .map((p) => ({ id: p.id, highlights: pickHighlights(p.highlights, score, caps.projectBullets) }))
  const backed = backedSkillIds(profile)
  const skills = byScore(
    profile.skills.flatMap((g) => g.skills.filter((s) => backed.has(s.id))),
    (s) => score(s.name),
  )
    .slice(0, caps.skills)
    .map((s) => s.id)
  const familyLabel = opts.roleFamily ? roleFamily(opts.roleFamily)?.label : undefined
  return recipeSchema.parse({
    region: opts.region,
    roleFamily: familyLabel ? opts.roleFamily : null,
    headline: profile.basics.label,
    summary: profile.basics.summary,
    sections: preset.sections,
    work,
    projects,
    skills,
    education: profile.education.map((e) => e.id),
    languages: profile.languages.map((l) => l.id),
    certificates: profile.certificates.map((c) => c.id),
    overrides: [],
    lengthTarget: opts.lengthTarget ?? 1,
    template: preset.template,
    fields: preset.fields,
  })
}

/** "GCC · Payments / Fintech Backend Engineer" */
export function defaultVariantName(region: Region, family: string | null): string {
  const regionLabel = { gcc: 'GCC', india: 'India', remote: 'Remote' }[region]
  const familyLabel = family ? roleFamily(family)?.label : undefined
  return familyLabel ? `${regionLabel} · ${familyLabel}` : `${regionLabel} · General`
}
