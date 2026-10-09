import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import * as batchesQ from '@/lib/db/queries/importBatches'
import * as linkedinQ from '@/lib/db/queries/linkedin'
import * as profileQ from '@/lib/db/queries/profile'
import { readIntentions } from '@/lib/import/intentions'
import { parseLinkedInExport } from '@/lib/integrations/linkedin/export/parse'
import { readLinkedProfile } from '@/lib/profile/url-import'
import { getResumeProfile, saveResumeProfile } from '@/lib/resume/service'
import { makeUser } from '@/tests/factories'
import { EXPORT_CSVS } from '@/tests/fixtures/linkedin-export'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'

const sessionMock = vi.hoisted(() => vi.fn())
const editable = vi.hoisted(() => vi.fn(() => false))
const recompute = vi.hoisted(() => vi.fn(async () => ({ relevance: true, match: true })))
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/profile/edit-mode', () => ({ profileEditableInLee: editable }))
vi.mock('@/lib/import/recompute', () => ({ recomputeAfterProfileChange: recompute }))
/** Synthetic résumé page; no real person. */
const PAGE = readFileSync(join(__dirname, '../fixtures/profile/resume-page.html'), 'utf8')
vi.mock('@/lib/ingest/fetch', () => ({ fetchPage: vi.fn(async () => ({ html: PAGE, finalUrl: 'https://alex.example/resume', status: 200 })) }))
vi.mock('@/lib/ai', async (orig) => ({
  ...(await orig<typeof import('@/lib/ai')>()),
  getAIProviderForUser: async () =>
    new FixtureAIProvider({
      parseProfile: () => ({
        headline: 'Backend developer (payments)',
        summary_md: null,
        skills: ['PHP', 'MySQL', 'Redis', 'Docker', 'Kafka'],
        industries: ['fintech'],
        role_types: [],
        seniority: null,
        years_experience: 6,
        stack_weights: { Kafka: 0.5 },
      }),
    }),
}))

const { applyUrlImportAction, previewUrlImportAction } = await import('@/app/(authed)/settings/profile/import-actions')
const { applyLinkedInImportAction, importConnectionsChunkAction } = await import('@/app/(authed)/settings/linkedin/actions')
const { applyCvImportAction } = await import('@/app/(authed)/settings/profile/cv-import-actions')
const { undoLastImport, undoBatch } = await import('@/lib/import/undo')

async function user(): Promise<string> {
  const u = await makeUser()
  sessionMock.mockResolvedValue(u.id)
  await profileQ.upsert(u.id, { headline: 'Developer', skills: ['PHP'] })
  await saveResumeProfile(u.id, syntheticProfile())
  return u.id
}

async function preview() {
  const r = await previewUrlImportAction('https://alex.example/resume')
  if (!('success' in r)) throw new Error(r.error)
  return r
}

/** Untick two skills and one project, as the e2e does. */
function untick(items: Awaited<ReturnType<typeof preview>>['items'], picked: string[]) {
  const label = (k: string) => items.find((i) => i.key === k)!.label
  const skills = picked.filter((k) => k.startsWith('skills:') && label(k) !== 'MySQL')
  const drop = [skills[0]!, skills[1]!, picked.find((k) => k.startsWith('projects:'))!]
  return { kept: picked.filter((k) => !drop.includes(k)), dropped: drop.map(label) }
}

beforeEach(() => {
  editable.mockReturnValue(false)
  recompute.mockClear()
})

describe('import from a public page', () => {
  it('editable: saves only the ticked items, not ready by default, with provenance', async () => {
    editable.mockReturnValue(true)
    const userId = await user()
    const p = await preview()
    expect(p.editable).toBe(true)
    const initial = p.items.filter((i) => i.status === 'new').map((i) => i.key)
    const { kept, dropped } = untick(p.items, initial)
    const r = await applyUrlImportAction(p.proposal, { picked: kept, mine: [] })
    expect(r).toMatchObject({ ok: true, mode: 'saved', snippets: [] })

    const { profile } = await getResumeProfile(userId)
    const names = [...profile.skills.flatMap((g) => g.skills.map((s) => s.name)), ...profile.projects.map((x) => x.name)]
    for (const d of dropped) expect(names).not.toContain(d)
    const imported = profile.skills.flatMap((g) => g.skills).filter((s) => s.source === 'url')
    expect(imported.length).toBeGreaterThan(0)
    expect(imported.every((s) => s.depth === 'learning' && !s.interviewReady && s.importedAt)).toBe(true)
    // Learning skills never reach the flat skill list that feeds suggestions.
    expect((await profileQ.get(userId))!.skills).toEqual(['PHP'])
    const [batch] = await batchesQ.listActive(userId)
    expect(batch).toMatchObject({ source: 'url', mode: 'saved' })
    expect(recompute).toHaveBeenCalledWith(userId)
  })

  it('not editable: public facts become suggestions and intentions; the master profile is unchanged', async () => {
    const userId = await user()
    const before = (await getResumeProfile(userId)).profile
    const p = await preview()
    expect(p.editable).toBe(false)
    const initial = p.items.filter((i) => i.status === 'new').map((i) => i.key)
    const { kept, dropped } = untick(p.items, initial)
    const mysql = p.items.find((i) => i.label === 'MySQL')!.key
    const r = await applyUrlImportAction(p.proposal, { picked: [...kept, mysql], mine: [mysql] })
    if (!r.ok) throw new Error(r.error)
    expect(r.mode).toBe('suggested')
    const all = r.snippets.map((s) => s.json).join('\n')
    expect(all).toContain('MySQL')
    for (const d of dropped) expect(all).not.toContain(d.slice(0, 30))
    expect((await getResumeProfile(userId)).profile).toEqual(before)
    expect((await profileQ.get(userId))!.headline).toBe('Developer')
    const [batch] = await batchesQ.listActive(userId)
    expect(batch!.mode).toBe('suggested')
    expect(readIntentions(batch!.intentions)).toContainEqual({ section: 'skills', name: 'MySQL', mine: true })
    // Lee-only page evidence was saved (as learning).
    expect(readLinkedProfile((await profileQ.get(userId))!.linkedProfile)!.learning.experience.length).toBeGreaterThan(0)
  })

  it('refuses an empty selection and never trusts client statuses', async () => {
    await user()
    const p = await preview()
    expect(await applyUrlImportAction(p.proposal, { picked: [], mine: [] })).toEqual({ ok: false, error: 'Tick at least one item.' })
    expect(await applyUrlImportAction({ ...p.proposal, url: 'javascript:alert(1)' }, { picked: ['skills:0'], mine: [] })).toEqual({ ok: false, error: 'Nothing to save.' })
    const bad = { ...p.proposal, links: [{ url: 'http://github.com/x', kind: 'github' }] }
    expect(await applyUrlImportAction(bad, { picked: ['links:0'], mine: [] })).toEqual({ ok: false, error: 'Nothing to save.' })
  })
})

const files = Object.fromEntries(Object.entries(EXPORT_CSVS).map(([k, v]) => [k.toLowerCase(), v]))
const exportData = parseLinkedInExport(files)
const { connections, ...profilePart } = exportData

describe('LinkedIn export import', () => {
  it('not editable: suggestions + intentions; optimizer data and tagged connections are saved; undo removes them', async () => {
    const userId = await user()
    const before = (await getResumeProfile(userId)).profile
    const r = await applyLinkedInImportAction(profilePart, { picked: ['skills:2', 'skills:3', 'projects:1'], mine: ['skills:3'] })
    if (!r.ok) throw new Error(r.error)
    expect(r.mode).toBe('suggested')
    expect(r.snippets.map((s) => s.section).sort()).toEqual(['projects', 'skills'])
    expect((await getResumeProfile(userId)).profile).toEqual(before)
    const saved = await importConnectionsChunkAction(connections, false, r.batchId)
    expect(saved).toMatchObject({ ok: true, saved: 3 })
    expect(await linkedinQ.countConnectionsByBatch(userId, r.batchId)).toBe(3)
    const batch = await batchesQ.getById(userId, r.batchId)
    expect(readIntentions(batch!.intentions)).toEqual([
      { section: 'skills', name: 'Laravel', mine: false },
      { section: 'skills', name: 'Kafka', mine: true },
      { section: 'projects', name: 'ZATCA Toolkit', mine: false },
    ])
    expect(await linkedinQ.getImport(userId)).not.toBeNull()

    const undone = await undoLastImport(userId)
    expect(undone).toMatchObject({ ok: true, connections: 3 })
    expect(await linkedinQ.countConnections(userId)).toBe(0)
    expect(await linkedinQ.getImport(userId)).toBeNull()
    expect(await batchesQ.listActive(userId)).toEqual([])
    expect(await undoBatch(userId, r.batchId)).toMatchObject({ ok: false })
  })

  it('editable: adds ticked items with provenance; undo removes exactly them and restores updates', async () => {
    editable.mockReturnValue(true)
    const userId = await user()
    const before = (await getResumeProfile(userId)).profile
    // Make the certification an update.
    await saveResumeProfile(userId, { ...before, certificates: before.certificates.map((c) => ({ ...c, issuer: 'Someone else' })) })
    const r = await applyLinkedInImportAction(profilePart, { picked: ['skills:2', 'work:1', 'certificates:0'], mine: [] })
    if (!r.ok) throw new Error(r.error)
    expect(r.mode).toBe('saved')
    let { profile } = await getResumeProfile(userId)
    expect(profile.skills.flatMap((g) => g.skills).find((s) => s.name === 'Laravel')).toMatchObject({ source: 'linkedin', depth: 'learning' })
    expect(profile.work.some((w) => w.name === 'Gulf Fintech' && w.source === 'linkedin')).toBe(true)
    expect(profile.certificates[0]!.issuer).toBe('Amazon Web Services')

    expect(await undoLastImport(userId)).toMatchObject({ ok: true, removed: 2, restored: 1 })
    profile = (await getResumeProfile(userId)).profile
    expect(profile.skills.flatMap((g) => g.skills).some((s) => s.name === 'Laravel')).toBe(false)
    expect(profile.work.some((w) => w.name === 'Gulf Fintech')).toBe(false)
    expect(profile.certificates[0]!.issuer).toBe('Someone else')
  })

  it('only undoes imports from the last 7 days', async () => {
    const userId = await user()
    const r = await applyLinkedInImportAction(profilePart, { picked: ['skills:2'], mine: [] })
    if (!r.ok) throw new Error(r.error)
    const later = new Date(Date.now() + 8 * 86_400_000)
    expect(await undoLastImport(userId, later)).toEqual({ ok: false, error: 'No import in the last 7 days to undo.' })
  })
})

describe('CV import', () => {
  it('saves lee-only matching details in both modes; public facts only when editable', async () => {
    const userId = await user()
    const proposal = { headline: 'Backend developer (payments)', summary: null, skills: ['PHP', 'Kafka'], industries: ['fintech'], roleTypes: [], seniority: null, yearsExperience: 6, stackWeights: { Kafka: 0.5 } }
    const r = await applyCvImportAction(proposal, { picked: ['basics:headline', 'skills:1', 'industries:0', 'matching:years'], mine: ['skills:1'] })
    if (!r.ok) throw new Error(r.error)
    expect(r.mode).toBe('suggested')
    let row = (await profileQ.get(userId))!
    expect(row.headline).toBe('Developer')
    expect(row.industries).toEqual(['fintech'])
    expect(row.yearsExperience).toBe(6)
    expect(row.stackWeights).toEqual({ Kafka: 0.5 })
    expect(await undoLastImport(userId)).toMatchObject({ ok: true })
    row = (await profileQ.get(userId))!
    expect(row.industries).toEqual([])
    expect(row.yearsExperience).toBeNull()
    expect(row.stackWeights).toEqual({})

    editable.mockReturnValue(true)
    const saved = await applyCvImportAction(proposal, { picked: ['basics:headline', 'skills:1'], mine: ['skills:1'] })
    expect(saved).toMatchObject({ ok: true, mode: 'saved' })
    row = (await profileQ.get(userId))!
    expect(row.headline).toBe('Backend developer (payments)')
    expect(row.skills).toEqual(['PHP', 'Kafka'])
    const kafka = (await getResumeProfile(userId)).profile.skills.flatMap((g) => g.skills).find((s) => s.name === 'Kafka')
    expect(kafka).toMatchObject({ depth: 'own', interviewReady: true, source: 'cv' })
  })
})
