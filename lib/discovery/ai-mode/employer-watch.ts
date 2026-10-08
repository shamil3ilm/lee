import { WATCH_EMPLOYERS, type WatchEmployer } from '@/lib/defaults/watch-employers'
import type { SearchPrefs } from '@/lib/discovery/relevance/prefs'
import { roleFamilyLabel } from '@/lib/discovery/relevance/roles'
import { MAX_PROMPT_LENGTH } from './url'
import { EXPAT_HINT, joinList as list, levelPhrase } from './phrases'

/**
 * Employer-watch prompts: GCC government, semi-government and major
 * employers (lib/defaults/watch-employers.ts), a few per prompt, for the
 * Google AI Mode hand-off. Rotates through the batches by day so the whole
 * list comes round at least weekly within a per-day cap. Pure and
 * client-safe; prompts carry employer names and preferences only, never
 * anything from the user's profile.
 */

export const MIN_BATCH = 5
export const MAX_BATCH = 8
/** Employer-watch prompts offered per day (the AI Mode dialog shows these). */
export const EMPLOYER_PROMPTS_PER_DAY_CAP = 4
const DAY_MS = 86_400_000
const DAYS_PER_CYCLE = 7

/**
 * The ai_web_search entries (every entry when none is marked that way),
 * minus nationals-only employers: the user needs roles open to expatriates.
 */
export function promptEmployers(all: readonly WatchEmployer[] = WATCH_EMPLOYERS): WatchEmployer[] {
  const open = all.filter((e) => !e.nationalsOnly)
  const marked = open.filter((e) => e.method === 'ai_web_search')
  return marked.length > 0 ? marked : open
}

/**
 * Employers in even batches of MIN_BATCH–MAX_BATCH (fewer only when the
 * whole list is shorter), sorted by country then name so neighbours share a
 * country. Sizes differ by at most one.
 */
export function batchEmployers(all: readonly WatchEmployer[], size = 6): WatchEmployer[][] {
  const per = Math.min(MAX_BATCH, Math.max(MIN_BATCH, size))
  const sorted = [...all].sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name))
  const n = sorted.length
  if (n === 0) return []
  const fewest = Math.ceil(n / MAX_BATCH)
  const most = Math.max(fewest, Math.floor(n / MIN_BATCH))
  const k = Math.min(most, Math.max(fewest, Math.round(n / per)))
  const base = Math.floor(n / k)
  const extra = n % k
  const batches: WatchEmployer[][] = []
  let at = 0
  for (let i = 0; i < k; i++) {
    const len = base + (i < extra ? 1 : 0)
    batches.push(sorted.slice(at, at + len))
    at += len
  }
  return batches
}

export interface RotationPlan {
  /** Batches handled per day. */
  perDay: number
  /** Days for one full pass over every batch. */
  cycleDays: number
  /** False when the cap is too low to cover the list within a week. */
  weekly: boolean
}

/** Smallest per-day count that covers every batch within a week, never above the cap. */
export function planRotation(batchCount: number, dailyCap: number): RotationPlan {
  const cap = Math.max(0, Math.floor(dailyCap))
  if (batchCount <= 0 || cap === 0) return { perDay: 0, cycleDays: 0, weekly: batchCount <= 0 }
  const perDay = Math.min(cap, batchCount, Math.ceil(batchCount / DAYS_PER_CYCLE))
  const cycleDays = Math.ceil(batchCount / perDay)
  return { perDay, cycleDays, weekly: cycleDays <= DAYS_PER_CYCLE }
}

/** Whole UTC days since the epoch. */
export function dayNumber(date: Date): number {
  return Math.floor(date.getTime() / DAY_MS)
}

/** Indexes of the batches due on `day`: consecutive slices, wrapping round the list. */
export function batchIndexesForDay(batchCount: number, day: number, perDay: number): number[] {
  if (batchCount <= 0 || perDay <= 0) return []
  const n = Math.min(perDay, batchCount)
  const cycleDays = Math.ceil(batchCount / n)
  const start = (((day % cycleDays) + cycleDays) % cycleDays) * n
  return Array.from({ length: n }, (_, i) => (start + i) % batchCount)
}

const COUNTRY: Readonly<Record<string, string>> = {
  AE: 'the UAE',
  SA: 'Saudi Arabia',
  QA: 'Qatar',
  KW: 'Kuwait',
  BH: 'Bahrain',
  OM: 'Oman',
}

/** The employer's careers host ("careers.etihad.com"), for the prompt and for matching links. */
export function careersHost(e: Pick<WatchEmployer, 'careersUrl'>): string {
  try {
    return new URL(e.careersUrl).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

export interface EmployerWatchPrompt {
  id: string
  label: string
  prompt: string
  employers: Array<{ name: string; nationalsOnly: boolean }>
}

/**
 * "Current technology, software, data or analyst openings at A, B, C in the
 * UAE: junior, mid-level and senior roles where …, open to expatriates …,
 * with the link on each employer's own careers site (a.com, b.com)."
 */
export function employerWatchPrompt(
  batch: readonly WatchEmployer[],
  prefs: SearchPrefs,
  index = 0,
  piiTerms: readonly string[] = [],
): EmployerWatchPrompt {
  const countries = [...new Set(batch.map((e) => e.country))]
  const where = list(countries.map((c) => COUNTRY[c] ?? c), 'and')
  const roles = prefs.roleFamilies.slice(0, 3).map(roleFamilyLabel)
  const focus = roles.length > 0 ? ` Especially ${list(roles)} roles.` : ''
  const hosts = batch.map(careersHost).filter(Boolean)
  const text =
    `Current technology, software, data or analyst job openings at ${list(batch.map((e) => e.name), 'and')} in ${where}: ` +
    `${levelPhrase(prefs, piiTerms)}, ${EXPAT_HINT}.${focus} For each opening give the job title, employer, city, ` +
    `posted date and the link on the employer's own careers site${hosts.length > 0 ? ` (${hosts.join(', ')})` : ''}.`
  return {
    id: `employers-${index}`,
    label: `Employers: ${list(batch.slice(0, 3).map((e) => e.name), 'and')}${batch.length > 3 ? ' …' : ''}`,
    prompt: text.replace(/\s{2,}/g, ' ').trim().slice(0, MAX_PROMPT_LENGTH),
    employers: batch.map((e) => ({ name: e.name, nationalsOnly: e.nationalsOnly })),
  }
}

/** Today's employer-watch prompt(s) for the AI Mode dialog, plus where the rotation stands. */
export function employerWatchPromptsForDay(
  prefs: SearchPrefs,
  now: Date,
  opts: { list?: readonly WatchEmployer[]; dailyCap?: number; piiTerms?: readonly string[] } = {},
): { prompts: EmployerWatchPrompt[]; batchCount: number; plan: RotationPlan } {
  const batches = batchEmployers(promptEmployers(opts.list))
  const plan = planRotation(batches.length, opts.dailyCap ?? EMPLOYER_PROMPTS_PER_DAY_CAP)
  const prompts = batchIndexesForDay(batches.length, dayNumber(now), plan.perDay).map((i) =>
    employerWatchPrompt(batches[i]!, prefs, i, opts.piiTerms),
  )
  return { prompts, batchCount: batches.length, plan }
}

/** Registrable-ish domain: the last two labels, or three for "co.ae" / "com.sa" style suffixes. */
function siteOf(host: string): string {
  const parts = host.split('.')
  const n = /^(co|com|gov|org|net|edu|ac)$/.test(parts.at(-2) ?? '') && (parts.at(-1)?.length ?? 0) === 2 ? 3 : 2
  return parts.slice(-n).join('.')
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/**
 * The watched employer an opening belongs to: its link is on the
 * employer's careers site, or its employer name matches. Lets imported
 * openings carry the employer tag and the nationals-only mark.
 */
export function matchWatchEmployer(
  url: string,
  employerName: string,
  all: readonly WatchEmployer[] = WATCH_EMPLOYERS,
): WatchEmployer | null {
  let host = ''
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    host = ''
  }
  if (host) {
    const site = siteOf(host)
    const bySite = all.find((e) => {
      const h = careersHost(e)
      return h !== '' && siteOf(h) === site
    })
    if (bySite) return bySite
  }
  const name = norm(employerName)
  return name ? (all.find((e) => norm(e.name) === name) ?? null) : null
}

/** Tags an opening at a watched employer carries. */
export function watchTags(e: WatchEmployer | null): string[] {
  if (!e) return []
  const slug = norm(e.name).replace(/\s+/g, '-')
  return [`employer:${slug}`, ...(e.nationalsOnly ? ['nationals-only'] : [])]
}
