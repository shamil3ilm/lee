import { afterEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import * as s from '@/lib/db/schema'
import * as keysQ from '@/lib/db/queries/labProviderKeys'
import * as publishQ from '@/lib/db/queries/portfolioPublish'
import * as variantsQ from '@/lib/db/queries/resumeVariants'
import { logger } from '@/lib/logger'
import { previewVariant, publishVariant, unpublishVariant } from '@/lib/portfolio/variant-publish'
import { resolvePortfolioSettings } from '@/lib/portfolio/variant-settings'
import { saveResumeProfile } from '@/lib/resume/service'
import { createVariant, loadVariant, saveRecipe, VariantError } from '@/lib/variants/service'
import { fakeGitHub, type FakeGitHub } from '@/tests/fixtures/fake-github'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'
import { makeUser } from '@/tests/factories'

const TOKEN = 'github_pat_11SYNTHETIC0000000000_abcdefghijklmnopqrstuvwxyz0123456789'
const TARGET = { owner: 'example-asha', repo: 'portfolio', path: 'profile.json' }
const FILE = 'variants/gcc-payments.json'
const NOW = new Date('2026-10-06T08:00:00Z')

let gh: FakeGitHub

async function setup(opts: { publish?: boolean } = {}): Promise<{ userId: string; variantId: string }> {
  const me = await makeUser()
  await saveResumeProfile(me.id, syntheticProfile())
  await publishQ.saveConfig(me.id, { repo: `${TARGET.owner}/${TARGET.repo}`, branch: 'main', path: TARGET.path })
  await keysQ.upsert(me.id, 'github_portfolio', TOKEN)
  const v = await createVariant(me.id, { region: 'gcc', roleFamily: null, name: 'GCC · Payments' })
  if (opts.publish !== false) {
    const settings = await resolvePortfolioSettings(me.id, v, v.name, { publishToPortfolio: true, slug: '' })
    await variantsQ.updateMeta(me.id, v.id, settings)
  }
  gh = fakeGitHub({ ...TARGET, token: TOKEN })
  vi.stubGlobal('fetch', gh.fetch)
  return { userId: me.id, variantId: v.id }
}

async function publishedVersions(variantId: string): Promise<number[]> {
  const rows = await db
    .select({ version: s.resumeVariantVersions.version, at: s.resumeVariantVersions.publishedAt })
    .from(s.resumeVariantVersions)
    .where(eq(s.resumeVariantVersions.variantId, variantId))
  return rows.filter((r) => r.at !== null).map((r) => r.version).sort()
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('publishVariant', () => {
  it('writes variants/<slug>.json with the profile.json conventions and records it', async () => {
    const { userId, variantId } = await setup()
    const info = vi.spyOn(logger, 'info')
    const r = await publishVariant(userId, variantId, { now: NOW })
    expect(r).toMatchObject({ status: 'published', version: '1.0.0', pageUrl: 'https://asha.example.dev/resume/gcc-payments.html' })
    expect(gh.puts).toHaveLength(1)
    expect(gh.puts[0]).toMatchObject({ path: FILE, sha: null })
    expect(gh.puts[0]!.message).toBe(`chore(profile): sync variant gcc-payments from lee\n\nFirst sync of ${FILE} from lee.`)
    expect(gh.file()).toBeNull() // profile.json untouched
    const written = JSON.parse(gh.fileAt(FILE)!) as { meta: { canonical: string }; basics: Record<string, unknown> }
    expect(written.meta.canonical).toBe('https://asha.example.dev/variants/gcc-payments.json')
    expect(gh.fileAt(FILE)).not.toContain('+971 50 000 0000')
    expect(gh.fileAt(FILE)).not.toContain('Indian')

    const v = await variantsQ.getById(userId, variantId)
    expect(v).toMatchObject({ portfolioLastSha: gh.shaAt(FILE), portfolioLastVersion: '1.0.0', portfolioPublishedAt: NOW })
    expect(v?.portfolioCommitUrl).toContain('/commit/')
    expect(await publishedVersions(variantId)).toEqual([1])
    const logged = JSON.stringify(info.mock.calls)
    expect(logged).toContain('variant_published')
    expect(logged).not.toContain(TOKEN)
    expect(logged).not.toContain('Asha')
  })

  it('is up to date when nothing changed; a new recipe version publishes 1.0.1 and is marked published too', async () => {
    const { userId, variantId } = await setup()
    await publishVariant(userId, variantId, { now: NOW })
    expect(await publishVariant(userId, variantId, { now: NOW })).toMatchObject({ status: 'up_to_date' })
    expect(gh.puts).toHaveLength(1)
    const { recipe } = await loadVariant(userId, variantId)
    await saveRecipe(userId, variantId, { ...recipe, headline: 'Payments Backend Engineer' })
    const r = await publishVariant(userId, variantId, { now: NOW })
    expect(r).toMatchObject({ status: 'published', version: '1.0.1' })
    expect(gh.puts[1]!.message).toBe('chore(profile): sync variant gcc-payments from lee\n\nUpdated: basics.')
    expect(await publishedVersions(variantId)).toEqual([1, 2])
  })

  it('a hand edit is never overwritten silently; the user can overwrite it with lee’s version', async () => {
    const { userId, variantId } = await setup()
    await publishVariant(userId, variantId, { now: NOW })
    const edited = JSON.parse(gh.fileAt(FILE)!) as { basics: { summary: string } }
    edited.basics.summary = 'Edited on GitHub.'
    gh.editAt(FILE, `${JSON.stringify(edited, null, 2)}\n`)
    const r = await publishVariant(userId, variantId, { now: NOW })
    expect(r).toMatchObject({ status: 'conflict', reason: 'edited', repoSha: gh.shaAt(FILE) })
    if (r.status !== 'conflict') return
    expect(r.diff.map((d) => d.section)).toEqual(['basics'])
    expect(gh.puts).toHaveLength(1)

    // Overwriting against a stale sha is refused with a fresh diff.
    expect(await publishVariant(userId, variantId, { now: NOW, overwriteSha: '0'.repeat(40) })).toMatchObject({ status: 'conflict', reason: 'changed_during_publish' })
    const done = await publishVariant(userId, variantId, { now: NOW, overwriteSha: r.repoSha })
    expect(done.status).toBe('published')
    expect(gh.fileAt(FILE)).not.toContain('Edited on GitHub.')
  })

  it('409 on PUT → re-fetch and show the diff', async () => {
    const { userId, variantId } = await setup()
    gh.raceNextPut('{"basics": {"name": "Someone else"}}\n')
    const r = await publishVariant(userId, variantId, { now: NOW })
    expect(r).toMatchObject({ status: 'conflict', reason: 'changed_during_publish' })
  })

  it('a file deleted outside lee is reported, not recreated silently', async () => {
    const { userId, variantId } = await setup()
    await publishVariant(userId, variantId, { now: NOW })
    gh.editAt(FILE, null)
    expect(await publishVariant(userId, variantId, { now: NOW })).toMatchObject({ status: 'conflict', reason: 'deleted', repoSha: null })
    expect(await publishVariant(userId, variantId, { now: NOW, overwriteSha: null })).toMatchObject({ status: 'published' })
  })

  it('refuses invalid files and missing settings before sending anything', async () => {
    const { userId, variantId } = await setup()
    const p = syntheticProfile()
    await saveResumeProfile(userId, { ...p, portfolio: { ...p.portfolio, canonical: '' } })
    const r = await publishVariant(userId, variantId, { now: NOW })
    expect(r).toMatchObject({ status: 'invalid', errors: [expect.stringMatching(/canonical URL/)] })
    const preview = await previewVariant(userId, variantId, NOW)
    expect(preview.errors).toHaveLength(1)

    await saveResumeProfile(userId, { ...p, basics: { ...p.basics, profiles: p.basics.profiles.filter((x) => x.network !== 'GitHub') } })
    expect(await publishVariant(userId, variantId, { now: NOW })).toMatchObject({ status: 'invalid', errors: [expect.stringMatching(/GitHub/)] })
    expect(gh.requests).toHaveLength(0)
  })

  it('only variants with the toggle on are published', async () => {
    const { userId, variantId } = await setup({ publish: false })
    expect(await publishVariant(userId, variantId, { now: NOW })).toMatchObject({ status: 'not_configured' })
    expect(gh.requests).toHaveLength(0)
  })
})

describe('unpublishVariant', () => {
  it('deletes the file through the contents API and turns the toggle off; published versions stay marked', async () => {
    const { userId, variantId } = await setup()
    await publishVariant(userId, variantId, { now: NOW })
    const sha = gh.shaAt(FILE)
    const r = await unpublishVariant(userId, variantId)
    expect(r).toMatchObject({ status: 'removed' })
    expect(gh.deletes).toEqual([{ path: FILE, sha, message: 'chore(profile): remove variant gcc-payments (lee)' }])
    expect(gh.fileAt(FILE)).toBeNull()
    const v = await variantsQ.getById(userId, variantId)
    expect(v).toMatchObject({ publishToPortfolio: false, portfolioLastSha: null, portfolioSlug: 'gcc-payments' })
    expect(await publishedVersions(variantId)).toEqual([1])
  })

  it('a file already gone just clears the state', async () => {
    const { userId, variantId } = await setup()
    await publishVariant(userId, variantId, { now: NOW })
    gh.editAt(FILE, null)
    expect(await unpublishVariant(userId, variantId)).toMatchObject({ status: 'removed', commitUrl: null })
    expect(gh.deletes).toHaveLength(0)
  })
})

describe('portfolio settings of a variant', () => {
  it('derives a unique slug from the name, keeps it while published and refuses a plain toggle-off', async () => {
    const { userId, variantId } = await setup()
    const twin = await createVariant(userId, { region: 'gcc', roleFamily: null, name: 'GCC · Payments' })
    const twinSettings = await resolvePortfolioSettings(userId, twin, twin.name, { publishToPortfolio: true, slug: '' })
    expect(twinSettings.portfolioSlug).toBe('gcc-payments-2')
    await expect(resolvePortfolioSettings(userId, twin, twin.name, { publishToPortfolio: true, slug: 'gcc-payments' })).rejects.toThrow(/already uses/)
    await expect(resolvePortfolioSettings(userId, twin, twin.name, { publishToPortfolio: true, slug: 'Bad Slug' })).rejects.toBeInstanceOf(VariantError)

    await publishVariant(userId, variantId, { now: NOW })
    const published = (await variantsQ.getById(userId, variantId))!
    await expect(resolvePortfolioSettings(userId, published, published.name, { publishToPortfolio: false, slug: '' })).rejects.toThrow(/unpublish/i)
    await expect(resolvePortfolioSettings(userId, published, published.name, { publishToPortfolio: true, slug: 'other' })).rejects.toThrow(/Unpublish/)
    expect(await resolvePortfolioSettings(userId, published, 'Renamed', { publishToPortfolio: true, slug: '' })).toEqual({
      publishToPortfolio: true,
      portfolioSlug: 'gcc-payments',
    })
  })

  it('is off by default', async () => {
    const me = await makeUser()
    await saveResumeProfile(me.id, syntheticProfile())
    const v = await createVariant(me.id, { region: 'remote', roleFamily: null })
    const [row] = await db.select().from(s.resumeVariants).where(and(eq(s.resumeVariants.userId, me.id), eq(s.resumeVariants.id, v.id)))
    expect(row).toMatchObject({ publishToPortfolio: false, portfolioSlug: null, portfolioLastSha: null })
  })
})
