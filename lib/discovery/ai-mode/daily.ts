import { batchEmployers, batchIndexesForDay, dayNumber, employerWatchPrompt, promptEmployers } from './employer-watch'
import { buildAiModePrompts } from './prompts'
import type { SearchPrefs } from '@/lib/discovery/relevance/prefs'
import type { WatchEmployer } from '@/lib/defaults/watch-employers'

/**
 * The AI Mode dialog's daily rotation: every prompt family (GCC, India,
 * other countries, remote-from-home, relocation) and every employer-watch
 * batch form one pool; each day shows at most `dailyCap` of them, moving on
 * the next day, so the whole pool comes round in `cycleDays`. The rest stay
 * one click away ("More prompts"). Pure.
 */

export const AI_MODE_DAILY_CAP = 4

export interface DailyPrompt {
  id: string
  label: string
  prompt: string
  kind: 'family' | 'employers'
  employers?: Array<{ name: string; nationalsOnly: boolean }>
}

export interface DailyPromptSet {
  today: DailyPrompt[]
  more: DailyPrompt[]
  /** Days for the rotation to show every prompt once. */
  cycleDays: number
  employerBatches: number
}

export function dailyPromptSet(
  prefs: SearchPrefs,
  now: Date,
  opts: { piiTerms?: readonly string[]; dailyCap?: number; employers?: readonly WatchEmployer[] } = {},
): DailyPromptSet {
  const pii = opts.piiTerms ?? []
  const families: DailyPrompt[] = buildAiModePrompts(prefs, pii).map((p) => ({ ...p, kind: 'family' }))
  const batches = batchEmployers(promptEmployers(opts.employers))
  const employerPrompts: DailyPrompt[] = batches.map((b, i) => {
    const p = employerWatchPrompt(b, prefs, i, pii)
    return { id: p.id, label: p.label, prompt: p.prompt, kind: 'employers', employers: p.employers }
  })
  // Interleave so a day mixes families and employer batches.
  const pool: DailyPrompt[] = []
  for (let i = 0; i < Math.max(families.length, employerPrompts.length); i++) {
    if (families[i]) pool.push(families[i]!)
    if (employerPrompts[i]) pool.push(employerPrompts[i]!)
  }
  const cap = Math.max(1, Math.floor(opts.dailyCap ?? AI_MODE_DAILY_CAP))
  const perDay = Math.min(cap, pool.length)
  const todayIdx = batchIndexesForDay(pool.length, dayNumber(now), perDay)
  const picked = new Set(todayIdx)
  return {
    today: todayIdx.map((i) => pool[i]!),
    more: pool.filter((_, i) => !picked.has(i)),
    cycleDays: perDay > 0 ? Math.ceil(pool.length / perDay) : 0,
    employerBatches: batches.length,
  }
}
