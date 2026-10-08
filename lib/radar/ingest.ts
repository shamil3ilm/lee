import { db } from '@/lib/db/client'
import * as itemsQ from '@/lib/db/queries/radarItems'
import { clusterKeys, entryNameFor, mergeKeys, mergedKind, pickEntry } from './cluster'
import { compileTerms, matchTerms, type CompiledTerm, type WatchTermLike } from './match'
import type { RadarItemInput, RadarMetrics } from './types'

/**
 * Store fetched items: dedup on (source, external id) — an item already
 * stored is never written again — match the watch terms, then cluster each
 * new item into an entry (lib/radar/cluster.ts). Items are handled one by
 * one, so items of one run can cluster with each other.
 */

export interface IngestCounts {
  fetched: number
  new: number
  matched: number
}

/** Unique by (source, external id), first occurrence wins. */
export function dedupeItems(items: readonly RadarItemInput[]): RadarItemInput[] {
  const seen = new Set<string>()
  return items.filter((i) => {
    const k = `${i.source}\u0000${i.externalId}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Metrics without undefined values or empty lists (compact JSON). */
export function compactMetrics(m: RadarMetrics): RadarMetrics {
  return Object.fromEntries(
    Object.entries(m).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)),
  ) as RadarMetrics
}

async function storeOne(
  userId: string,
  item: RadarItemInput,
  compiled: readonly CompiledTerm[],
  labels: ReadonlyMap<string, string>,
  now: Date,
): Promise<{ stored: boolean; matched: boolean }> {
  const matched = matchTerms([item.title, item.excerpt], compiled)
  const keys = clusterKeys(item, matched)
  const candidates = await itemsQ.entriesByKeys(userId, [...keys.strong, ...keys.term])
  const entryId = pickEntry(keys, candidates)
  const stored = await db.transaction(async (tx) => {
    let id = entryId
    if (id) {
      const e = candidates.find((c) => c.id === id) as itemsQ.RadarEntryRow
      await itemsQ.updateEntry(
        userId,
        id,
        {
          keys: mergeKeys(e.keys, keys),
          sources: [...new Set([...e.sources, item.source])],
          matchedTerms: [...new Set([...e.matchedTerms, ...matched])],
          itemCount: e.itemCount + 1,
          kind: mergedKind(e.kind, item.kind),
          lastSeenAt: now,
          // New activity on an entry the user read makes it new again.
          readAt: null,
        },
        tx,
      )
    } else {
      const label = matched.length === 1 ? (labels.get(matched[0] as string) ?? null) : null
      const created = await itemsQ.createEntry(
        userId,
        {
          name: entryNameFor(item, label),
          kind: item.kind,
          keys: mergeKeys([], keys),
          sources: [item.source],
          matchedTerms: matched,
          itemCount: 1,
          firstSeenAt: now,
          lastSeenAt: now,
        },
        tx,
      )
      id = created.id
    }
    const ok = await itemsQ.insertItem(
      userId,
      {
        entryId: id,
        source: item.source,
        externalId: item.externalId,
        kind: item.kind,
        title: item.title,
        url: item.url,
        publishedAt: item.publishedAt,
        fetchedAt: now,
        excerpt: item.excerpt,
        metrics: compactMetrics(item.metrics),
        matchedTerms: matched,
      },
      tx,
    )
    // Lost a race with a concurrent run: undo the entry change.
    if (!ok) tx.rollback()
    return ok
  }).catch((e: unknown) => {
    if (e instanceof Error && /rollback/i.test(e.message)) return false
    throw e
  })
  return { stored, matched: stored && matched.length > 0 }
}

export async function ingestItems(
  userId: string,
  items: readonly RadarItemInput[],
  terms: readonly WatchTermLike[],
  now: Date = new Date(),
): Promise<IngestCounts> {
  const unique = dedupeItems(items)
  const bySource = new Map<string, RadarItemInput[]>()
  for (const i of unique) bySource.set(i.source, [...(bySource.get(i.source) ?? []), i])
  const fresh: RadarItemInput[] = []
  for (const [source, list] of bySource) {
    const have = await itemsQ.existingExternalIds(userId, source, list.map((i) => i.externalId))
    fresh.push(...list.filter((i) => !have.has(i.externalId)))
  }
  const compiled = compileTerms(terms)
  const labels = new Map(terms.map((t) => [t.id, t.term]))
  let stored = 0
  let matched = 0
  for (const item of fresh) {
    const r = await storeOne(userId, item, compiled, labels, now)
    if (r.stored) stored += 1
    if (r.matched) matched += 1
  }
  return { fetched: unique.length, new: stored, matched }
}
