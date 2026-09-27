import { requestJson } from '../http'
import { companyQueryName, onCompanyDomain } from '../match'
import type { CompanyFacts } from '../types'
import type { CompanyRef, SourceDeps, SourceResult } from './types'

/**
 * Company facts from Wikidata (free, no key; Wikimedia's User-Agent policy
 * is met by the shared client). Up to three small requests: search, entity
 * claims, then labels for the HQ / industry items. A candidate is accepted
 * when its official website (P856) is on the company's domain, or — with no
 * domain match — when its label equals the name and it is described as a
 * business. Otherwise the answer is "no confident match" (facts: null).
 */

export const WIKIDATA_API = 'https://www.wikidata.org/w/api.php'
const BUSINESS_RE =
  /\b(company|corporation|business|enterprise|firm|bank|startup|manufacturer|provider|developer|conglomerate|retailer|airline|group|consultancy|agency|platform|publisher|operator|holding)\b/i

interface SearchHit {
  id?: string
  label?: string
  description?: string
}

interface Snak {
  datavalue?: { value?: unknown }
}
interface Claim {
  rank?: string
  mainsnak?: Snak
}
interface Entity {
  id?: string
  labels?: { en?: { value?: string } }
  descriptions?: { en?: { value?: string } }
  claims?: Record<string, Claim[]>
  sitelinks?: { enwiki?: { title?: string } }
}

function api(params: Record<string, string>): string {
  const q = new URLSearchParams({ format: 'json', maxlag: '5', ...params })
  return `${WIKIDATA_API}?${q.toString()}`
}

function claimValues(entity: Entity, prop: string): unknown[] {
  const claims = (entity.claims?.[prop] ?? []).filter((c) => c.rank !== 'deprecated')
  const preferred = claims.filter((c) => c.rank === 'preferred')
  return (preferred.length > 0 ? preferred : claims)
    .map((c) => c.mainsnak?.datavalue?.value)
    .filter((v) => v !== undefined)
}

function firstString(entity: Entity, prop: string): string | null {
  const v = claimValues(entity, prop).find((x) => typeof x === 'string')
  return typeof v === 'string' ? v : null
}

function firstItemId(entity: Entity, prop: string): string | null {
  const v = claimValues(entity, prop)[0] as { id?: unknown } | undefined
  return typeof v?.id === 'string' ? v.id : null
}

/** "+1998-09-04T00:00:00Z" → "1998-09-04" (or "1998" at year precision). */
function firstTime(entity: Entity, prop: string): string | null {
  const v = claimValues(entity, prop)[0] as { time?: unknown; precision?: unknown } | undefined
  const m = typeof v?.time === 'string' ? /^[+-]?(\d{4})-(\d{2})-(\d{2})/.exec(v.time) : null
  if (!m) return null
  return typeof v?.precision === 'number' && v.precision >= 11 ? `${m[1]}-${m[2]}-${m[3]}` : (m[1] as string)
}

function maxQuantity(entity: Entity, prop: string): number | null {
  const nums = claimValues(entity, prop)
    .map((v) => Number((v as { amount?: unknown })?.amount))
    .filter((n) => Number.isFinite(n))
  return nums.length > 0 ? nums[0] ?? null : null
}

export function pickEntity(entities: readonly Entity[], company: CompanyRef): Entity | null {
  const byDomain = entities.find((e) => {
    const site = firstString(e, 'P856')
    return site !== null && onCompanyDomain(site, company.domain)
  })
  if (byDomain) return byDomain
  const name = companyQueryName(company.name)
  return (
    entities.find(
      (e) =>
        companyQueryName(e.labels?.en?.value ?? '') === name && BUSINESS_RE.test(e.descriptions?.en?.value ?? ''),
    ) ?? null
  )
}

export function toFacts(entity: Entity, labels: Readonly<Record<string, string>>): CompanyFacts {
  const hq = firstItemId(entity, 'P159')
  const industry = firstItemId(entity, 'P452')
  const title = entity.sitelinks?.enwiki?.title
  return {
    wikidataId: entity.id ?? '',
    label: entity.labels?.en?.value ?? '',
    description: entity.descriptions?.en?.value ?? null,
    founded: firstTime(entity, 'P571'),
    headquarters: hq ? (labels[hq] ?? null) : null,
    industry: industry ? (labels[industry] ?? null) : null,
    employees: maxQuantity(entity, 'P1128'),
    website: firstString(entity, 'P856'),
    wikipediaUrl: title ? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}` : null,
  }
}

function entitiesOf(body: unknown): Record<string, Entity> {
  const e = (body as { entities?: unknown } | null)?.entities
  return e && typeof e === 'object' ? (e as Record<string, Entity>) : {}
}

export async function fetchWikidataFacts(company: CompanyRef, deps: SourceDeps = {}): Promise<SourceResult> {
  const search = await requestJson(
    'wikidata',
    api({ action: 'wbsearchentities', search: company.name, language: 'en', type: 'item', limit: '5' }),
    deps,
  )
  const hits = ((search as { search?: unknown } | null)?.search ?? []) as SearchHit[]
  const ids = (Array.isArray(hits) ? hits : []).map((h) => h.id).filter((id): id is string => !!id)
  if (ids.length === 0) return { signals: [], facts: null }
  const full = entitiesOf(
    await requestJson(
      'wikidata',
      api({ action: 'wbgetentities', ids: ids.join('|'), props: 'labels|descriptions|claims|sitelinks', languages: 'en', sitefilter: 'enwiki' }),
      deps,
    ),
  )
  const entity = pickEntity(ids.map((id) => full[id]).filter((e): e is Entity => !!e), company)
  if (!entity) return { signals: [], facts: null }
  const refIds = [firstItemId(entity, 'P159'), firstItemId(entity, 'P452')].filter((x): x is string => !!x)
  const refs =
    refIds.length > 0
      ? entitiesOf(
          await requestJson(
            'wikidata',
            api({ action: 'wbgetentities', ids: refIds.join('|'), props: 'labels', languages: 'en' }),
            deps,
          ),
        )
      : {}
  const labels = Object.fromEntries(
    refIds.flatMap((id) => {
      const label = refs[id]?.labels?.en?.value
      return label ? [[id, label] as const] : []
    }),
  )
  return { signals: [], facts: toFacts(entity, labels) }
}
