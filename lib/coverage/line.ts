import { normalizePreferred, type PreferredLevel } from '@/lib/regions/preferred'
import { childrenOf, getNode, primaryChain, shortName } from '@/lib/regions/tree'
import { PLAYBOOKS, getPlaybook } from './playbooks'
import type { RegionPlaybook } from './playbook-types'

/**
 * The regions Discovery's one-line coverage summary names: the user's
 * starred regions only, cities rolled up to their state or country (a
 * Kerala-wide posting counts for "Kerala", while "Calicut" alone is red by
 * construction). No stars → no rows; the line then asks for them instead
 * of showing the weakest regions. Pure, client-safe.
 */

export interface LineRegion {
  id: string
  level: PreferredLevel
}

/** A city's state, else its country; anything else stays as it is. */
export function rollUp(id: string): string {
  if (getNode(id)?.kind !== 'city') return id
  return primaryChain(id).find((a) => {
    const kind = getNode(a)?.kind
    return kind === 'state' || kind === 'country'
  }) ?? id
}

const RANK: Readonly<Record<PreferredLevel, number>> = { top: 0, preferred: 1 }

/** Starred regions rolled up and de-duplicated (the higher star wins), top first, at most `max`. */
export function lineRegionIds(preferred: readonly unknown[], max = 3): LineRegion[] {
  const out: LineRegion[] = []
  for (const p of normalizePreferred(preferred)) {
    const id = rollUp(p.id)
    const seen = out.findIndex((o) => o.id === id)
    if (seen === -1) out.push({ id, level: p.level })
    else if (RANK[p.level] < RANK[out[seen]!.level]) out[seen] = { id, level: p.level }
  }
  return out.sort((a, b) => RANK[a.level] - RANK[b.level]).slice(0, max)
}

export interface StarCandidate {
  id: string
  label: string
}

/** Targets with no saved regions: lee's market (the GCC and India), as in for-user.ts. */
const DEFAULT_TARGETS = ['gcc', 'in']

function playbookRank(id: string): number {
  const i = PLAYBOOKS.findIndex((p) => p.id === id)
  return i === -1 ? PLAYBOOKS.length : i
}

/**
 * First-run "Where first?" chips: the user's target regions at the level
 * worth starring (a group opens into its countries, a city rolls up to its
 * state), Kuwait and the UAE first (playbook order), Remote last, at most
 * `max`.
 */
export function starCandidates(
  regionIds: readonly string[],
  remoteScope: 'worldwide' | 'regions' | 'none',
  max = 8,
): StarCandidate[] {
  const ids: string[] = []
  for (const id of regionIds.length > 0 ? regionIds : DEFAULT_TARGETS) {
    const node = getNode(id)
    if (!node || node.kind === 'remote') continue
    const opened = node.kind === 'group' ? childrenOf(id).filter((c) => getNode(c)?.kind === 'country') : [rollUp(id)]
    for (const c of opened) if (!ids.includes(c)) ids.push(c)
  }
  const ordered = [...ids].sort((a, b) => playbookRank(a) - playbookRank(b))
  if (remoteScope !== 'none') ordered.push('remote')
  return ordered.slice(0, max).map((id) => ({ id, label: id === 'remote' ? 'Remote' : shortName(id) }))
}

/**
 * The playbook a line region is measured with: its own (Kuwait, UAE,
 * Remote…), else a minimal one covering just that node (Kerala, GCC).
 */
export function linePlaybook(id: string): RegionPlaybook {
  const own = getPlaybook(id) ?? PLAYBOOKS.find((p) => p.covers.includes(id))
  if (own) return own
  const label = shortName(id)
  return {
    id,
    label,
    covers: [id],
    searchPlace: label,
    aiModePlaces: label,
    alertSites: [],
    localQueries: [],
    boards: [],
    directoryGroup: null,
    priority: 50,
  }
}
