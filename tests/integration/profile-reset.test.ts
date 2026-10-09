import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { applications, cvTailorings, discoveries, documents, resumeVariants, resumeVariantVersions } from '@/lib/db/schema'
import * as batchesQ from '@/lib/db/queries/importBatches'
import * as compareQ from '@/lib/db/queries/jobComparison'
import * as documentsQ from '@/lib/db/queries/documents'
import * as linkedinQ from '@/lib/db/queries/linkedin'
import * as profileQ from '@/lib/db/queries/profile'
import * as variantsQ from '@/lib/db/queries/resumeVariants'
import { logger } from '@/lib/logger'
import { getResumeProfile, saveResumeProfile } from '@/lib/resume/service'
import { DEFAULT_LOCATION_PREFS } from '@/lib/profile/service'
import { makeApplication, makeCompany, makeDiscovery, makeJob, makeSource, makeUser } from '@/tests/factories'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'

const sessionMock = vi.hoisted(() => vi.fn())
const editable = vi.hoisted(() => vi.fn(() => false))
const recompute = vi.hoisted(() => vi.fn(async () => ({ relevance: true, match: true })))
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/profile/edit-mode', () => ({ profileEditableInLee: editable }))
vi.mock('@/lib/import/recompute', () => ({ recomputeAfterProfileChange: recompute }))

const { applyResetAction, backupResetAction, previewResetAction } = await import('@/app/(authed)/settings/profile/reset-actions')

const none = { profile: [], targets: [], importBatchIds: [] }

interface Seeded {
  userId: string
  usedVariant: string
  tailorVariant: string
  unusedVariant: string
  appId: string
}

/** A synthetic user with something in every resettable part, plus an application, documents and a discovery. */
async function seed(): Promise<Seeded> {
  const u = await makeUser()
  sessionMock.mockResolvedValue(u.id)
  const userId = u.id
  await profileQ.upsert(userId, {
    links: [{ id: 'gh', label: 'Code', url: 'https://github.com/example', kind: 'case_study' }],
    roleTypes: ['backend'],
    keywords: ['ledger'],
    searchPrefsSavedAt: new Date(),
    learnedTitles: { 'ledger analyst': { related: true, family: 'backend', at: '2026-10-01' } },
  })
  const base = syntheticProfile()
  await saveResumeProfile(userId, { ...base, projects: base.projects.map((p, i) => (i === 0 ? { ...p, studyNotes: 'Read the RFC' } : p)) })
  await compareQ.save(userId, { currentJob: { title: 'Engineer', currency: 'AED' }, narratives: { 'd:x': 'ok' } })
  await linkedinQ.upsertConnections(userId, [{ name: 'Priya Example', company: 'Acme', companyKey: 'acme', position: 'Engineer', connectedOn: null, email: null }])
  const company = await makeCompany(userId)
  const job = await makeJob(userId, company.id)
  const used = await variantsQ.create(userId, { name: 'Used', region: 'gcc', roleFamily: null, recipe: {} })
  const tailor = await variantsQ.create(userId, { name: 'Tailor base', region: 'gcc', roleFamily: null, recipe: {} })
  const unused = await variantsQ.create(userId, { name: 'Unused', region: 'india', roleFamily: null, recipe: {} })
  const app = await makeApplication(userId, job.id, { resumeVariantId: used.id, resumeVariantVersion: 1 })
  const doc = await documentsQ.create(userId, { applicationId: app.id, kind: 'tailored_cv', version: 1, title: 'Tailored', content: {} })
  await documentsQ.create(userId, { applicationId: app.id, kind: 'cover_letter', version: 1, title: 'Sent letter', content: {} })
  await db.insert(cvTailorings).values({ userId, applicationId: app.id, documentId: doc.id, jdHash: 'h', baseVariantId: tailor.id, baseVersion: 1 })
  const source = await makeSource(userId)
  await makeDiscovery(userId, source.id)
  return { userId, usedVariant: used.id, tailorVariant: tailor.id, unusedVariant: unused.id, appId: app.id }
}

async function untouched(userId: string) {
  const count = async (t: typeof applications | typeof documents | typeof discoveries | typeof cvTailorings) =>
    (await db.select().from(t).where(eq(t.userId, userId))).length
  return { applications: await count(applications), documents: await count(documents), discoveries: await count(discoveries), tailorings: await count(cvTailorings) }
}

beforeEach(() => {
  editable.mockReturnValue(false)
  recompute.mockClear()
  vi.restoreAllMocks()
})

describe('reset details', () => {
  it('resets each selected part of lee’s data and never touches applications, documents, tailored CVs or discoveries', async () => {
    const s = await seed()
    const before = await untouched(s.userId)
    const info = vi.spyOn(logger, 'info')
    const sel = { ...none, targets: ['links', 'searchPrefs', 'currentJob', 'study', 'variants', 'connections', 'learnedTitles'] }
    const r = await applyResetAction(sel, '')
    if (!r.ok) throw new Error(r.error)
    expect(r.counts).toMatchObject({ links: 1, currentJob: 1, variantsDeleted: 1, variantsArchived: 2, connections: 1, learnedTitles: 1 })

    const row = (await profileQ.get(s.userId))!
    expect(row.links).toEqual([])
    expect(row.roleTypes).toEqual([])
    expect(row.keywords).toEqual([])
    expect(row.searchPrefsSavedAt).toBeNull()
    expect(row.locationPrefs).toEqual(DEFAULT_LOCATION_PREFS)
    expect(row.learnedTitles).toEqual({})
    expect((await compareQ.get(s.userId)).currentJob).toBeNull()
    expect(await linkedinQ.countConnections(s.userId)).toBe(0)
    const { profile } = await getResumeProfile(s.userId)
    expect(profile.projects[0]!.studyNotes).toBe('')
    expect(profile.projects).toHaveLength(syntheticProfile().projects.length)

    // Variants used by an application (or its tailored CV) are archived with their versions.
    const variants = await db.select().from(resumeVariants).where(eq(resumeVariants.userId, s.userId))
    expect(variants.map((v) => [v.name, v.archivedAt !== null]).sort()).toEqual([
      ['Tailor base', true],
      ['Used', true],
    ])
    expect(await db.select().from(resumeVariantVersions).where(eq(resumeVariantVersions.variantId, s.usedVariant))).toHaveLength(1)
    const [app] = await db.select().from(applications).where(eq(applications.id, s.appId))
    expect(app!.resumeVariantId).toBe(s.usedVariant)

    expect(await untouched(s.userId)).toEqual(before)
    // Logged with counts only; recompute triggered.
    const call = info.mock.calls.find(([event]) => event === 'profile_reset')!
    expect(Object.entries(call[1] as Record<string, unknown>).filter(([k]) => k !== 'userId').every(([, v]) => typeof v === 'number')).toBe(true)
    expect(recompute).toHaveBeenCalledWith(s.userId)
  })

  it('needs RESET typed for a full reset (checked on the server)', async () => {
    const s = await seed()
    const sel = { ...none, targets: ['overlay'] }
    expect(await applyResetAction(sel, 'reset')).toEqual({ ok: false, error: 'Type RESET to confirm a full reset.' })
    expect(await applyResetAction(none, 'RESET')).toEqual({ ok: false, error: 'Choose what to reset.' })
    const ready = (await getResumeProfile(s.userId)).profile.skills.flatMap((g) => g.skills).filter((x) => x.interviewReady)
    expect(ready.length).toBeGreaterThan(0)
    expect(await applyResetAction(sel, 'RESET')).toMatchObject({ ok: true })
    const { profile } = await getResumeProfile(s.userId)
    expect(profile.skills.flatMap((g) => g.skills).every((x) => !x.interviewReady && x.depth === 'learning')).toBe(true)
    expect(profile.work.flatMap((w) => w.highlights).every((h) => h.alternates.length === 0)).toBe(true)
    expect(profile.work.map((w) => w.name)).toEqual(syntheticProfile().work.map((w) => w.name))
    expect((await profileQ.get(s.userId))!.links).toEqual([{ id: 'gh', label: 'Code', url: 'https://github.com/example', kind: 'github' }])
  })

  it('public profile sections reset only while profile editing in lee is on', async () => {
    const s = await seed()
    const sel = { ...none, profile: ['work', 'skills'] }
    const docsBefore = (await untouched(s.userId)).documents
    expect(await applyResetAction(sel, '')).toMatchObject({ ok: true })
    expect((await getResumeProfile(s.userId)).profile.work.length).toBeGreaterThan(0)

    editable.mockReturnValue(true)
    const preview = await previewResetAction(sel)
    if (!preview.ok) throw new Error(preview.error)
    expect(preview.preview.groups.map((g) => g.label)).toEqual(['Master profile: Experience', 'Master profile: Skills'])
    expect(await applyResetAction(sel, '')).toMatchObject({ ok: true })
    const { profile } = await getResumeProfile(s.userId)
    expect(profile.work).toEqual([])
    expect(profile.skills).toEqual([])
    expect(profile.projects.length).toBeGreaterThan(0)
    expect(profile.basics.name).toBe(syntheticProfile().basics.name)
    // Earlier master CV snapshots stay (a reset never deletes documents).
    expect((await untouched(s.userId)).documents).toBeGreaterThanOrEqual(docsBefore)
  })

  it('the backup holds exactly the selected data', async () => {
    const s = await seed()
    const r = await backupResetAction({ ...none, targets: ['links', 'variants', 'connections', 'searchPrefs'] })
    if (!r.ok) throw new Error(r.error)
    const b = r.backup
    expect(b.format).toBe('lee-reset-backup/1')
    expect(Object.keys(b.data).sort()).toEqual(['connections', 'links', 'searchPrefs', 'variants'])
    expect(b.data.links).toEqual([{ id: 'gh', label: 'Code', url: 'https://github.com/example', kind: 'case_study' }])
    expect(b.data.connections).toEqual([expect.objectContaining({ name: 'Priya Example', company: 'Acme' })])
    expect((b.data.variants as Array<{ name: string; versions: unknown[] }>).map((v) => [v.name, v.versions.length]).sort()).toEqual([
      ['Tailor base', 1],
      ['Unused', 1],
      ['Used', 1],
    ])
    expect((b.data.searchPrefs as Record<string, unknown>).keywords).toEqual(['ledger'])
    expect(JSON.stringify(b)).not.toContain('Sent letter')
    // Nothing was removed by taking a backup.
    expect((await profileQ.get(s.userId))!.links).toHaveLength(1)
  })

  it('removes what a specific import added (provenance)', async () => {
    const s = await seed()
    await linkedinQ.upsertConnections(s.userId, [{ name: 'Noor Example', company: 'Careem', companyKey: 'careem', position: '', connectedOn: null, email: null }], null)
    const batch = await batchesQ.create(s.userId, { source: 'linkedin', mode: 'suggested', importedAt: new Date(), counts: { suggested: 1 }, intentions: [{ section: 'skills', name: 'Kafka', mine: true }], changes: { connections: true } })
    await linkedinQ.upsertConnections(s.userId, [{ name: 'Rami Example', company: 'Acme', companyKey: 'acme', position: '', connectedOn: null, email: null }], batch.id)
    const preview = await previewResetAction({ ...none, importBatchIds: [batch.id] })
    if (!preview.ok) throw new Error(preview.error)
    expect(preview.preview.groups[0]!.items).toEqual(expect.arrayContaining(['1 readiness choice(s) waiting for the portfolio', 'Connections this import added']))
    expect(await applyResetAction({ ...none, importBatchIds: [batch.id] }, '')).toMatchObject({ ok: true, counts: { imports: 1 } })
    expect(await linkedinQ.countConnections(s.userId)).toBe(2)
    expect((await batchesQ.getById(s.userId, batch.id))!.undoneAt).not.toBeNull()
  })
})
