import { resolveLocation } from '@/lib/regions/normalize'
import { countryOf } from '@/lib/regions/tree'
import { companyJson, type CompanyHttpDeps } from '../http'
import { isObviousNonEmployer } from '../hire-likelihood'
import { nameKey } from '../normalize'
import { sectorFromName, type Sector } from '../sectors'
import type { CompanyCandidate } from '../types'
import type { Industry } from '../industry'
import type { Bbox, OsmArea } from './register-areas'

/**
 * Employers on OpenStreetMap, through the public Overpass API (data ©
 * OpenStreetMap contributors, ODbL 1.0; lee shows the attribution in the
 * Companies tab and on the privacy page). One query per area: every named
 * office of any kind (IT, company, financial, insurance, government,
 * consulting, engineering, research, logistics…) plus the large employers
 * that are not offices (hospitals, universities and colleges, banks, malls
 * and department stores, works and factories), nodes, ways and relations,
 * with their tags and a centre point only. Non-tech employers are kept on
 * purpose: banks, airlines and hospitals hire software and data people too.
 *
 * Usage policy (wiki.openstreetmap.org/wiki/Overpass_API; overpass-doc
 * "commons"): the public instance, `[timeout:60]`, an honest User-Agent,
 * one query per user run and at most one every OSM_MIN_DAYS days, a result
 * cap (`out … 1500`), so a full pass over a user's areas takes weeks.
 */

export const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter'
export const OVERPASS_MAX_ELEMENTS = 1500
export const OVERPASS_TIMEOUT_S = 60
export { OSM_ATTRIBUTION } from './osm-attribution'

const LARGE_AMENITY = 'hospital|university|college|bank'
const LARGE_SHOP = 'mall|department_store'

function bboxText(b: Bbox): string {
  const [s, w, n, e] = b.map((x) => {
    if (!Number.isFinite(x) || Math.abs(x) > 180) throw new Error('overpass: bad bbox')
    return Number(x.toFixed(4))
  })
  if (!(s! < n! && w! < e!)) throw new Error('overpass: bad bbox')
  return `${s},${w},${n},${e}`
}

/** The Overpass QL for one area (numbers only: never user text). */
export function buildOverpassQuery(bbox: Bbox, limit = OVERPASS_MAX_ELEMENTS): string {
  const n = Math.max(1, Math.min(5000, Math.floor(limit)))
  return `[out:json][timeout:${OVERPASS_TIMEOUT_S}][bbox:${bboxText(bbox)}];
(
  nwr["office"]["name"];
  nwr["amenity"~"^(${LARGE_AMENITY})$"]["name"];
  nwr["shop"~"^(${LARGE_SHOP})$"]["name"];
  nwr["man_made"="works"]["name"];
  nwr["industrial"]["name"];
);
out tags center ${n};`
}

interface OsmElement {
  type?: unknown
  id?: unknown
  tags?: unknown
}

/** office=… → sector; the rest by amenity / shop, else the name. */
const OFFICE_SECTOR: Readonly<Record<string, Sector>> = {
  it: 'it',
  software: 'software',
  telecommunication: 'telecom',
  financial: 'finance',
  financial_advisor: 'finance',
  insurance: 'insurance',
  accountant: 'consulting',
  consulting: 'consulting',
  tax_advisor: 'consulting',
  lawyer: 'consulting',
  engineer: 'engineering',
  engineering: 'engineering',
  architect: 'engineering',
  research: 'research',
  government: 'government',
  logistics: 'logistics',
  airline: 'airline',
  estate_agent: 'real_estate',
  property_management: 'real_estate',
  educational_institution: 'education',
  advertising_agency: 'media',
  newspaper: 'media',
  energy_supplier: 'energy',
  petroleum: 'energy',
  coworking: 'other',
}

const OFFICE_INDUSTRY: Readonly<Record<string, Industry>> = {
  it: 'it_services',
  software: 'software',
  telecommunication: 'telecom',
}

function sectorOf(tags: Readonly<Record<string, string>>, name: string): Sector {
  const office = tags.office
  if (office && OFFICE_SECTOR[office]) return OFFICE_SECTOR[office]!
  if (tags.amenity === 'hospital') return 'healthcare'
  if (tags.amenity === 'university' || tags.amenity === 'college') return 'university'
  if (tags.amenity === 'bank') return 'bank'
  if (tags.shop) return 'retail'
  if (tags.man_made === 'works' || tags.industrial) return 'manufacturing'
  return sectorFromName(name) ?? 'other'
}

function listingTag(tags: Readonly<Record<string, string>>): string {
  for (const k of ['office', 'amenity', 'shop', 'man_made', 'industrial'] as const) if (tags[k]) return `${k}=${tags[k]}`.slice(0, 60)
  return 'office'
}

function stringTags(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === 'string') out[k] = v.slice(0, 300)
  return out
}

/** The region a listing's own address names, inside the area's country; else the area's region. */
function regionOf(tags: Readonly<Record<string, string>>, area: Pick<OsmArea, 'regionId'>): string {
  const text = [tags['addr:suburb'], tags['addr:city'], tags['is_in:city']].filter(Boolean).join(', ')
  const country = countryOf(area.regionId)
  if (text && country) {
    const hit = resolveLocation(text).places.map((p) => p.id).find((id) => countryOf(id) === country)
    if (hit) return hit
  }
  return area.regionId
}

/**
 * Overpass JSON → candidates. Obvious non-employers (ATMs, restaurants,
 * single shops, homes, unnamed) are dropped; elements with the same name
 * in the area become ONE company with a branch count (a bank's branches).
 */
export function parseOverpass(body: unknown, area: Pick<OsmArea, 'regionId'>): CompanyCandidate[] {
  const remark = (body as { remark?: unknown } | null)?.remark
  if (typeof remark === 'string' && /runtime error|timed out|out of memory/i.test(remark)) throw new Error(`overpass: ${remark.slice(0, 120)}`)
  const elements = (body as { elements?: unknown } | null)?.elements
  if (!Array.isArray(elements)) return []
  const byName = new Map<string, CompanyCandidate & { count: number }>()
  for (const raw of elements as OsmElement[]) {
    const type = typeof raw.type === 'string' && /^(node|way|relation)$/.test(raw.type) ? raw.type : null
    const id = typeof raw.id === 'number' && Number.isSafeInteger(raw.id) ? raw.id : null
    const tags = stringTags(raw.tags)
    if (!type || id === null || isObviousNonEmployer(tags)) continue
    const name = (tags['name:en'] || tags.name || '').replace(/\s+/g, ' ').trim().slice(0, 200)
    const key = nameKey(name)
    if (name.length < 2 || !key) continue
    const website = [tags.website, tags['contact:website'], tags.url].find((u) => typeof u === 'string' && /^https?:\/\//i.test(u.trim()))?.trim()
    const prev = byName.get(key)
    if (prev) {
      prev.count += 1
      prev.website ??= website
      continue
    }
    const sector = sectorOf(tags, name)
    const industry = tags.office ? OFFICE_INDUSTRY[tags.office] : tags.amenity === 'bank' ? 'banking' : undefined
    byName.set(key, {
      name,
      website,
      regionIds: [regionOf(tags, area)],
      industries: industry ? [industry] : [],
      sourceTags: ['map:osm'],
      evidence: {
        sector,
        osm: { id: `${type}/${id}`, tag: listingTag(tags) },
        listedAt: `https://www.openstreetmap.org/${type}/${id}`,
        ...(tags.office === 'government' ? { government: true } : {}),
      },
      count: 1,
    })
  }
  return [...byName.values()].map(({ count, ...c }) => (count > 1 ? { ...c, evidence: { ...c.evidence, branches: count } } : c))
}

/** One Overpass query for an area. */
export async function fetchOsmArea(area: OsmArea, deps: CompanyHttpDeps = {}): Promise<CompanyCandidate[]> {
  const url = `${OVERPASS_ENDPOINT}?data=${encodeURIComponent(buildOverpassQuery(area.bbox))}`
  const body = await companyJson('overpass', url, { ...deps, timeoutMs: deps.timeoutMs ?? (OVERPASS_TIMEOUT_S + 15) * 1000 }, { maxBytes: 8 * 1024 * 1024 })
  return parseOverpass(body, area)
}
