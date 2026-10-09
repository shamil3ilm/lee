import * as companiesQ from '@/lib/db/queries/localCompanies'
import { brandKey, countryKey, legalPrefixTarget } from './normalize'

/**
 * Fold duplicate company rows that runs created at different times: a
 * park lists "QBurst Technologies (P) Ltd" (no website) one week and
 * another park lists "QBurst" with qburst.com the next, or a Technopark
 * profile page later gives a name-only row the same website as a row lee
 * already has. The keeper is the row keyed by the website's domain; the
 * duplicate's sources, places and facts are merged into it, then the
 * duplicate is deleted. Rows the user acted on (saved, watched, tracked,
 * dismissed) are never deleted.
 */

const uniq = <T,>(xs: readonly T[]): T[] => [...new Set(xs)].sort() as T[]

function untouched(r: companiesQ.FoldRow): boolean {
  return r.status === 'new' && !r.watch && !r.applicationId
}

export interface FoldPair {
  keeper: companiesQ.FoldRow
  dup: companiesQ.FoldRow
}

/** Pure: the (keeper, duplicate) pairs in a source's rows. */
export function findDuplicates(rows: readonly companiesQ.FoldRow[]): FoldPair[] {
  const pairs: FoldPair[] = []
  const byDomain = new Map<string, companiesQ.FoldRow[]>()
  for (const r of rows) if (r.domain) byDomain.set(r.domain, [...(byDomain.get(r.domain) ?? []), r])
  const taken = new Set<string>()
  for (const [domain, group] of byDomain) {
    if (group.length < 2) continue
    const keeper = group.find((r) => r.sourceCompanyId === `d:${domain}`) ?? group.find((r) => !untouched(r)) ?? group[0]!
    for (const dup of group) {
      if (dup.id === keeper.id || !untouched(dup)) continue
      pairs.push({ keeper, dup })
      taken.add(dup.id)
    }
  }
  const brands = new Map<string, companiesQ.FoldRow[]>()
  for (const r of rows) {
    if (!r.domain || taken.has(r.id)) continue
    const k = `${brandKey(r.name)}:${countryKey(r.regionIds)}`
    brands.set(k, [...(brands.get(k) ?? []), r])
  }
  for (const r of rows) {
    if (r.domain || taken.has(r.id) || !untouched(r) || !r.sourceCompanyId.startsWith('n:')) continue
    const match = brands.get(`${brandKey(r.name)}:${countryKey(r.regionIds)}`) ?? []
    if (match.length === 1) pairs.push({ keeper: match[0]!, dup: r })
  }
  return pairs
}

/**
 * Before an upsert: a name-only row whose brand matches exactly one stored
 * row with a website (same country) takes that row's key, so the upsert
 * merges into it instead of creating a duplicate.
 */
export function remapToKnown<T extends { sourceCompanyId: string; name: string; domain: string | null; regionIds: string[]; sourceTags?: string[] }>(
  rows: readonly T[],
  index: readonly companiesQ.FoldRow[],
): T[] {
  const brands = new Map<string, string[]>()
  for (const r of index) {
    if (!r.domain) continue
    const k = `${brandKey(r.name)}:${countryKey(r.regionIds)}`
    brands.set(k, [...(brands.get(k) ?? []), r.sourceCompanyId])
  }
  return rows.map((r) => {
    if (r.domain || !r.sourceCompanyId.startsWith('n:')) return r
    const hit = brands.get(`${brandKey(r.name)}:${countryKey(r.regionIds)}`) ?? []
    if (hit.length === 1) return { ...r, sourceCompanyId: hit[0]! }
    // A register's legal name that begins with a known brand ("Agility Public Warehousing Company K.S.C.P.").
    const prefix = legalPrefixTarget({ name: r.name, regionIds: r.regionIds, sourceTags: r.sourceTags ?? [] }, brands)
    return prefix ? { ...r, sourceCompanyId: prefix } : r
  })
}

/** Merge and delete the duplicates of one user's source; returns how many rows were folded. */
export async function foldDuplicates(userId: string, sourceId: string): Promise<number> {
  const pairs = findDuplicates(await companiesQ.foldIndex(sourceId))
  if (pairs.length === 0) return 0
  const merged = new Map<string, companiesQ.FoldRow>()
  for (const { keeper, dup } of pairs) {
    const k = merged.get(keeper.id) ?? keeper
    merged.set(keeper.id, {
      ...k,
      sourceTags: uniq([...k.sourceTags, ...dup.sourceTags]),
      regionIds: uniq([...k.regionIds, ...dup.regionIds]),
      evidence: { ...dup.evidence, ...k.evidence },
    })
  }
  for (const k of merged.values()) {
    await companiesQ.patchCompany(userId, k.id, { sourceTags: k.sourceTags, regionIds: k.regionIds, evidence: k.evidence as never })
  }
  return companiesQ.deleteCompanies(userId, pairs.map((p) => p.dup.id))
}
