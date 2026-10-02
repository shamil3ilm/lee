import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import * as s from '@/lib/db/schema'
import {
  dropDriveDuplicatedBytes,
  evictPdfCache,
  expireStaleDiscoveries,
  pruneCvScores,
  pruneExpiredAuthRows,
  pruneLabRuns,
  pruneOrphanDriveFolders,
  pruneOrphanRiskAssessments,
  pruneScamDomainCache,
  pruneUsageHistory,
  PDF_CACHE_RETENTION_DAYS,
  STALE_DISCOVERY_DAYS,
} from '@/lib/db/retention'
import { makeCompany, makeDiscovery, makeJob, makeSource, makeUser } from '@/tests/factories'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-09-26T03:30:00Z')
const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * DAY)

async function makeDocument(userId: string) {
  const [d] = await db
    .insert(s.documents)
    .values({ userId, kind: 'master_cv', title: 'CV', content: { body: 'x' } })
    .returning()
  return d!
}

async function cvScore(userId: string, createdAt: Date, extra: Partial<typeof s.cvScores.$inferInsert> = {}) {
  const [row] = await db
    .insert(s.cvScores)
    .values({
      userId,
      sourceKind: 'master_cv',
      sourceLabel: 'CV',
      overall: 70,
      grade: 'B',
      scores: {},
      dimensions: { big: 'd'.repeat(500) },
      findings: [],
      scorerVersion: '1',
      createdAt,
      ...extra,
    })
    .returning()
  return row!
}

describe('expireStaleDiscoveries', () => {
  it('moves unreviewed postings past the window to Dismissed, leaving triaged ones alone', async () => {
    const u = await makeUser()
    const src = await makeSource(u.id)
    const stale = await makeDiscovery(u.id, src.id, { createdAt: daysAgo(STALE_DISCOVERY_DAYS + 1) })
    const fresh = await makeDiscovery(u.id, src.id, { createdAt: daysAgo(STALE_DISCOVERY_DAYS - 1) })
    const shortlisted = await makeDiscovery(u.id, src.id, { status: 'shortlisted', createdAt: daysAgo(300) })
    const saved = await makeDiscovery(u.id, src.id, { status: 'saved', createdAt: daysAgo(300) })
    await db.insert(s.companyDiscoveries).values({
      userId: u.id,
      sourceId: src.id,
      sourceCompanyId: 'c1',
      raw: {},
      normalized: { kind: 'company', name: 'Acme' },
      createdAt: daysAgo(STALE_DISCOVERY_DAYS + 5),
    })

    expect(await expireStaleDiscoveries(NOW)).toBe(2)
    expect(await expireStaleDiscoveries(NOW)).toBe(0)

    const byId = new Map((await db.select().from(s.discoveries)).map((d) => [d.id, d]))
    expect(byId.get(stale.id)).toMatchObject({ status: 'dismissed', normalized: stale.normalized })
    // updated_at = now: it stays restorable in Dismissed for the dismissed window.
    expect(byId.get(stale.id)!.updatedAt.getTime()).toBe(NOW.getTime())
    expect(byId.get(fresh.id)!.status).toBe('new')
    expect(byId.get(shortlisted.id)!.status).toBe('shortlisted')
    expect(byId.get(saved.id)!.status).toBe('saved')
    const [company] = await db.select().from(s.companyDiscoveries)
    expect(company!.status).toBe('dismissed')
  })

  it('also expires stale postings the relevance gate filtered out', async () => {
    const u = await makeUser()
    const src = await makeSource(u.id)
    const old = await makeDiscovery(u.id, src.id, { status: 'filtered', createdAt: daysAgo(STALE_DISCOVERY_DAYS + 1) })
    const recent = await makeDiscovery(u.id, src.id, { status: 'filtered', createdAt: daysAgo(1) })
    expect(await expireStaleDiscoveries(NOW)).toBe(1)
    const byId = new Map((await db.select().from(s.discoveries)).map((d) => [d.id, d.status]))
    expect(byId.get(old.id)).toBe('dismissed')
    expect(byId.get(recent.id)).toBe('filtered')
  })

  it('only touches the given user when scoped', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const da = await makeDiscovery(a.id, (await makeSource(a.id)).id, { createdAt: daysAgo(100) })
    const db2 = await makeDiscovery(b.id, (await makeSource(b.id)).id, { createdAt: daysAgo(100) })
    expect(await expireStaleDiscoveries(NOW, { userId: a.id })).toBe(1)
    const rows = new Map((await db.select().from(s.discoveries)).map((d) => [d.id, d.status]))
    expect(rows.get(da.id)).toBe('dismissed')
    expect(rows.get(db2.id)).toBe('new')
  })
})

describe('pruneCvScores', () => {
  it('drops old runs but always keeps the newest score per CV and per CV-vs-job pair', async () => {
    const u = await makeUser()
    const doc = await makeDocument(u.id)
    const app = (await makeJob(u.id, (await makeCompany(u.id)).id)).id
    const [application] = await db.insert(s.applications).values({ userId: u.id, jobId: app }).returning()
    const oldest = await cvScore(u.id, daysAgo(900), { documentId: doc.id })
    const older = await cvScore(u.id, daysAgo(800), { documentId: doc.id })
    const latestOld = await cvScore(u.id, daysAgo(400), { documentId: doc.id })
    const pairOnly = await cvScore(u.id, daysAgo(700), { documentId: doc.id, applicationId: application!.id, mode: 'jd' })
    const upload = await cvScore(u.id, daysAgo(700), { sourceKind: 'upload', sourceLabel: 'cv.pdf' })

    expect(await pruneCvScores(NOW, { batchSize: 1 })).toBe(2)
    expect(await pruneCvScores(NOW)).toBe(0)
    const ids = (await db.select({ id: s.cvScores.id }).from(s.cvScores)).map((r) => r.id).sort()
    expect(ids).toEqual([latestOld.id, pairOnly.id, upload.id].sort())
    expect(ids).not.toContain(oldest.id)
    expect(ids).not.toContain(older.id)
  })
})

describe('pruneLabRuns', () => {
  it('deletes old unvoted runs with their results and keeps voted or recent runs', async () => {
    const u = await makeUser()
    const run = async (createdAt: Date, vote: number | null) => {
      const [r] = await db.insert(s.labRuns).values({ userId: u.id, kind: 'arena', config: {}, createdAt }).returning()
      await db.insert(s.labRunResults).values({ runId: r!.id, modelProvider: 'groq', modelId: 'm', output: 'o'.repeat(900), vote })
      return r!
    }
    const old = await run(daysAgo(400), null)
    const voted = await run(daysAgo(400), 1)
    const recent = await run(daysAgo(10), null)
    expect(await pruneLabRuns(NOW)).toBe(1)
    const ids = (await db.select({ id: s.labRuns.id }).from(s.labRuns)).map((r) => r.id).sort()
    expect(ids).toEqual([voted.id, recent.id].sort())
    const results = await db.select().from(s.labRunResults).where(eq(s.labRunResults.runId, old.id))
    expect(results).toHaveLength(0)
  })
})

describe('evictPdfCache', () => {
  it('evicts old Postgres-held PDFs and never a Drive-held entry', async () => {
    const u = await makeUser()
    const [oldPg, freshPg, oldDrive] = [await makeDocument(u.id), await makeDocument(u.id), await makeDocument(u.id)]
    const pdf = Buffer.from('%PDF-1.4 '.repeat(50))
    await db.insert(s.documentPdfCache).values([
      { documentId: oldPg.id, userId: u.id, cacheKey: 'k', sizeBytes: pdf.byteLength, bytes: pdf, createdAt: daysAgo(PDF_CACHE_RETENTION_DAYS + 1) },
      { documentId: freshPg.id, userId: u.id, cacheKey: 'k', sizeBytes: pdf.byteLength, bytes: pdf, createdAt: daysAgo(1) },
      { documentId: oldDrive.id, userId: u.id, cacheKey: 'k', sizeBytes: 10, driveFileId: 'drive-1', createdAt: daysAgo(400) },
    ])
    expect(await evictPdfCache(NOW)).toBe(1)
    expect(await evictPdfCache(NOW)).toBe(0)
    const left = (await db.select().from(s.documentPdfCache)).map((r) => r.documentId).sort()
    expect(left).toEqual([freshPg.id, oldDrive.id].sort())
  })
})

describe('dropDriveDuplicatedBytes', () => {
  it('clears bytes that Drive already holds, filling the hash, and keeps the only copy', async () => {
    const u = await makeUser()
    const doc = await makeDocument(u.id)
    const bytes = Buffer.from('image-bytes'.repeat(20))
    const sha = createHash('sha256').update(bytes).digest('hex')
    const [both, onlyPg] = await db
      .insert(s.documentAssets)
      .values([
        { userId: u.id, documentId: doc.id, filename: 'a.png', mimeType: 'image/png', sizeBytes: bytes.byteLength, bytes, driveFileId: 'drive-a' },
        { userId: u.id, documentId: doc.id, filename: 'b.png', mimeType: 'image/png', sizeBytes: bytes.byteLength, bytes },
      ])
      .returning()
    expect(await dropDriveDuplicatedBytes()).toBe(1)
    expect(await dropDriveDuplicatedBytes()).toBe(0)
    const rows = new Map((await db.select().from(s.documentAssets)).map((r) => [r.id, r]))
    expect(rows.get(both!.id)).toMatchObject({ bytes: null, driveFileId: 'drive-a', sha256: sha })
    expect(rows.get(onlyPg!.id)!.bytes?.equals(bytes)).toBe(true)
  })
})

describe('orphans', () => {
  it('deletes Scam Shield rows whose discovery or job is gone', async () => {
    const u = await makeUser()
    const src = await makeSource(u.id)
    const d = await makeDiscovery(u.id, src.id)
    const j = await makeJob(u.id, null)
    const risk = (targetType: string, targetId: string) => ({
      userId: u.id,
      targetType,
      targetId,
      score: 5,
      level: 'safe',
      rulesVersion: '1',
    })
    const gone = '00000000-0000-4000-8000-000000000001'
    await db.insert(s.jobRiskAssessments).values([
      risk('discovery', d.id),
      risk('job', j.id),
      risk('discovery', gone),
      risk('job', gone),
    ])
    expect(await pruneOrphanRiskAssessments({ batchSize: 1 })).toBe(2)
    expect(await pruneOrphanRiskAssessments()).toBe(0)
    const left = (await db.select().from(s.jobRiskAssessments)).map((r) => r.targetId).sort()
    expect(left).toEqual([d.id, j.id].sort())
  })

  it('deletes cached Drive folders of deleted documents only', async () => {
    const u = await makeUser()
    const doc = await makeDocument(u.id)
    const gone = '00000000-0000-4000-8000-000000000002'
    await db.insert(s.driveFolders).values([
      { userId: u.id, folderKey: 'root', folderId: 'r' },
      { userId: u.id, folderKey: `doc:${doc.id}`, folderId: 'f1' },
      { userId: u.id, folderKey: `doc-assets:${doc.id}`, folderId: 'f2' },
      { userId: u.id, folderKey: `doc:${gone}`, folderId: 'f3' },
      { userId: u.id, folderKey: `doc-assets:${gone}`, folderId: 'f4' },
    ])
    expect(await pruneOrphanDriveFolders()).toBe(2)
    expect(await pruneOrphanDriveFolders()).toBe(0)
    const keys = (await db.select().from(s.driveFolders)).map((r) => r.folderKey).sort()
    expect(keys).toEqual(['doc-assets:' + doc.id, 'doc:' + doc.id, 'root'].sort())
  })
})

describe('global housekeeping', () => {
  it('deletes expired sign-in rows, old usage history and stale domain checks', async () => {
    const u = await makeUser()
    await db.insert(s.sessions).values([
      { sessionToken: 'old', userId: u.id, expires: daysAgo(1) },
      { sessionToken: 'live', userId: u.id, expires: new Date(NOW.getTime() + DAY) },
    ])
    await db.insert(s.verificationTokens).values([
      { identifier: 'a', token: 't1', expires: daysAgo(1) },
      { identifier: 'a', token: 't2', expires: new Date(NOW.getTime() + DAY) },
    ])
    expect(await pruneExpiredAuthRows(NOW)).toBe(2)
    expect((await db.select().from(s.sessions)).map((r) => r.sessionToken)).toEqual(['live'])

    await db.insert(s.usageSnapshots).values([{ day: '2025-01-01' }, { day: '2026-09-25' }])
    await db.insert(s.usageAlerts).values([
      { userId: u.id, period: '2025-01', meter: 'neon_storage', threshold: 70, fraction: 0.7, createdAt: daysAgo(500) },
      { userId: u.id, period: '2026-09', meter: 'neon_storage', threshold: 70, fraction: 0.7, createdAt: daysAgo(3) },
    ])
    expect(await pruneUsageHistory(NOW)).toBe(2)
    expect((await db.select().from(s.usageSnapshots)).map((r) => r.day)).toEqual(['2026-09-25'])

    await db.insert(s.scamDomainCache).values([
      { domain: 'old.test', updatedAt: daysAgo(200) },
      { domain: 'new.test', updatedAt: daysAgo(2) },
    ])
    expect(await pruneScamDomainCache(NOW)).toBe(1)
    expect((await db.select().from(s.scamDomainCache)).map((r) => r.domain)).toEqual(['new.test'])
  })
})
