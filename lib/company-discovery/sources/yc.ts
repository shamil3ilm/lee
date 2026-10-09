import { resolveLocation } from '@/lib/regions/normalize'
import { isWithin } from '@/lib/regions/tree'
import { companyJson, type CompanyHttpDeps } from '../http'
import { industriesFromYc } from '../industry'
import { sizeBandOf } from '../normalize'
import type { CompanyCandidate } from '../types'

/**
 * Y Combinator companies from the open yc-oss dataset
 * (github.com/yc-oss/api, served by GitHub Pages; a daily copy of YC's
 * public directory). One file of every launched company (~10 MB); lee keeps
 * the active ones located in the GCC or India. The repository has NO licence
 * and YC's own terms forbid scraping ycombinator.com, so lee never fetches
 * ycombinator.com and keeps only facts: name, website, location, team size,
 * industry tags and a link to the YC profile (no descriptions or logos).
 */

export const YC_ALL_URL = 'https://yc-oss.github.io/api/companies/all.json'
export const YC_MAX_BYTES = 16 * 1024 * 1024

interface YcCompany {
  id?: unknown
  name?: unknown
  slug?: unknown
  website?: unknown
  all_locations?: unknown
  one_liner?: unknown
  team_size?: unknown
  industry?: unknown
  subindustry?: unknown
  industries?: unknown
  tags?: unknown
  regions?: unknown
  status?: unknown
  stage?: unknown
  batch?: unknown
  isHiring?: unknown
  small_logo_thumb_url?: unknown
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** Which regions count: the GCC and India (the user's own selection narrows later in the fit). */
const SCOPE = ['gcc', 'in'] as const

/** all.json → candidates located in the GCC or India, active only. */
export function parseYcCompanies(body: unknown, scope: readonly string[] = SCOPE): CompanyCandidate[] {
  const list = (Array.isArray(body) ? body : []) as YcCompany[]
  const out: CompanyCandidate[] = []
  for (const c of list) {
    const name = str(c.name)
    const status = str(c.status)
    if (!name || (status && status !== 'Active')) continue
    const where = [str(c.all_locations), ...strs(c.regions).filter((r) => !/remote|america|europe|asia|africa|middle east/i.test(r))].join('; ')
    const ids = resolveLocation(where, { trustCodes: false }).places.map((p) => p.id)
    const inScope = ids.filter((id) => scope.some((s) => isWithin(id, s)))
    if (inScope.length === 0) continue
    const teamSize = typeof c.team_size === 'number' ? c.team_size : undefined
    const slug = str(c.slug)
    out.push({
      name,
      website: str(c.website) || undefined,
      regionIds: inScope,
      industries: industriesFromYc([str(c.industry), str(c.subindustry), ...strs(c.industries), ...strs(c.tags), str(c.one_liner)]),
      sizeBand: sizeBandOf(teamSize),
      stage: /growth|late/i.test(str(c.stage)) ? 'scaleup' : 'startup',
      sourceTags: ['yc'],
      evidence: {
        ...(teamSize ? { employees: teamSize } : {}),
        ...(str(c.batch) ? { ycBatch: str(c.batch) } : {}),
        ...(/^[a-z0-9-]{1,100}$/.test(slug) ? { listedAt: `https://www.ycombinator.com/companies/${slug}` } : {}),
      },
    })
  }
  return out
}

export async function fetchYcCompanies(deps: CompanyHttpDeps = {}): Promise<CompanyCandidate[]> {
  const body = await companyJson('yc-oss', YC_ALL_URL, { ...deps, timeoutMs: deps.timeoutMs ?? 30_000 }, { maxBytes: YC_MAX_BYTES })
  return parseYcCompanies(body)
}
