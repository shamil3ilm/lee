import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { radarBriefs, radarEntries, radarItems } from '@/lib/db/schema'
import * as itemsQ from '@/lib/db/queries/radarItems'
import * as termsQ from '@/lib/db/queries/radarTerms'
import { pruneRadarItems, RADAR_ITEM_DAYS } from '@/lib/db/retention/radar'
import { runRetentionForUser } from '@/lib/db/retention/run'
import { ingestItems } from '@/lib/radar/ingest'
import type { RadarItemInput } from '@/lib/radar/types'
import { makeUser } from '@/tests/factories'

const NOW = new Date('2026-10-08T03:30:00Z')
const OLD = new Date(NOW.getTime() - (RADAR_ITEM_DAYS + 1) * 86_400_000)

function item(id: string, title: string): RadarItemInput {
  return {
    source: 'hn',
    externalId: id,
    kind: 'news',
    title,
    url: `https://news.ycombinator.com/item?id=${id}`,
    publishedAt: null,
    excerpt: '',
    metrics: { links: [`https://site-${id}.example.com/post`] },
  }
}

async function entryOf(userId: string, title: string) {
  const rows = await db.select().from(radarItems).where(eq(radarItems.userId, userId))
  const it = rows.find((r) => r.title === title)
  return it ? itemsQ.getEntry(userId, it.entryId) : null
}

describe('pruneRadarItems', () => {
  it('deletes old unwatched, unsaved items and their empty entries; keeps the rest', async () => {
    const u = await makeUser()
    await termsQ.insert(u.id, { term: 'Zorb', aliases: [], kind: 'term' })
    const terms = await termsQ.list(u.id)
    await ingestItems(u.id, [item('1', 'Old plain story'), item('2', 'Old Zorb story'), item('3', 'Old saved story'), item('4', 'Old briefed story')], terms, OLD)
    await ingestItems(u.id, [item('5', 'Fresh plain story')], terms, NOW)
    const saved = await entryOf(u.id, 'Old saved story')
    await itemsQ.setEntryFlags(u.id, saved!.id, { savedAt: OLD })
    const briefed = await entryOf(u.id, 'Old briefed story')
    await db.insert(radarBriefs).values({ userId: u.id, entryId: briefed!.id, sections: {}, promptVersion: '1', promptHash: 'h' })

    // 1 item + its entry.
    expect(await pruneRadarItems(NOW)).toBe(2)
    const titles = (await db.select().from(radarItems).where(eq(radarItems.userId, u.id))).map((r) => r.title).sort()
    expect(titles).toEqual(['Fresh plain story', 'Old Zorb story', 'Old briefed story', 'Old saved story'])
    expect(await db.select().from(radarEntries).where(eq(radarEntries.userId, u.id))).toHaveLength(4)
    expect(await pruneRadarItems(NOW)).toBe(0)
  })

  it('runs as a registered retention step', async () => {
    const u = await makeUser()
    await ingestItems(u.id, [item('1', 'Old plain story')], [], OLD)
    const r = await runRetentionForUser(u.id, NOW)
    expect(r.radarItems).toBe(2)
  })
})
