import { WATCH_EMPLOYERS, type WatchEmployer, type WatchSector } from '@/lib/defaults/watch-employers'
import { normalizeForMatch } from '@/lib/discovery/relevance/text'

/**
 * What kind of employer posts the job, for photo conventions:
 *   government  a ministry, authority, municipality (watch list: sector
 *               "government")
 *   semi_gov    state-linked majors on the watch list (energy, utilities,
 *               ports, transport, telecom, investment …)
 *   bank        banks (watch list "banking", or the name)
 *   airline     airlines (watch list "aviation", or the name)
 *   startup     global tech, fintech and startups (the posting says so)
 *   unknown     anything else
 */

export type EmployerKind = 'government' | 'semi_gov' | 'bank' | 'airline' | 'startup' | 'unknown'

export interface EmployerInfo {
  kind: EmployerKind
  /** "on lee's watch list (utilities)", "the name says bank". */
  source: string
}

export interface EmployerInput {
  companyName?: string | null
  descriptionMd?: string | null
}

const SECTOR_KIND: Readonly<Record<WatchSector, EmployerKind>> = {
  government: 'government',
  banking: 'bank',
  aviation: 'airline',
  tech: 'startup',
  energy: 'semi_gov',
  utilities: 'semi_gov',
  telecom: 'semi_gov',
  ports: 'semi_gov',
  'real-estate': 'semi_gov',
  investment: 'semi_gov',
  transport: 'semi_gov',
  postal: 'semi_gov',
  mining: 'semi_gov',
  petrochemicals: 'semi_gov',
  events: 'semi_gov',
}

function watchMatch(name: string): WatchEmployer | undefined {
  const n = normalizeForMatch(name)
  if (!n) return undefined
  return WATCH_EMPLOYERS.find((e) => {
    const w = normalizeForMatch(e.name)
    // "Emirates NBD" ↔ "Emirates NBD PJSC"; short names ("du", "stc") must match exactly.
    return n === w || (w.length >= 4 && (n.startsWith(`${w} `) || n.startsWith(`${w} (`))) || (n.length >= 4 && w.startsWith(`${n} `))
  })
}

const GOVERNMENT = /\b(?:ministry|ministries|authority|municipality|government|governorate|emirate of|public prosecution|police|customs)\b|\.gov\b/i
const BANK = /\b(?:bank|banking|banque)\b/i
const AIRLINE = /\b(?:airways|airlines?|aviation)\b/i
const STARTUP = /\b(?:start-?ups?|fintech|series [a-d]\b|seed[- ]funded|venture[- ]backed|scale-?up)\b/i

export function employerKind(job: EmployerInput): EmployerInfo {
  const name = job.companyName?.trim() ?? ''
  const watched = watchMatch(name)
  if (watched) return { kind: SECTOR_KIND[watched.sector], source: `on lee's watch list (${watched.sector.replace('-', ' ')})` }
  if (GOVERNMENT.test(name)) return { kind: 'government', source: 'a government body' }
  if (BANK.test(name)) return { kind: 'bank', source: 'a bank' }
  if (AIRLINE.test(name)) return { kind: 'airline', source: 'an airline' }
  if (STARTUP.test((job.descriptionMd ?? '').slice(0, 4_000))) return { kind: 'startup', source: 'the posting reads as a startup or fintech' }
  return { kind: 'unknown', source: '' }
}
