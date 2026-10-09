import { withAncestors } from '@/lib/regions/tree'
import type { GrowthSignal } from './types'

/**
 * Market tailwind: a small, documented table of sectors growing in a
 * region, each with the public reason. It is a weak signal (low
 * confidence, small weight) and only says the market is growing, not the
 * company. Reviewed 2026-10-09.
 */

interface Tailwind {
  /** Region-taxonomy id the row applies in (descendants included). */
  region: string
  industries: readonly string[]
  score: number
  why: string
}

export const TAILWINDS: readonly Tailwind[] = [
  { region: 'sa', industries: ['einvoicing', 'erp'], score: 75, why: 'ZATCA e-invoicing (Fatoora) integration waves through 2026' },
  { region: 'ae', industries: ['einvoicing', 'erp'], score: 72, why: 'UAE e-invoicing rollout (2026–27)' },
  { region: 'sa', industries: ['fintech', 'payments', 'banking'], score: 68, why: 'Saudi Vision 2030 fintech targets and open banking' },
  { region: 'gcc', industries: ['fintech', 'payments'], score: 65, why: 'GCC fintech growth (cashless targets, open banking)' },
  { region: 'gcc', industries: ['data'], score: 62, why: 'GCC AI investment (national AI strategies)' },
  { region: 'gcc', industries: ['ecommerce'], score: 58, why: 'GCC e-commerce and delivery growth' },
  { region: 'in', industries: ['saas', 'data'], score: 60, why: 'Indian SaaS and AI exports' },
  { region: 'kerala', industries: ['it_services', 'software', 'saas'], score: 56, why: 'Kerala IT parks expanding (new Technopark and Infopark phases)' },
]

export function tailwindSignal(industries: readonly string[], regionIds: readonly string[]): GrowthSignal {
  const places = new Set(withAncestors(regionIds.filter(Boolean)))
  const hits = TAILWINDS.filter((t) => places.has(t.region) && t.industries.some((i) => industries.includes(i)))
  const best = hits.sort((a, b) => b.score - a.score)[0]
  if (!best) {
    return {
      kind: 'tailwind',
      score: null,
      detail: industries.length === 0 ? 'Sector not known' : 'No documented tailwind for this sector and region',
      source: 'lee market notes',
      date: null,
      confidence: 'low',
    }
  }
  return { kind: 'tailwind', score: best.score, detail: best.why, source: 'lee market notes (reviewed 2026-10-09)', date: '2026-10-09', confidence: 'low' }
}
