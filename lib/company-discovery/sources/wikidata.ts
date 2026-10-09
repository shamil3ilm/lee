import { companyJson, type CompanyHttpDeps } from '../http'
import { WIKIDATA_INDUSTRIES } from '../industry'
import { sizeBandOf, stageOf } from '../normalize'
import { QID_TO_REGION, type TargetPlace } from '../targets'
import type { CompanyCandidate } from '../types'
import type { Industry } from '../industry'

/**
 * Companies from the Wikidata Query Service (SPARQL; data CC0). One query
 * per country group: companies whose headquarters (P159) is a target place
 * or lies directly in one, or — for a country node — whose country (P17) is
 * it, with an industry (P452) in our vocabulary, not dissolved (P576).
 * Returns the website (P856), inception (P571), employees (P1128) and logo
 * (P154). WDQS policy: an honest User-Agent, one query at a time, 60 s max
 * per query — lee sends one query per country, a LIMIT on each.
 */

export const WDQS_ENDPOINT = 'https://query.wikidata.org/sparql'
export const WIKIDATA_ROW_LIMIT = 400

const QID = /^Q\d{1,12}$/

/** The SPARQL for these places (QIDs validated: never user text). */
export function buildCompanyQuery(places: readonly TargetPlace[], limit = WIKIDATA_ROW_LIMIT): string {
  const qids = [...new Set(places.flatMap((p) => p.wikidata))].filter((q) => QID.test(q))
  const countryQids = places.filter((p) => p.country).flatMap((p) => p.wikidata).filter((q) => QID.test(q))
  const industries = Object.keys(WIKIDATA_INDUSTRIES).filter((q) => QID.test(q))
  const values = (xs: readonly string[]) => xs.map((q) => `wd:${q}`).join(' ')
  const countryBranch =
    countryQids.length > 0 ? `UNION { VALUES ?country { ${values(countryQids)} } ?item wdt:P17 ?country . BIND(?country AS ?place) }` : ''
  return `SELECT ?item ?itemLabel ?itemDescription ?site ?inception ?employees ?logo ?place ?ind WHERE {
  VALUES ?ind { ${values(industries)} }
  { VALUES ?place { ${values(qids)} } ?item wdt:P159 ?place . }
  UNION { VALUES ?place { ${values(qids)} } ?item wdt:P159 ?hq . ?hq wdt:P131 ?place . }
  ${countryBranch}
  ?item wdt:P452 ?ind .
  FILTER NOT EXISTS { ?item wdt:P576 ?dissolved }
  OPTIONAL { ?item wdt:P856 ?site }
  OPTIONAL { ?item wdt:P571 ?inception }
  OPTIONAL { ?item wdt:P1128 ?employees }
  OPTIONAL { ?item wdt:P154 ?logo }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT ${Math.max(1, Math.min(1000, Math.floor(limit)))}`
}

interface Binding {
  [k: string]: { value?: string } | undefined
}

const ENTITY = 'http://www.wikidata.org/entity/'

function qidOf(v: string | undefined): string | null {
  if (!v?.startsWith(ENTITY)) return null
  const id = v.slice(ENTITY.length)
  return QID.test(id) ? id : null
}

function yearOf(v: string | undefined): number | undefined {
  const m = /^[+-]?(\d{4})-/.exec(v ?? '')
  const y = m ? Number(m[1]) : NaN
  return Number.isFinite(y) && y > 1800 && y < 2100 ? y : undefined
}

/** Commons "Special:FilePath" logos over https, small thumbnail. */
function logoOf(v: string | undefined): string | undefined {
  if (!v) return undefined
  const https = v.replace(/^http:\/\//, 'https://')
  return https.startsWith('https://commons.wikimedia.org/wiki/Special:FilePath/') ? `${https}?width=64` : undefined
}

/**
 * SPARQL JSON → candidates, one per item (rows repeat per place, industry
 * and website). The deepest matched place wins as the region; the label must
 * not be the bare QID (no English label).
 */
export function parseWikidataCompanies(body: unknown, now: Date = new Date()): CompanyCandidate[] {
  const rows = ((body as { results?: { bindings?: unknown } } | null)?.results?.bindings ?? []) as Binding[]
  if (!Array.isArray(rows)) return []
  const byItem = new Map<string, CompanyCandidate & { places: Set<string> }>()
  for (const r of rows) {
    const id = qidOf(r.item?.value)
    const name = r.itemLabel?.value?.trim()
    if (!id || !name || QID.test(name)) continue
    const region = QID_TO_REGION.get(qidOf(r.place?.value) ?? '')
    const industry: Industry | undefined = WIKIDATA_INDUSTRIES[qidOf(r.ind?.value) ?? '']
    const employees = Number(r.employees?.value)
    const prev = byItem.get(id)
    const c = prev ?? {
      name,
      regionIds: [],
      industries: [],
      sourceTags: ['wikidata'],
      evidence: { wikidataId: id },
      places: new Set<string>(),
    }
    if (region) c.places.add(region)
    if (industry && !c.industries.includes(industry)) c.industries.push(industry)
    const site = r.site?.value
    if (site && !c.website && /^https?:\/\//.test(site)) c.website = site
    const founded = yearOf(r.inception?.value)
    if (founded && (!c.evidence.founded || founded < c.evidence.founded)) c.evidence.founded = founded
    if (Number.isFinite(employees) && employees > 0) c.evidence.employees = Math.max(c.evidence.employees ?? 0, Math.round(employees))
    c.evidence.logoUrl ??= logoOf(r.logo?.value)
    const desc = r.itemDescription?.value?.trim()
    if (desc && !c.evidence.description) c.evidence.description = desc.slice(0, 200)
    byItem.set(id, c)
  }
  return [...byItem.values()].map(({ places, ...c }) => {
    const sizeBand = sizeBandOf(c.evidence.employees)
    const evidence = Object.fromEntries(Object.entries(c.evidence).filter(([, v]) => v !== undefined))
    return {
      ...c,
      evidence,
      regionIds: [...places],
      sizeBand,
      stage: stageOf({ sizeBand, founded: c.evidence.founded }, now),
    }
  })
}

/** Run the query for one place group. */
export async function fetchWikidataCompanies(places: readonly TargetPlace[], deps: CompanyHttpDeps = {}, limit = WIKIDATA_ROW_LIMIT): Promise<CompanyCandidate[]> {
  if (places.every((p) => p.wikidata.length === 0)) return []
  const url = `${WDQS_ENDPOINT}?format=json&query=${encodeURIComponent(buildCompanyQuery(places, limit))}`
  const body = await companyJson('wikidata-sparql', url, { ...deps, timeoutMs: deps.timeoutMs ?? 60_000 }, { accept: 'application/sparql-results+json', maxBytes: 4 * 1024 * 1024 })
  return parseWikidataCompanies(body)
}
