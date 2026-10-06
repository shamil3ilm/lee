import schemaJson from './profile.schema.json'
import { validateJsonSchema, type JsonSchema } from './validate'

/**
 * TypeScript port of the portfolio repo's scripts/lib/profile.mjs
 * `checkProfile`: the JSON Schema first, then the cross-reference checks
 * JSON Schema can't express. Same order, same error strings. lee runs it
 * on every Preview and refuses to Publish a file with errors, so the
 * portfolio build never receives a file it would reject.
 */

/** The portfolio's scripts/profile.schema.json, verbatim (parity-tested). */
export const PORTFOLIO_SCHEMA = schemaJson as unknown as JsonSchema

/** The key each section's items are referenced by in meta.x-portfolio.order. */
export const SECTION_KEYS = Object.freeze({
  work: 'name',
  projects: 'name',
  skills: 'name',
  education: 'institution',
} as const)
export type KeyedSection = keyof typeof SECTION_KEYS

export const REQUIRED_NETWORKS = Object.freeze(['GitHub', 'LinkedIn'] as const)

type Item = Record<string, unknown>
type Doc = Record<string, unknown> & {
  basics: { profiles: Array<{ network: string }> }
  work: Array<Item & { name: string; highlights: string[] }>
  meta: { 'x-portfolio': XPortfolio }
}
interface XPortfolio {
  order: Partial<Record<KeyedSection, string[]>>
  caseStudies: Array<{ id: string; work: string; highlight: number }>
}

function section(profile: Doc, name: string): Item[] {
  return profile[name] as Item[]
}

function checkUniqueKeys(profile: Doc, errors: string[]): void {
  for (const [name, keyField] of Object.entries(SECTION_KEYS)) {
    const seen = new Set<unknown>()
    section(profile, name).forEach((item, i) => {
      const key = item[keyField]
      if (seen.has(key)) {
        errors.push(`/${name}/${i}/${keyField}: "${String(key)}" is used twice; ${keyField} must be unique in ${name}`)
      }
      seen.add(key)
    })
  }
}

function checkOrder(profile: Doc, order: XPortfolio['order'], errors: string[]): void {
  for (const [name, keys] of Object.entries(order)) {
    const keyField = SECTION_KEYS[name as KeyedSection]
    const known = new Set(section(profile, name).map((item) => item[keyField]))
    ;(keys ?? []).forEach((key, i) => {
      if (!known.has(key)) errors.push(`/meta/x-portfolio/order/${name}/${i}: "${key}" matches no item in ${name}`)
    })
  }
}

function checkCaseStudies(profile: Doc, caseStudies: XPortfolio['caseStudies'], errors: string[]): void {
  const ids = new Set<string>()
  caseStudies.forEach((study, i) => {
    const path = `/meta/x-portfolio/caseStudies/${i}`
    if (ids.has(study.id)) errors.push(`${path}/id: "${study.id}" is used twice`)
    ids.add(study.id)
    const job = profile.work.find((w) => w.name === study.work)
    if (!job) errors.push(`${path}/work: "${study.work}" matches no work item`)
    else if (study.highlight >= job.highlights.length) {
      errors.push(
        `${path}/highlight: ${study.highlight} is out of range (${study.work} has ${job.highlights.length} highlights)`,
      )
    }
  })
}

function checkDates(profile: Doc, errors: string[]): void {
  for (const name of ['work', 'projects', 'education']) {
    section(profile, name).forEach((item, i) => {
      const start = item.startDate as string | undefined
      const end = item.endDate as string | undefined
      if (!start || !end) return
      const n = Math.min(start.length, end.length)
      if (end.slice(0, n) < start.slice(0, n)) {
        errors.push(`/${name}/${i}/endDate: ${end} is before startDate ${start}`)
      }
    })
  }
}

function checkProfiles(profile: Doc, errors: string[]): void {
  const networks = profile.basics.profiles.map((p) => p.network.toLowerCase())
  for (const required of REQUIRED_NETWORKS) {
    if (!networks.includes(required.toLowerCase())) {
      errors.push(`/basics/profiles: a "${required}" profile is required (used in the footer)`)
    }
  }
  if (new Set(networks).size !== networks.length) errors.push('/basics/profiles: each network may appear only once')
}

/** Full validation: JSON Schema first, then cross-reference checks. */
export function checkPortfolioProfile(profile: unknown, schema: JsonSchema = PORTFOLIO_SCHEMA): string[] {
  const errors = validateJsonSchema(profile, schema)
  if (errors.length) return errors // later checks assume the shape is right
  const doc = profile as Doc
  const x = doc.meta['x-portfolio']
  checkUniqueKeys(doc, errors)
  checkOrder(doc, x.order, errors)
  checkCaseStudies(doc, x.caseStudies, errors)
  checkDates(doc, errors)
  checkProfiles(doc, errors)
  return errors
}
