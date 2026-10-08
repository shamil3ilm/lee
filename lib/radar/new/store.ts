import { db } from '@/lib/db/client'
import * as newQ from '@/lib/db/queries/radarNew'
import { pickEntry } from '../cluster'
import { boundedMetrics, joinPatch, mergeNewMetrics, newEntryValues, newItemKeys } from './merge'
import { capForToday, DAILY_CAP, isNewEntity } from './novelty'
import type { NewItemInput, NewMetrics, NewSource } from './types'
import { baseKeyOf, collapseVariants } from './variants'

/**
 * The shared "what's new" store, written once per source per day for
 * every account (no user id). For each fetched item:
 *   - already stored (same source + external id): its counts are refreshed
 *     (likes, stars and points keep growing) — never a second row;
 *   - a variant of a new base model: folded under it ("+N variants");
 *   - sharing a key with an entry (the same entity, repo, paper or link
 *     from another source): joins it — cross-source corroboration;
 *   - otherwise new only if its own creation date is inside the source's
 *     window (lib/radar/new/novelty.ts), within the source's daily cap.
 */

export interface StoreCounts {
  fetched: number
  new: number
  joined: number
  updated: number
  variants: number
  /** Too old to be new, quantisations of older bases, or over the daily cap. */
  skipped: number
}

function dayStart(now: Date): Date {
  return new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`)
}

function dedupe(items: readonly NewItemInput[]): NewItemInput[] {
  const seen = new Set<string>()
  return items.filter((i) => {
    const k = `${i.source}\u0000${i.externalId}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function itemValues(entryId: string, item: NewItemInput, role: 'primary' | 'variant', now: Date): newQ.NewItemValues {
  return {
    entryId,
    source: item.source,
    externalId: item.externalId,
    kind: item.kind,
    role,
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt,
    fetchedAt: now,
    excerpt: item.excerpt,
    metrics: boundedMetrics(item.metrics),
  }
}

async function refreshExisting(source: NewSource, items: readonly NewItemInput[], now: Date): Promise<{ fresh: NewItemInput[]; updated: number }> {
  const have = await newQ.existingItems(source, items.map((i) => i.externalId))
  let updated = 0
  for (const item of items) {
    const row = have.get(item.externalId)
    if (!row) continue
    await newQ.updateItemMetrics(row.id, mergeNewMetrics(row.metrics as NewMetrics, item.metrics))
    const entry = await newQ.getEntry(row.entryId)
    if (entry) await newQ.updateEntry(entry.id, { metrics: mergeNewMetrics(entry.metrics as NewMetrics, item.metrics), lastSeenAt: now })
    updated += 1
  }
  return { fresh: items.filter((i) => !have.has(i.externalId)), updated }
}

type Outcome = 'new' | 'joined' | 'skipped'

async function storePrimary(item: NewItemInput, now: Date): Promise<Outcome> {
  const keys = newItemKeys(item)
  const candidates = await newQ.entriesByKeys(keys)
  const joinId = pickEntry({ strong: keys, term: [] }, candidates)
  if (!joinId && !isNewEntity({ known: false, createdAt: item.createdAt, source: item.source, now })) return 'skipped'
  return db
    .transaction(async (tx) => {
      let entryId = joinId
      let outcome: Outcome = 'joined'
      if (entryId) {
        const e = candidates.find((c) => c.id === entryId) as newQ.NewEntryRow
        await newQ.updateEntry(entryId, joinPatch(e, item, now), tx)
      } else {
        const created = await newQ.createEntry(newEntryValues(item, now), tx)
        // Another source created the same entity a moment ago: let the next run join it.
        if (!created) tx.rollback()
        entryId = (created as newQ.NewEntryRow).id
        outcome = 'new'
      }
      if (!(await newQ.insertItem(itemValues(entryId, item, 'primary', now), tx))) tx.rollback()
      return outcome
    })
    .catch((e: unknown): Outcome => {
      if (e instanceof Error && /rollback/i.test(e.message)) return 'skipped'
      throw e
    })
}

async function storeVariant(item: NewItemInput, rootKey: string, now: Date): Promise<boolean> {
  // The base may have joined an older entry, so look it up by its entity key among every entry's keys.
  const [root] = await newQ.entriesByKeys([`entity:${rootKey}`])
  if (!root) return false
  return db
    .transaction(async (tx) => {
      if (!(await newQ.insertItem(itemValues(root.id, item, 'variant', now), tx))) tx.rollback()
      await newQ.updateEntry(
        root.id,
        { variantCount: root.variantCount + 1, keys: [...new Set([...root.keys, `entity:${item.entityKey}`])].slice(0, 64), lastSeenAt: now },
        tx,
      )
      return true
    })
    .catch((e: unknown) => {
      if (e instanceof Error && /rollback/i.test(e.message)) return false
      throw e
    })
}

/** Store one source's fetched items (all of the same source). */
export async function storeNewItems(source: NewSource, items: readonly NewItemInput[], now: Date = new Date()): Promise<StoreCounts> {
  const unique = dedupe(items.filter((i) => i.source === source))
  const counts: StoreCounts = { fetched: unique.length, new: 0, joined: 0, updated: 0, variants: 0, skipped: 0 }
  const { fresh, updated } = await refreshExisting(source, unique, now)
  counts.updated = updated

  const baseKeys = [...new Set(fresh.flatMap((i) => baseKeyOf(i) ?? []))]
  const collapsed = collapseVariants(fresh, await newQ.entityRoots(baseKeys))
  counts.skipped += collapsed.dropped

  let room = Math.max(0, DAILY_CAP[source] - (await newQ.countAddedSince(source, dayStart(now))))
  const primaries = capForToday(collapsed.primaries, DAILY_CAP[source] - room, DAILY_CAP[source])
  counts.skipped += collapsed.primaries.length - primaries.length
  for (const item of primaries) {
    const outcome = await storePrimary(item, now)
    if (outcome === 'skipped') counts.skipped += 1
    else {
      counts[outcome] += 1
      room -= 1
    }
  }
  for (const { item, rootKey } of collapsed.variants) {
    if (room <= 0) {
      counts.skipped += 1
      continue
    }
    if (await storeVariant(item, rootKey, now)) {
      counts.variants += 1
      room -= 1
    } else counts.skipped += 1
  }
  return counts
}
