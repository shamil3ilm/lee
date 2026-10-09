import { resolveLocation } from '@/lib/regions/normalize'
import { countryOf } from '@/lib/regions/tree'
import { companyGet, companyJson, type CompanyHttpDeps } from './http'
import { WIKIDATA_INDUSTRIES } from './industry'
import { deepestRegions, domainOf, sizeBandOf, stageOf, websiteOf } from './normalize'
import { seedByName, seedFor } from './seed'
import { QID_TO_REGION } from './targets'
import type { CompanyCandidate } from './types'
import { WDQS_ENDPOINT } from './sources/wikidata'

/**
 * SERVER-ONLY. "Find a company by name" in Discovery › Companies: lee
 * suggests, the user confirms.
 *
 *   1. Wikidata: wbsearchentities for the name (www.wikidata.org, 5 hits),
 *      then one SPARQL query for their website, headquarters, industry,
 *      founding year and employees; hits with no company facts are dropped.
 *   2. Website guesses: the name as a domain (.com, .ai, .io, .co and the
 *      country domains of the places typed), each checked with one GET
 *      through safeFetch (does the host answer?).
 *   3. The seed catalog, when the name is a known employer or its legal name.
 *
 * The user picks one option (and may correct the website); only then is a
 * company stored and queued for enrichment.
 */

export const WIKIDATA_API = 'https://www.wikidata.org/w/api.php'
export const MAX_QUERY = 80
const GUESSES_CHECKED = 4
const QID = /^Q\d{1,12}$/

export interface ResolveOption {
  /** Stable id within one answer. */
  id: string
  name: string
  website: string | null
  description: string | null
  regionIds: string[]
  industries: string[]
  source: 'wikidata' | 'guess' | 'seed'
  wikidataId?: string
  founded?: number
  employees?: number
  /** A guessed website answered (null = not checked). */
  reachable?: boolean | null
}

export interface ResolveDeps extends CompanyHttpDeps {
  now?: Date
}

/** "QBurst, Kochi" → { name: "QBurst", places: ["kochi"] }. */
export function splitQuery(raw: string): { name: string; regionIds: string[] } {
  const q = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY)
  const [head = '', ...rest] = q.split(/\s*[,(—–|]\s*|\s+-\s+|\s+in\s+/i)
  const placeText = rest.join(' ').replace(/[)]/g, '')
  return { name: head.trim(), regionIds: placeText ? deepestRegions(resolveLocation(placeText).places.map((p) => p.id)) : [] }
}

const COUNTRY_TLDS: Readonly<Record<string, readonly string[]>> = {
  ae: ['.ae'],
  sa: ['.sa', '.com.sa'],
  kw: ['.com.kw'],
  qa: ['.qa', '.com.qa'],
  bh: ['.bh'],
  om: ['.om'],
  in: ['.in', '.co.in'],
}

/** Domain guesses from a name: the letters and digits, common TLDs, then the typed places' country TLDs. */
export function domainGuesses(name: string, countries: readonly string[] = []): string[] {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llc|inc|fz-?llc|w\.?l\.?l|technologies|solutions)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 40)
  if (base.length < 2) return []
  const tlds = ['.com', '.ai', '.io', '.co', ...countries.flatMap((c) => COUNTRY_TLDS[c] ?? [])]
  return [...new Set(tlds.map((t) => `${base}${t}`))]
}

interface SearchHit {
  id?: unknown
  label?: unknown
  description?: unknown
}

export function parseSearchHits(body: unknown): Array<{ id: string; label: string; description: string | null }> {
  const hits = ((body as { search?: unknown } | null)?.search ?? []) as SearchHit[]
  return (Array.isArray(hits) ? hits : []).flatMap((h) =>
    typeof h.id === 'string' && QID.test(h.id) && typeof h.label === 'string' ? [{ id: h.id, label: h.label.slice(0, 120), description: typeof h.description === 'string' ? h.description.slice(0, 200) : null }] : [],
  )
}

export function factsQuery(qids: readonly string[]): string {
  const ids = qids.filter((q) => QID.test(q)).map((q) => `wd:${q}`).join(' ')
  return `SELECT ?item ?site ?hq ?country ?ind ?inception ?employees WHERE { VALUES ?item { ${ids} }
  OPTIONAL { ?item wdt:P856 ?site } OPTIONAL { ?item wdt:P159 ?hq } OPTIONAL { ?item wdt:P17 ?country }
  OPTIONAL { ?item wdt:P452 ?ind } OPTIONAL { ?item wdt:P571 ?inception } OPTIONAL { ?item wdt:P1128 ?employees } } LIMIT 300`
}

interface Facts {
  site?: string
  places: Set<string>
  industries: Set<string>
  founded?: number
  employees?: number
}

export function parseFacts(body: unknown): Map<string, Facts> {
  const rows = ((body as { results?: { bindings?: unknown } } | null)?.results?.bindings ?? []) as Array<Record<string, { value?: string } | undefined>>
  const out = new Map<string, Facts>()
  const q = (v: string | undefined): string => (v ?? '').split('/').pop() ?? ''
  for (const r of Array.isArray(rows) ? rows : []) {
    const id = q(r.item?.value)
    if (!QID.test(id)) continue
    const f = out.get(id) ?? { places: new Set<string>(), industries: new Set<string>() }
    const site = r.site?.value
    if (site && !f.site && /^https?:\/\//.test(site)) f.site = site
    for (const p of [q(r.hq?.value), q(r.country?.value)]) {
      const region = QID_TO_REGION.get(p)
      if (region) f.places.add(region)
    }
    const ind = WIKIDATA_INDUSTRIES[q(r.ind?.value)]
    if (ind) f.industries.add(ind)
    const y = Number(/^[+-]?(\d{4})-/.exec(r.inception?.value ?? '')?.[1])
    if (Number.isFinite(y) && y > 1800 && (!f.founded || y < f.founded)) f.founded = y
    const e = Number(r.employees?.value)
    if (Number.isFinite(e) && e > 0) f.employees = Math.max(f.employees ?? 0, Math.round(e))
    out.set(id, f)
  }
  return out
}

async function wikidataOptions(name: string, deps: ResolveDeps): Promise<ResolveOption[]> {
  const url = `${WIKIDATA_API}?action=wbsearchentities&format=json&language=en&uselang=en&type=item&limit=5&search=${encodeURIComponent(name)}`
  const hits = parseSearchHits(await companyJson('wikidata-search', url, deps))
  if (hits.length === 0) return []
  const facts = parseFacts(
    await companyJson('wikidata-facts', `${WDQS_ENDPOINT}?format=json&query=${encodeURIComponent(factsQuery(hits.map((h) => h.id)))}`, { ...deps, timeoutMs: deps.timeoutMs ?? 30_000 }, { accept: 'application/sparql-results+json' }),
  )
  return hits.flatMap((h): ResolveOption[] => {
    const f = facts.get(h.id)
    // A company has a website or an industry; people, places and products are dropped.
    if (!f || (!f.site && f.industries.size === 0)) return []
    return [
      {
        id: `wd:${h.id}`,
        name: h.label,
        website: websiteOf(f.site) ?? null,
        description: h.description,
        regionIds: deepestRegions([...f.places]),
        industries: [...f.industries],
        source: 'wikidata',
        wikidataId: h.id,
        ...(f.founded ? { founded: f.founded } : {}),
        ...(f.employees ? { employees: f.employees } : {}),
      },
    ]
  })
}

async function reachable(domain: string, deps: ResolveDeps): Promise<boolean> {
  try {
    const res = await companyGet('company-guess', `https://${domain}/`, { ...deps, timeoutMs: deps.timeoutMs ?? 8_000 }, { accept: 'text/html', maxBytes: 256 * 1024, maxRedirects: 3 })
    void res.body?.cancel().catch(() => undefined)
    return res.status < 400 || res.status === 403
  } catch {
    return false
  }
}

/** The options for a typed name, best first: seed, Wikidata, then reachable guesses. */
export async function resolveCompanyName(raw: string, deps: ResolveDeps = {}): Promise<ResolveOption[]> {
  const { name, regionIds } = splitQuery(raw)
  if (name.length < 2) return []
  const out: ResolveOption[] = []
  const seed = regionIds.length > 0 ? seedFor(name, regionIds) : seedByName(name)
  if (seed) out.push({ id: `seed:${domainOf(seed.website)}`, name: seed.name, website: seed.website, description: null, regionIds: [...seed.regionIds], industries: [...seed.industries], source: 'seed' })
  try {
    out.push(...(await wikidataOptions(name, deps)))
  } catch {
    // Wikidata unavailable: the guesses below still let the user add it.
  }
  const known = new Set(out.flatMap((o) => (o.website ? [domainOf(o.website)] : [])))
  const countries = [...new Set(regionIds.map((r) => countryOf(r)).filter((c): c is string => !!c))]
  const guesses = domainGuesses(name, countries).filter((d) => !known.has(d))
  for (const [i, d] of guesses.slice(0, GUESSES_CHECKED).entries()) {
    out.push({ id: `guess:${i}`, name, website: `https://${d}`, description: null, regionIds, industries: [], source: 'guess', reachable: await reachable(d, deps) })
  }
  return out.filter((o) => o.source !== 'guess' || o.reachable !== false || out.every((x) => x.source === 'guess'))
}

/** The option the user confirmed → a candidate (website re-validated; the user may have corrected it). */
export function candidateFromChoice(choice: { name: string; website: string | null; regionIds: readonly string[]; industries: readonly string[]; wikidataId?: string; founded?: number; employees?: number }, now: Date = new Date()): CompanyCandidate {
  const sizeBand = sizeBandOf(choice.employees)
  return {
    name: choice.name.replace(/\s+/g, ' ').trim().slice(0, 200),
    website: websiteOf(choice.website) ?? undefined,
    regionIds: deepestRegions(choice.regionIds),
    industries: [...choice.industries],
    sizeBand,
    stage: stageOf({ sizeBand, founded: choice.founded }, now),
    sourceTags: ['search'],
    evidence: {
      ...(choice.wikidataId && QID.test(choice.wikidataId) ? { wikidataId: choice.wikidataId } : {}),
      ...(choice.founded ? { founded: choice.founded } : {}),
      ...(choice.employees ? { employees: choice.employees } : {}),
    },
  }
}
