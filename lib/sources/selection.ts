/**
 * Bulk selection on Settings › Sources (pure, client-safe): the quick-select
 * chips, the tri-state "Select all", and what each bulk action would do to
 * the selected rows. The client list keeps the selected ids in state; every
 * decision about them lives here so it is unit-tested.
 */

export type SourceGroup = 'ats' | 'boards' | 'kerala' | 'news'

export const SOURCE_GROUPS: readonly SourceGroup[] = ['ats', 'boards', 'kerala', 'news']

export const SOURCE_GROUP_LABELS: Readonly<Record<SourceGroup, string>> = {
  ats: 'ATS boards',
  boards: 'Job boards and feeds',
  kerala: 'Kerala parks',
  news: 'News',
}

const GROUP_OF: Readonly<Record<string, SourceGroup>> = {
  greenhouse: 'ats',
  lever: 'ats',
  ashby: 'ats',
  workable: 'ats',
  recruitee: 'ats',
  pinpoint: 'ats',
  bamboohr: 'ats',
  workday: 'ats',
  oracle_orc: 'ats',
  successfactors: 'ats',
  phenom: 'ats',
  technopark: 'kerala',
  infopark: 'kerala',
  cyberpark: 'kerala',
  ul_cyberpark: 'kerala',
  ksum: 'kerala',
  wp_job_news: 'news',
}

/** The "By type" group of a source kind; anything else is a job board or feed. */
export function sourceGroupOf(kind: string): SourceGroup {
  return GROUP_OF[kind] ?? 'boards'
}

export interface SelectableSource {
  id: string
  name: string
  enabled: boolean
  group: SourceGroup
  /** Lists jobs in (or found postings in) one of the user's starred regions. */
  starred: boolean
  /** Why lee can't poll it for this user (lib/sources/readiness.ts), or null. */
  blocker: string | null
}

export type QuickSelect = 'all' | 'none' | 'off' | 'starred' | `type:${SourceGroup}`

export function quickSelectIds(rows: readonly SelectableSource[], preset: QuickSelect): Set<string> {
  const pick = (keep: (r: SelectableSource) => boolean) => new Set(rows.filter(keep).map((r) => r.id))
  if (preset === 'all') return pick(() => true)
  if (preset === 'none') return new Set()
  if (preset === 'off') return pick((r) => !r.enabled)
  if (preset === 'starred') return pick((r) => r.starred)
  const group = preset.slice('type:'.length) as SourceGroup
  return pick((r) => r.group === group)
}

/** How many rows each chip would select (chips with none are hidden). */
export function quickSelectCounts(rows: readonly SelectableSource[]): { off: number; starred: number; groups: Record<SourceGroup, number> } {
  const groups = Object.fromEntries(SOURCE_GROUPS.map((g) => [g, 0])) as Record<SourceGroup, number>
  for (const r of rows) groups[r.group] += 1
  return { off: rows.filter((r) => !r.enabled).length, starred: rows.filter((r) => r.starred).length, groups }
}

/** Only ids still on the page count (a removed source leaves the selection). */
export function liveSelection(rows: readonly SelectableSource[], selected: ReadonlySet<string>): string[] {
  return rows.filter((r) => selected.has(r.id)).map((r) => r.id)
}

export interface HeaderState {
  checked: boolean
  indeterminate: boolean
  count: number
}

/** The tri-state "Select all": checked when every row is, mixed when some are. */
export function headerState(rows: readonly SelectableSource[], selected: ReadonlySet<string>): HeaderState {
  const count = liveSelection(rows, selected).length
  const checked = rows.length > 0 && count === rows.length
  return { checked, indeterminate: count > 0 && !checked, count }
}

/** Clicking "Select all": everything, or nothing once everything is selected. */
export function toggleAll(rows: readonly SelectableSource[], selected: ReadonlySet<string>): Set<string> {
  return headerState(rows, selected).checked ? new Set() : quickSelectIds(rows, 'all')
}

/** A new set with `id` added or removed (never mutates). */
export function toggleOne(selected: ReadonlySet<string>, id: string, on: boolean): Set<string> {
  const next = new Set(selected)
  if (on) next.add(id)
  else next.delete(id)
  return next
}

export interface BlockedGroup {
  reason: string
  names: string[]
}

export interface BulkPlan {
  selected: number
  /** Off and pollable: what "Turn on N" switches on. */
  turnOn: string[]
  /** On: what "Turn off N" switches off. */
  turnOff: string[]
  /** On and pollable: what "Check now" queues a poll for. */
  check: string[]
  /** Off but not pollable, grouped by reason: excluded from "Turn on". */
  blocked: BlockedGroup[]
}

export function bulkPlan(rows: readonly SelectableSource[], selected: ReadonlySet<string>): BulkPlan {
  const picked = rows.filter((r) => selected.has(r.id))
  const blocked = new Map<string, string[]>()
  for (const r of picked) {
    if (r.enabled || !r.blocker) continue
    blocked.set(r.blocker, [...(blocked.get(r.blocker) ?? []), r.name])
  }
  return {
    selected: picked.length,
    turnOn: picked.filter((r) => !r.enabled && !r.blocker).map((r) => r.id),
    turnOff: picked.filter((r) => r.enabled).map((r) => r.id),
    check: picked.filter((r) => r.enabled && !r.blocker).map((r) => r.id),
    blocked: [...blocked].map(([reason, names]) => ({ reason, names })),
  }
}
