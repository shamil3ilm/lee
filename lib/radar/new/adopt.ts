import { db } from '@/lib/db/client'
import * as itemsQ from '@/lib/db/queries/radarItems'
import * as newQ from '@/lib/db/queries/radarNew'
import * as termsQ from '@/lib/db/queries/radarTerms'
import { clusterKeys, mergeKeys, pickEntry } from '../cluster'
import { RadarError } from '../errors'
import { compactMetrics } from '../ingest'
import { compileTerms, matchTerms } from '../match'
import { isRadarKind, type RadarItemInput, type RadarKind, type RadarMetrics } from '../types'
import { isNewCategory, KIND_OF_CATEGORY } from './types'

/**
 * "Save", "Brief" and "Learn this" on a what's-new entry: copy it into the
 * user's own Radar (radar_entries / radar_items, user-scoped) as one entry
 * carrying the key `new:<shared id>`, so the existing entry page — grounded
 * brief (≥ 2 primary sources, verbatim citations, metadata timeline) and
 * Learn this — works on it unchanged. Idempotent: a second call returns
 * the same entry. If the user already has an entry for the same thing
 * (from their watch terms), that entry is reused.
 */

const MAX_ITEMS = 8

function radarKind(category: string, firstKind: string | undefined): RadarKind {
  if (category === 'tool' && isRadarKind(firstKind)) return firstKind
  return isNewCategory(category) ? KIND_OF_CATEGORY[category] : 'news'
}

function toInput(row: newQ.NewItemRow): RadarItemInput {
  return {
    // The user's items keep the shared source id ('releases' included); labels come from lib/radar/view.ts.
    source: row.source as RadarItemInput['source'],
    externalId: row.externalId,
    kind: isRadarKind(row.kind) ? row.kind : 'news',
    title: row.title,
    url: row.url,
    publishedAt: row.publishedAt,
    excerpt: row.excerpt,
    metrics: compactMetrics(row.metrics as RadarMetrics),
  }
}

export async function adoptWhatsNew(userId: string, newId: string, opts: { save?: boolean; now?: Date } = {}): Promise<string> {
  const now = opts.now ?? new Date()
  const shared = await newQ.getEntry(newId)
  if (!shared) throw new RadarError('That item is no longer listed.', 'not_found')
  const already = (await newQ.userEntriesForNew(userId, [newId])).get(newId)
  if (already) {
    if (opts.save) await itemsQ.setEntryFlags(userId, already, { savedAt: now })
    return already
  }
  const items = (await newQ.itemsOf([newId])).slice(0, MAX_ITEMS).map(toInput)
  const compiled = compileTerms((await termsQ.list(userId)).filter((t) => !t.muted))
  const matched = [...new Set(items.flatMap((i) => matchTerms([i.title, i.excerpt], compiled)))]
  const strong = [`new:${newId}`, ...new Set(items.flatMap((i) => clusterKeys(i, []).strong))]
  const candidates = await itemsQ.entriesByKeys(userId, strong)
  const joinId = pickEntry({ strong, term: [] }, candidates)

  return db.transaction(async (tx) => {
    let entryId = joinId
    const existing = joinId ? candidates.find((c) => c.id === joinId) : undefined
    if (!existing) {
      const created = await itemsQ.createEntry(
        userId,
        {
          name: shared.name,
          kind: radarKind(shared.category, items[0]?.kind),
          keys: mergeKeys([], { strong, term: [] }),
          sources: [...new Set(items.map((i) => i.source))],
          matchedTerms: matched,
          itemCount: 0,
          firstSeenAt: now,
          lastSeenAt: now,
          ...(opts.save ? { savedAt: now } : {}),
        },
        tx,
      )
      entryId = created.id
    }
    let inserted = 0
    for (const item of items) {
      const ok = await itemsQ.insertItem(
        userId,
        {
          entryId: entryId as string,
          ...item,
          fetchedAt: now,
          metrics: item.metrics,
          matchedTerms: matchTerms([item.title, item.excerpt], compiled),
        },
        tx,
      )
      if (ok) inserted += 1
    }
    await itemsQ.updateEntry(
      userId,
      entryId as string,
      {
        // new:<id> always kept (the cap in mergeKeys could drop it on a full entry).
        keys: [...new Set([`new:${newId}`, ...mergeKeys(existing?.keys ?? [], { strong, term: [] })])],
        sources: [...new Set([...(existing?.sources ?? []), ...items.map((i) => i.source)])],
        matchedTerms: [...new Set([...(existing?.matchedTerms ?? []), ...matched])],
        itemCount: (existing?.itemCount ?? 0) + inserted,
        lastSeenAt: now,
        ...(opts.save ? { savedAt: now } : {}),
      },
      tx,
    )
    return entryId as string
  })
}
