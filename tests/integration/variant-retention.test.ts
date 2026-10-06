import { describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import * as s from '@/lib/db/schema'
import * as variantsQ from '@/lib/db/queries/resumeVariants'
import * as settingsQ from '@/lib/db/queries/retentionSettings'
import { DEFAULT_RETENTION_POLICY, policyFrom, pruneVariantVersions, runRetentionForUser } from '@/lib/db/retention'
import { makeApplication, makeCompany, makeJob, makeUser } from '@/tests/factories'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-10-06T03:00:00Z')
const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * DAY)
const RECIPE = { region: 'remote' }

/** A variant with `count` versions, version i created `ages[i - 1]` days ago. */
async function variantWithVersions(userId: string, ages: readonly number[]): Promise<string> {
  let v = await variantsQ.create(userId, { name: 'Remote · General', region: 'remote', roleFamily: null, recipe: RECIPE })
  for (let i = 1; i < ages.length; i++) {
    v = await variantsQ.addVersion(userId, v, { recipe: { ...RECIPE, headline: `v${i + 1}` }, region: 'remote', roleFamily: null })
  }
  for (const [i, age] of ages.entries()) {
    await db
      .update(s.resumeVariantVersions)
      .set({ createdAt: daysAgo(age) })
      .where(and(eq(s.resumeVariantVersions.variantId, v.id), eq(s.resumeVariantVersions.version, i + 1)))
  }
  return v.id
}

async function versions(variantId: string): Promise<number[]> {
  const rows = await db
    .select({ version: s.resumeVariantVersions.version })
    .from(s.resumeVariantVersions)
    .where(eq(s.resumeVariantVersions.variantId, variantId))
  return rows.map((r) => r.version).sort((a, b) => a - b)
}

describe('pruneVariantVersions', () => {
  it('defaults to 180 days, editable in Settings › Storage', () => {
    expect(DEFAULT_RETENTION_POLICY.variantVersionDays).toBe(180)
    expect(policyFrom({ variantVersionDays: 45 }).variantVersionDays).toBe(45)
    expect(policyFrom({ variantVersionDays: 3 }).variantVersionDays).toBe(180)
  })

  it('prunes old versions but keeps the latest, the ones applications use and the published ones', async () => {
    const u = await makeUser()
    const id = await variantWithVersions(u.id, [400, 300, 250, 200, 190, 10])
    // v2 is what an application was sent with; v4 was published.
    const company = await makeCompany(u.id)
    const job = await makeJob(u.id, company.id)
    await makeApplication(u.id, job.id, { resumeVariantId: id, resumeVariantVersion: 2 })
    await variantsQ.markVersionPublished(u.id, id, 4, daysAgo(200))

    const removed = await pruneVariantVersions(NOW, { userId: u.id, days: 180 })
    expect(removed).toBe(3)
    expect(await versions(id)).toEqual([2, 4, 6])
    // Idempotent: nothing more to do.
    expect(await pruneVariantVersions(NOW, { userId: u.id, days: 180 })).toBe(0)
  })

  it('keeps the latest version even when it is old, and leaves other users alone', async () => {
    const u = await makeUser()
    const other = await makeUser()
    const lone = await variantWithVersions(u.id, [900])
    const old = await variantWithVersions(u.id, [900, 800])
    const theirs = await variantWithVersions(other.id, [900, 800])
    expect(await pruneVariantVersions(NOW, { userId: u.id, days: 180 })).toBe(1)
    expect(await versions(lone)).toEqual([1])
    expect(await versions(old)).toEqual([2])
    expect(await versions(theirs)).toEqual([1, 2])
  })

  it('works in small batches and stops at the deadline', async () => {
    const u = await makeUser()
    const id = await variantWithVersions(u.id, [500, 450, 400, 350, 300, 5])
    expect(await pruneVariantVersions(NOW, { userId: u.id, days: 180, deadline: Date.now() - 1 })).toBe(0)
    expect(await pruneVariantVersions(NOW, { userId: u.id, days: 180, batchSize: 2 })).toBe(5)
    expect(await versions(id)).toEqual([6])
  })

  it('runs as part of the per-user cleanup with the user’s window', async () => {
    const u = await makeUser()
    const id = await variantWithVersions(u.id, [100, 70, 1])
    await settingsQ.savePolicy(u.id, { ...DEFAULT_RETENTION_POLICY, variantVersionDays: 60 })
    const r = await runRetentionForUser(u.id, NOW)
    expect(r.variantVersions).toBe(2)
    expect(await versions(id)).toEqual([3])
    const { lastRun } = await settingsQ.get(u.id)
    expect(lastRun?.counts.variantVersions).toBe(2)
  })
})
