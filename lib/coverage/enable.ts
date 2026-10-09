import * as sourcesQ from '@/lib/db/queries/sources'
import { sourceIdentity } from '@/lib/defaults/catalog'
import { catalogBoardsFor } from './compute'
import { getPlaybook } from './playbooks'

/**
 * "Turn on N Kuwait employer boards": switch on the verified catalog boards
 * for a region the user has switched off, and add the ones they don't have.
 * The user's click is the confirmation; nothing happens without it. Returns
 * the sources to give a first poll.
 */

export interface EnableResult {
  enabled: number
  added: number
  sourceIds: string[]
}

export async function enableRegionBoards(userId: string, regionId: string): Promise<EnableResult | null> {
  const playbook = getPlaybook(regionId)
  if (!playbook) return null
  const boards = catalogBoardsFor(playbook)
  const existing = await sourcesQ.list(userId)
  const byIdentity = new Map(existing.map((s) => [sourceIdentity(s.kind, (s.config ?? {}) as Record<string, unknown>), s] as const))
  const result: EnableResult = { enabled: 0, added: 0, sourceIds: [] }
  for (const d of boards) {
    const have = byIdentity.get(sourceIdentity(d.kind, d.config))
    if (have?.enabled) continue
    if (have) {
      await sourcesQ.update(userId, have.id, { enabled: true })
      result.enabled++
      result.sourceIds.push(have.id)
      continue
    }
    const created = await sourcesQ.create(userId, { name: d.name, kind: d.kind, config: d.config, enabled: true })
    result.added++
    result.sourceIds.push(created.id)
  }
  return result
}
