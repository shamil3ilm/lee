import { resolveLocation } from '@/lib/regions/normalize'
import { countryOf } from '@/lib/regions/tree'
import type { PageResult } from '../cursors'
import { companyJson, type CompanyHttpDeps } from '../http'
import { sectorFromName } from '../sectors'
import type { CompanyCandidate } from '../types'
import type { GleifArea } from './register-areas'

/**
 * Legal entities with a Legal Entity Identifier, from the GLEIF API (data
 * CC0 1.0: "The data available through the Access Service are provided
 * under the CC0 licence"; robots.txt `Disallow:` empty). Every entity with
 * an ACTIVE status and a legal address in the area's country — the whole
 * country for Kuwait, Bahrain, Qatar and Oman, a full-text search for a city
 * elsewhere (GLEIF has no city filter) — read a few pages per run with a
 * cursor per area. Names are LEGAL names ("Zain Kuwait K.S.C.P."): the
 * brand fold (lib/company-discovery/normalize.ts) joins them to the brand a
 * company is known by. Funds are dropped (not employers); everything else
 * is kept, whatever its industry, and ranked by the hiring likelihood.
 */

export const GLEIF_API = 'https://api.gleif.org/api/v1/lei-records'
export const GLEIF_PAGE_SIZE = 200
/** Pages per run (GLEIF allows 60 requests a minute; lee reads 3, 1 s apart). */
export const GLEIF_PAGES_PER_RUN = 3

export function gleifUrl(area: Pick<GleifArea, 'country' | 'fulltext'>, page: number, size = GLEIF_PAGE_SIZE): string {
  if (!/^[A-Z]{2}$/.test(area.country)) throw new Error('gleif: bad country')
  const p = new URLSearchParams()
  p.set('filter[entity.legalAddress.country]', area.country)
  p.set('filter[entity.status]', 'ACTIVE')
  if (area.fulltext) p.set('filter[fulltext]', area.fulltext.slice(0, 60))
  p.set('page[size]', String(Math.max(1, Math.min(200, Math.floor(size)))))
  p.set('page[number]', String(Math.max(1, Math.floor(page))))
  return `${GLEIF_API}?${p.toString()}`
}

interface GName {
  name?: unknown
  type?: unknown
}

const LATIN = /^[\x20-\x7eÀ-ɏ]+$/
const str = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

/** The best Latin-script name: a trading name, the legal name, else its preferred transliteration. */
function namesOf(entity: Record<string, unknown>): { name: string; legal: string } | null {
  const legal = str((entity.legalName as GName | undefined)?.name)
  const others = [...((entity.otherNames as GName[] | undefined) ?? []), ...((entity.transliteratedOtherNames as GName[] | undefined) ?? [])]
  const trading = others.find((o) => o.type === 'TRADING_OR_OPERATING_NAME' && LATIN.test(str(o.name)))
  const translit = others.find((o) => /TRANSLITERATED/.test(String(o.type)) && LATIN.test(str(o.name)))
  const name = str(trading?.name) || (LATIN.test(legal) ? legal : '') || str(translit?.name) || str(others.find((o) => LATIN.test(str(o.name)))?.name)
  if (name.length < 2) return null
  return { name: name.slice(0, 200), legal: legal.slice(0, 200) }
}

function regionOf(entity: Record<string, unknown>, area: Pick<GleifArea, 'country' | 'regionId'>): string | null {
  const country = area.country.toLowerCase()
  for (const key of ['headquartersAddress', 'legalAddress'] as const) {
    const a = (entity[key] ?? {}) as Record<string, unknown>
    if (str(a.country) && str(a.country).toUpperCase() !== area.country) continue
    const text = [str(a.city), ...(Array.isArray(a.addressLines) ? (a.addressLines as unknown[]).map(str) : [])].filter(Boolean).join(', ')
    const hit = resolveLocation(text).places.map((p) => p.id).find((id) => countryOf(id) === country)
    if (hit) return hit
  }
  // The full-text search matched the area's name somewhere; the country is certain.
  return countryOf(area.regionId) === country ? area.regionId : null
}

/** GLEIF JSON:API page → candidates and the last page. */
export function parseGleifPage(body: unknown, area: Pick<GleifArea, 'country' | 'regionId'>): PageResult<CompanyCandidate> {
  const b = (body ?? {}) as { data?: unknown; meta?: { pagination?: { lastPage?: unknown } } }
  const lastPage = typeof b.meta?.pagination?.lastPage === 'number' ? Math.max(1, b.meta.pagination.lastPage) : 1
  const items: CompanyCandidate[] = []
  for (const rec of Array.isArray(b.data) ? b.data : []) {
    const attrs = ((rec as { attributes?: unknown }).attributes ?? {}) as Record<string, unknown>
    const entity = (attrs.entity ?? {}) as Record<string, unknown>
    const lei = str(attrs.lei)
    if (!/^[A-Z0-9]{20}$/.test(lei) || str(entity.status) !== 'ACTIVE') continue
    const category = str(entity.category)
    if (category === 'FUND') continue
    const names = namesOf(entity)
    if (!names) continue
    const region = regionOf(entity, area)
    if (!region) continue
    const sector = category === 'RESIDENT_GOVERNMENT_ENTITY' ? 'government' : (sectorFromName(`${names.name} ${names.legal}`) ?? 'other')
    items.push({
      name: names.name,
      regionIds: [region],
      industries: [],
      sourceTags: ['register:gleif'],
      evidence: {
        lei,
        sector,
        listedAt: `https://search.gleif.org/#/record/${lei}`,
        ...(names.legal && names.legal !== names.name ? { listedAs: names.legal } : {}),
        ...(category === 'RESIDENT_GOVERNMENT_ENTITY' ? { government: true } : {}),
      },
    })
  }
  return { items, lastPage }
}

/** One page of an area (1-based, for the cursor). */
export async function fetchGleifPage(area: GleifArea, page: number, deps: CompanyHttpDeps = {}): Promise<PageResult<CompanyCandidate>> {
  const body = await companyJson('gleif', gleifUrl(area, page), { ...deps, timeoutMs: deps.timeoutMs ?? 30_000 }, { accept: 'application/vnd.api+json', maxBytes: 8 * 1024 * 1024 })
  return parseGleifPage(body, area)
}
