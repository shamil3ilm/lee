import { normalizeForMatch } from '@/lib/discovery/relevance/text'
import type { RegionCode } from '@/lib/discovery/relevance/places'

/**
 * Country profession bans for expatriates: data, reviewed quarterly (spec
 * §1.6, §3.2). A ban in force is a knockout for a non-national; one that
 * starts later is "at risk" (the permit may not be renewed). Each row cites
 * its source. A row whose `reviewed` date is over a year old degrades to
 * "unknown" so a stale rule never fails a posting on its own.
 */

export interface ProfessionBan {
  country: RegionCode
  /** Matches the posting title (normalised). */
  title: RegExp
  /** What the rule names: "computer programmers". */
  profession: string
  /** First day the ban applies (ISO date). */
  from: string
  source: string
  /** Last time a person checked this row (ISO date). */
  reviewed: string
}

const OMAN_SOURCE = 'https://kpmg.com/om/en/insights/2024/10/' // KPMG Oman, Omanisation decision (Oct 2024)

export const PROFESSION_BANS: readonly ProfessionBan[] = [
  {
    country: 'OM',
    title: /\b(?:computer |software |web |application |mobile |backend |back-end |frontend |front-end |full[\s-]?stack )?(?:programmer|developer)\b|\b(?:computer|software) engineer\b/,
    profession: 'computer programmers and computer engineers',
    from: '2026-01-01',
    source: OMAN_SOURCE,
    reviewed: '2026-10-12',
  },
  {
    country: 'OM',
    title: /\bsystems? analyst\b/,
    profession: 'systems analysts',
    from: '2025-01-01',
    source: OMAN_SOURCE,
    reviewed: '2026-10-12',
  },
  {
    country: 'OM',
    title: /\bweb designer\b|\bui designer\b/,
    profession: 'web designers',
    from: '2027-01-01',
    source: OMAN_SOURCE,
    reviewed: '2026-10-12',
  },
]

const STALE_AFTER_DAYS = 366

export interface BanHit {
  ban: ProfessionBan
  /** 'in_force' (fail) · 'upcoming' (at risk) · 'stale' (unknown: re-check the rule). */
  state: 'in_force' | 'upcoming' | 'stale'
}

function days(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / 86_400_000
}

/** The ban that covers this title in one of these countries, if any. */
export function professionBan(title: string, countries: Iterable<RegionCode>, now: Date, bans: readonly ProfessionBan[] = PROFESSION_BANS): BanHit | null {
  const t = normalizeForMatch(title)
  const set = new Set(countries)
  const ban = bans.find((b) => set.has(b.country) && b.title.test(t))
  if (!ban) return null
  if (days(now, new Date(`${ban.reviewed}T00:00:00Z`)) > STALE_AFTER_DAYS) return { ban, state: 'stale' }
  return { ban, state: now >= new Date(`${ban.from}T00:00:00Z`) ? 'in_force' : 'upcoming' }
}
