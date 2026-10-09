import * as companiesQ from '@/lib/db/queries/localCompanies'
import * as growthQ from '@/lib/db/queries/companyGrowth'
import { domainOf, nameKey } from '../normalize'
import type { CompanyEvidence } from '../types'

/**
 * Copy each employer's growth score onto the user's recent job postings
 * from that employer (matched by the posting's company domain, else its
 * name key, also the name a directory listed it under), so "Why this score"
 * can show "Company growth: 78" and the optional Fit nudge can use it.
 * Postings whose employer has no known growth are cleared.
 */

export const POSTINGS_LOOKBACK_DAYS = 90

export interface GrowthOf {
  score: number
  confidence: string
}

/** Domain and name keys → growth, from the user's companies with a known growth. */
export function growthIndex(rows: ReadonlyArray<Pick<companiesQ.CompanyRow, 'domain' | 'normalized' | 'evidence' | 'growthScore' | 'growthConfidence'>>): Map<string, GrowthOf> {
  const out = new Map<string, GrowthOf>()
  for (const r of rows) {
    if (r.growthScore === null || !r.growthConfidence) continue
    const g = { score: r.growthScore, confidence: r.growthConfidence }
    if (r.domain) out.set(`d:${r.domain}`, g)
    const name = String((r.normalized as { name?: unknown } | null)?.name ?? '')
    const listedAs = ((r.evidence ?? {}) as CompanyEvidence).listedAs
    for (const n of [name, listedAs]) if (n && nameKey(n)) out.set(`n:${nameKey(n)}`, g)
  }
  return out
}

export function growthForPosting(p: { companyName: string | null; companyDomain: string | null }, index: ReadonlyMap<string, GrowthOf>): GrowthOf | null {
  const d = domainOf(p.companyDomain)
  if (d && index.has(`d:${d}`)) return index.get(`d:${d}`)!
  const k = p.companyName ? nameKey(p.companyName) : ''
  return (k && index.get(`n:${k}`)) || null
}

/** Returns the number of postings whose growth changed. */
export async function copyGrowthToPostings(userId: string, now: Date = new Date()): Promise<number> {
  const index = growthIndex(await companiesQ.inPlay(userId))
  const postings = await growthQ.postingCompanies(userId, new Date(now.getTime() - POSTINGS_LOOKBACK_DAYS * 86_400_000))
  const groups = new Map<string, { score: number | null; confidence: string | null; ids: string[] }>()
  for (const p of postings) {
    const g = growthForPosting(p, index)
    const score = g?.score ?? null
    const confidence = g?.confidence ?? null
    if (p.companyGrowth === score && p.companyGrowthConfidence === confidence) continue
    const key = `${score}:${confidence}`
    const group = groups.get(key) ?? { score, confidence, ids: [] }
    groups.set(key, { ...group, ids: [...group.ids, p.id] })
  }
  let changed = 0
  for (const g of groups.values()) {
    await growthQ.setPostingGrowth(userId, g.ids, g.score, g.confidence)
    changed += g.ids.length
  }
  return changed
}
