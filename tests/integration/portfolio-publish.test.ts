import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as keysQ from '@/lib/db/queries/labProviderKeys'
import * as publishQ from '@/lib/db/queries/portfolioPublish'
import { logger } from '@/lib/logger'
import { checkPortfolioToken } from '@/lib/portfolio/token-check'
import { COMMIT_SUBJECT, previewPublish, publishProfile } from '@/lib/portfolio/publish'
import { getResumeProfile, saveResumeProfile } from '@/lib/resume/service'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'
import { fakeGitHub, type FakeGitHub } from '@/tests/fixtures/fake-github'
import { makeUser } from '@/tests/factories'

const TOKEN = 'github_pat_11SYNTHETIC0000000000_abcdefghijklmnopqrstuvwxyz0123456789'
const TARGET = { owner: 'example-asha', repo: 'portfolio', path: 'profile.json' }
const NOW = new Date('2026-10-06T08:00:00Z')

let gh: FakeGitHub

async function setup(initial?: string): Promise<string> {
  const me = await makeUser()
  await saveResumeProfile(me.id, syntheticProfile())
  await publishQ.saveConfig(me.id, { repo: `${TARGET.owner}/${TARGET.repo}`, branch: 'main', path: TARGET.path })
  await keysQ.upsert(me.id, 'github_portfolio', TOKEN)
  gh = fakeGitHub({ ...TARGET, token: TOKEN, initial })
  vi.stubGlobal('fetch', gh.fetch)
  return me.id
}

beforeEach(() => {
  delete process.env.GITHUB_API_URL
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('publishProfile', () => {
  it('creates profile.json, records sha + hash, and never logs the token or content', async () => {
    const userId = await setup()
    const info = vi.spyOn(logger, 'info')
    const r = await publishProfile(userId, { now: NOW })
    expect(r).toMatchObject({ status: 'published', version: '1.0.0', publishedAt: NOW.toISOString() })
    expect(gh.puts).toHaveLength(1)
    expect(gh.puts[0]!.message.split('\n')[0]).toBe(COMMIT_SUBJECT)
    expect(gh.puts[0]!.sha).toBeNull()
    const written = JSON.parse(gh.file()!) as Record<string, unknown>
    expect(written.basics).toMatchObject({ name: 'Asha Menon' })
    expect(gh.file()).not.toContain('+971 50 000 0000')
    const state = await publishQ.get(userId)
    expect(state).toMatchObject({ lastSha: gh.sha(), lastVersion: '1.0.0' })
    expect(state?.lastHash).toMatch(/^[0-9a-f]{64}$/)
    expect(state?.lastCommitUrl).toContain('/commit/')
    const logged = JSON.stringify(info.mock.calls)
    expect(logged).toContain('profile_published')
    expect(logged).not.toContain(TOKEN)
    expect(logged).not.toContain('Asha')
    expect(gh.requests.every((q) => !q.url.includes(TOKEN))).toBe(true)
  })

  it('is up to date when nothing changed, and bumps the version when something did', async () => {
    const userId = await setup()
    await publishProfile(userId, { now: NOW })
    expect(await publishProfile(userId, { now: NOW })).toEqual({ status: 'up_to_date' })
    expect(gh.puts).toHaveLength(1)
    const p = syntheticProfile()
    await saveResumeProfile(userId, { ...p, basics: { ...p.basics, label: 'Payments Engineer' } })
    const r = await publishProfile(userId, { now: NOW })
    expect(r).toMatchObject({ status: 'published', version: '1.0.1' })
    expect(gh.puts[1]!.message).toBe(`${COMMIT_SUBJECT}\n\nUpdated: basics.`)
    expect(gh.puts[1]!.sha).not.toBeNull()
  })

  it('a hand edit (sha mismatch) yields a field diff, and nothing is written until the user decides', async () => {
    const userId = await setup()
    await publishProfile(userId, { now: NOW })
    const edited = JSON.parse(gh.file()!) as { work: Array<{ highlights: string[] }> }
    edited.work[0]!.highlights[0] = 'Designed an idempotent payouts API in Go handling 2M+ requests per day, end to end.'
    gh.editByHand(`${JSON.stringify(edited, null, 2)}\n`)
    const p = syntheticProfile()
    await saveResumeProfile(userId, { ...p, basics: { ...p.basics, label: 'Payments Engineer' } })

    const r = await publishProfile(userId, { now: NOW })
    expect(r.status).toBe('conflict')
    if (r.status !== 'conflict') return
    expect(r.reason).toBe('edited')
    expect(r.repoSha).toBe(gh.sha())
    expect(r.diff.map((d) => d.section)).toEqual(['basics', 'work'])
    expect(gh.puts).toHaveLength(1)

    // Keep lee's basics, take the repo's work.
    const done = await publishProfile(userId, { now: NOW, resolution: { repoSha: r.repoSha, choices: { basics: 'lee', work: 'repo' } } })
    expect(done.status).toBe('published')
    const out = JSON.parse(gh.file()!) as { basics: { label: string }; work: Array<{ highlights: string[] }> }
    expect(out.basics.label).toBe('Payments Engineer')
    expect(out.work[0]!.highlights[0]).toContain('end to end')
    // The repo's wording is now a lee fact (one source), same highlight id.
    const { profile } = await getResumeProfile(userId)
    expect(profile.work[0]!.highlights[0]).toMatchObject({ id: 'h-payouts', text: expect.stringContaining('end to end') })
  })

  it('a first publish over an existing, different file asks before overwriting it', async () => {
    const userId = await setup('{"basics": {"name": "Someone else"}}\n')
    const r = await publishProfile(userId, { now: NOW })
    expect(r).toMatchObject({ status: 'conflict', reason: 'edited' })
    expect(gh.puts).toHaveLength(0)
  })

  it('409 on PUT → re-fetch and show the new diff', async () => {
    const userId = await setup()
    await publishProfile(userId, { now: NOW })
    const p = syntheticProfile()
    await saveResumeProfile(userId, { ...p, basics: { ...p.basics, label: 'Payments Engineer' } })
    const sneaky = JSON.parse(gh.file()!) as { basics: { summary: string } }
    sneaky.basics.summary = 'Edited on GitHub while lee was publishing.'
    gh.raceNextPut(`${JSON.stringify(sneaky, null, 2)}\n`)
    const r = await publishProfile(userId, { now: NOW })
    expect(r).toMatchObject({ status: 'conflict', reason: 'changed_during_publish', repoSha: gh.sha() })
    if (r.status === 'conflict') expect(r.diff.flatMap((d) => d.changes.map((c) => c.path))).toContain('/basics/summary')
  })

  it('a resolution against an older sha is refused with a fresh diff', async () => {
    const userId = await setup()
    await publishProfile(userId, { now: NOW })
    const first = gh.sha()
    gh.editByHand(gh.file()!.replace('Backend Engineer', 'Backend Developer'))
    const r = await publishProfile(userId, { now: NOW, resolution: { repoSha: first, choices: {} } })
    expect(r).toMatchObject({ status: 'conflict', reason: 'changed_during_publish' })
  })

  it('refuses a file the portfolio build would reject', async () => {
    const userId = await setup()
    const p = syntheticProfile()
    await saveResumeProfile(userId, { ...p, basics: { ...p.basics, profiles: p.basics.profiles.slice(0, 1) } })
    const r = await publishProfile(userId, { now: NOW })
    expect(r).toEqual({ status: 'invalid', errors: ['/basics/profiles: a "LinkedIn" profile is required (used in the footer)'] })
    expect(gh.puts).toHaveLength(0)
    expect((await previewPublish(userId, NOW)).errors).toHaveLength(1)
  })

  it('reports missing configuration', async () => {
    const me = await makeUser()
    expect(await publishProfile(me.id)).toMatchObject({ status: 'not_configured' })
  })
})

describe('checkPortfolioToken', () => {
  const target = { ...TARGET, branch: 'main' }

  it('passes a fine-grained token with read and write, without committing', async () => {
    gh = fakeGitHub({ ...TARGET, token: TOKEN, initial: '{}\n' })
    vi.stubGlobal('fetch', gh.fetch)
    const r = await checkPortfolioToken(target, TOKEN)
    expect(r.ok).toBe(true)
    expect(r.steps.map((s) => s.label)).toEqual(['Fine-grained token', 'Repository access', 'Contents: read', 'Contents: write'])
    expect(gh.file()).toBe('{}\n')
    expect(gh.puts).toHaveLength(0)
  })

  it('fails a read-only token and flags a classic token', async () => {
    const classic = 'ghp_SYNTHETIC0000000000000000000000000000'
    gh = fakeGitHub({ ...TARGET, token: classic, initial: '{}\n', writable: false })
    vi.stubGlobal('fetch', gh.fetch)
    const r = await checkPortfolioToken(target, classic)
    expect(r.ok).toBe(false)
    expect(r.steps.find((s) => s.label === 'Fine-grained token')?.ok).toBe(false)
    expect(r.steps.find((s) => s.label === 'Contents: write')?.ok).toBe(false)
  })

  it('fails a rejected token at the repository step', async () => {
    gh = fakeGitHub({ ...TARGET, token: TOKEN })
    vi.stubGlobal('fetch', gh.fetch)
    const r = await checkPortfolioToken(target, 'github_pat_wrong')
    expect(r.steps.at(-1)).toMatchObject({ label: 'Repository access', ok: false })
  })
})
