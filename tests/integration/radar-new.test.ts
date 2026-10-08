import { beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { queueJobs, radarBriefs, radarEntries, radarItems, radarNewEntries, radarNewItems } from '@/lib/db/schema'
import * as itemsQ from '@/lib/db/queries/radarItems'
import * as termsQ from '@/lib/db/queries/radarTerms'
import { pruneRadarWhatsNew, RADAR_NEW_DAYS } from '@/lib/db/retention/radar-new'
import { runGlobalCleanup } from '@/lib/db/retention/run'
import { saveProfile } from '@/lib/profile/service'
import { adoptWhatsNew } from '@/lib/radar/new/adopt'
import { whatsNewSectionsFor } from '@/lib/radar/new/notify'
import { runWhatsNewSource } from '@/lib/radar/new/run'
import { storeNewItems } from '@/lib/radar/new/store'
import type { NewItemInput } from '@/lib/radar/new/types'
import { loadWhatsNew } from '@/lib/radar/new/view'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { RADAR_NEW_DELAY_MS, scheduleWhatsNew } from '@/lib/radar/new/schedule'
import { NO_WAIT } from '@/lib/reputation/rate-limit'
import { fixtureFetch } from '@/tests/fixtures/reputation/fetch'
import { newRoutes } from '@/tests/fixtures/radar/new/fetch'
import { makeUser } from '@/tests/factories'

const NOW = new Date('2026-10-08T09:00:00Z')
const DAY = 86_400_000
const ago = (d: number): Date => new Date(NOW.getTime() - d * DAY)
const http = () => ({ fetchImpl: fixtureFetch(newRoutes()), limiter: NO_WAIT, now: NOW })

function repo(name: string, over: Partial<NewItemInput> = {}): NewItemInput {
  return {
    source: 'github',
    externalId: name,
    kind: 'repo',
    title: name,
    url: `https://github.com/${name}`,
    publishedAt: ago(3),
    excerpt: 'A repo',
    category: 'tool',
    openness: 'open',
    group: 'repo',
    entityKey: `gh:${name}`,
    createdAt: ago(3),
    tags: [],
    traction: 0.5,
    metrics: { stars: 100, repoId: name },
    ...over,
  }
}

// The shared What's new tables are not in the global per-test TRUNCATE (each
// truncate leaves relation files behind and slows the size-measurement test);
// only this file writes them, so it empties them itself.
beforeEach(async () => {
  await db.delete(radarNewEntries)
})

async function entries() {
  return db.select().from(radarNewEntries)
}

describe("what's new shared store", () => {
  it('stores each entity once, refreshes counts, and ignores old things that trend again', async () => {
    const r1 = await storeNewItems('github', [repo('acme/a'), repo('acme/a'), repo('acme/old', { createdAt: ago(400), publishedAt: ago(400) })], NOW)
    expect(r1).toMatchObject({ fetched: 2, new: 1, skipped: 1 })
    const r2 = await storeNewItems('github', [repo('acme/a', { metrics: { stars: 500, repoId: 'acme/a' } })], new Date(NOW.getTime() + DAY))
    expect(r2).toMatchObject({ new: 0, updated: 1 })
    const rows = await entries()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.metrics).toMatchObject({ stars: 500 })
    // First seen stays the first day.
    expect(rows[0]?.firstSeenAt.toISOString()).toBe(NOW.toISOString())
  })

  it('corroborates across sources: an HN Show post linking a new repo joins its entry', async () => {
    await storeNewItems('github', [repo('acme/zorb')], NOW)
    const story: NewItemInput = {
      ...repo('x'),
      source: 'hn',
      externalId: '7001',
      kind: 'news',
      title: 'Show HN: Zorb',
      name: 'Zorb',
      url: 'https://news.ycombinator.com/item?id=7001',
      category: 'news',
      group: 'show',
      openness: null,
      entityKey: 'hn:7001',
      metrics: { points: 200, links: ['https://github.com/acme/zorb'] },
    }
    const r = await storeNewItems('hn', [story], NOW)
    expect(r.joined).toBe(1)
    const [row] = await entries()
    expect(row).toMatchObject({ name: 'zorb', category: 'tool', sources: ['github', 'hn'] })
    expect(row?.metrics).toMatchObject({ stars: 100, points: 200 })
  })

  it('folds variants under their new base with a +N count', async () => {
    const r = await runWhatsNewSource('hf', http())
    expect(r.status).toBe('polled')
    const base = (await entries()).find((e) => e.entityKey === 'hf:model:acme-lab/zorb-27b')
    expect(base?.variantCount).toBe(3)
    const variantRows = await db.select().from(radarNewItems).where(eq(radarNewItems.role, 'variant'))
    expect(variantRows.map((v) => v.title).sort()).toEqual(['quantfolk/Zorb-27B-Chat-AWQ', 'quantfolk/Zorb-27B-GGUF', 'tuner/Zorb-27B-Chat'])
    // The GGUF of an older base was dropped; the adapter of it stands alone.
    const names = (await entries()).map((e) => e.name)
    expect(names).toContain('Pick-9B')
    expect(names).not.toContain('OldBase-8B-GGUF')
    // A second run on the same day adds nothing.
    expect((await runWhatsNewSource('hf', http())).new).toBe(0)
    expect((await entries()).find((e) => e.entityKey === 'hf:model:acme-lab/zorb-27b')?.variantCount).toBe(3)
  })

  it('caps new rows per source per day', async () => {
    const many = Array.from({ length: 70 }, (_, i) => repo(`acme/r${i}`, { traction: i / 100 }))
    const r = await storeNewItems('github', many, NOW)
    expect(r.new).toBe(60)
    expect(r.skipped).toBe(10)
    // The strongest were kept.
    expect((await entries()).some((e) => e.name === 'r69')).toBe(true)
    expect((await storeNewItems('github', [repo('acme/late')], NOW)).new).toBe(0)
  })
})

describe('shared fetch, per-user ranking', () => {
  it('schedules one shared job per source per day, however many users', async () => {
    await makeUser()
    await makeUser()
    expect(await scheduleWhatsNew(NOW)).toEqual({ planned: 6, enqueued: 6 })
    expect((await scheduleWhatsNew(new Date(NOW.getTime() + 3_600_000))).enqueued).toBe(0)
    const jobs = await db.select().from(queueJobs).where(eq(queueJobs.type, JOB_TYPES.radarNew))
    expect(jobs).toHaveLength(6)
    expect(jobs.every((j) => j.userId === null)).toBe(true)
    // Due after the day's job-search work.
    expect(jobs.every((j) => j.runAfter.getTime() === NOW.getTime() + RADAR_NEW_DELAY_MS)).toBe(true)
  })

  it('ranks the same shared rows differently per user, with reason chips, and filters', async () => {
    const laravelDev = await makeUser()
    const other = await makeUser()
    await saveProfile(laravelDev.id, { radarReleaseProjects: ['laravel'], roleTypes: ['payments'] })
    await saveProfile(other.id, { radarReleaseProjects: [] })
    for (const s of ['hf', 'github', 'releases', 'hn', 'hf_papers'] as const) {
      const r = await runWhatsNewSource(s, { ...http(), projects: ['laravel', 'nextjs'] })
      expect(r.status).toBe('polled')
    }
    // One row set, no user id.
    const before = (await entries()).length
    const mine = await loadWhatsNew(laravelDev.id, { category: null, group: null, openOnly: false, relevantOnly: true, period: 'month' }, 0, NOW)
    const names = mine.sections.flatMap((s) => s.entries.map((e) => e.name))
    expect(names).toEqual(expect.arrayContaining(['Laravel 14', 'ledgerly']))
    const ledgerly = mine.sections.flatMap((s) => s.entries).find((e) => e.name === 'ledgerly')
    expect(ledgerly?.chips.map((c) => c.label)).toContain('Payments · role family')
    const theirs = await loadWhatsNew(other.id, { category: null, group: null, openOnly: false, relevantOnly: true, period: 'month' }, 0, NOW)
    expect(theirs.total).toBe(0)
    expect((await entries()).length).toBe(before)

    // Categories and the open-source filter.
    const models = await loadWhatsNew(other.id, { category: 'model', group: null, openOnly: true, relevantOnly: false, period: 'month' }, 0, NOW)
    expect(models.sections).toHaveLength(1)
    expect(models.sections[0]?.entries.every((e) => e.openness === 'open')).toBe(true)
    expect(models.sections[0]?.entries[0]?.name).toBe('Zorb-27B')
    expect(models.sections[0]?.entries[0]?.variantCount).toBe(3)
    // The model's paper is on HF Daily Papers and discussed on HN: one corroborated entry, led by the model.
    const zorb = models.sections[0]?.entries[0]
    expect(zorb?.chips.map((c) => c.label)).toEqual(expect.arrayContaining([expect.stringMatching(/^On [23] sources$/)]))
    expect(zorb?.sources.map((s) => s.label)).toEqual(expect.arrayContaining(['Hugging Face Hub', 'Hacker News']))
  })

  it("carries the week's top items per category in the digest, unless the radar mode is off", async () => {
    const u = await makeUser()
    await saveProfile(u.id, { radarReleaseProjects: ['laravel'] })
    await runWhatsNewSource('github', http())
    await runWhatsNewSource('releases', { ...http(), projects: ['laravel'] })
    const sections = await whatsNewSectionsFor(u.id, { now: new Date(NOW.getTime() + 60_000) })
    expect(sections.map((s) => s.label)).toEqual(['Tools & repos', 'Releases'])
    expect(sections[1]?.lines[0]).toMatchObject({ name: 'Laravel 14', url: 'https://endoflife.date/laravel' })
    await saveProfile(u.id, { radarNotify: 'off' })
    expect(await whatsNewSectionsFor(u.id, { now: NOW })).toEqual([])
  })
})

describe('Watch, save and brief on a shared item', () => {
  it('opens a shared entry in the user\'s own Radar once, with its items', async () => {
    const u = await makeUser()
    await runWhatsNewSource('github', http())
    await runWhatsNewSource('hn', http())
    const zorb = (await entries()).find((e) => e.name === 'zorb')!
    const id = await adoptWhatsNew(u.id, zorb.id, { save: true, now: NOW })
    expect(await adoptWhatsNew(u.id, zorb.id, { now: NOW })).toBe(id)
    const entry = await itemsQ.getEntry(u.id, id)
    expect(entry).toMatchObject({ name: 'zorb', kind: 'repo', itemCount: 2 })
    expect(entry?.savedAt).not.toBeNull()
    expect(entry?.keys).toContain(`new:${zorb.id}`)
    const own = await db.select().from(radarItems).where(eq(radarItems.userId, u.id))
    expect(own.map((i) => i.source).sort()).toEqual(['github', 'hn'])
    const view = await loadWhatsNew(u.id, { category: 'tool', group: null, openOnly: false, relevantOnly: false, period: 'month' }, 0, NOW)
    expect(view.sections[0]?.entries.find((e) => e.name === 'zorb')?.entryId).toBe(id)
  })
})

describe("what's new retention", () => {
  it('deletes entries older than 60 days unless saved, watched or briefed', async () => {
    const old = ago(RADAR_NEW_DAYS + 1)
    await storeNewItems('github', ['acme/plain', 'acme/saved', 'acme/watched', 'acme/briefed', 'acme/opened'].map((n) => repo(n, { createdAt: old })), old)
    await storeNewItems('github', [repo('acme/fresh')], NOW)
    const byName = new Map((await entries()).map((e) => [e.name, e]))
    const u = await makeUser()
    await adoptWhatsNew(u.id, byName.get('saved')!.id, { save: true, now: old })
    const briefedId = await adoptWhatsNew(u.id, byName.get('briefed')!.id, { now: old })
    await db.insert(radarBriefs).values({ userId: u.id, entryId: briefedId, sections: {}, promptVersion: '1', promptHash: 'h' })
    // Opened for a brief that was never confirmed: not kept.
    await adoptWhatsNew(u.id, byName.get('opened')!.id, { now: old })
    await termsQ.insert(u.id, { term: 'watched', aliases: [], kind: 'term' })

    expect(await pruneRadarWhatsNew(NOW)).toBe(2)
    expect((await entries()).map((e) => e.name).sort()).toEqual(['briefed', 'fresh', 'saved', 'watched'])
    // Items went with their entries.
    expect(await db.select().from(radarNewItems)).toHaveLength(4)
    expect(await pruneRadarWhatsNew(NOW)).toBe(0)
    // The user's own copies follow the Radar's own retention.
    expect(await db.select().from(radarEntries).where(and(eq(radarEntries.userId, u.id)))).toHaveLength(3)
  })

  it('runs as a global retention step', async () => {
    await storeNewItems('github', [repo('acme/plain', { createdAt: ago(70) })], ago(70))
    const r = await runGlobalCleanup(NOW)
    expect(r.radarWhatsNew).toBe(1)
  })
})
