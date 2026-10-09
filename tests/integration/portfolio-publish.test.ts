import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as keysQ from '@/lib/db/queries/labProviderKeys'
import * as publishQ from '@/lib/db/queries/portfolioPublish'
import { checkPortfolioToken } from '@/lib/portfolio/token-check'
import { previewPublish } from '@/lib/portfolio/publish'
import { saveResumeProfile } from '@/lib/resume/service'
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

describe('previewPublish', () => {
  it('is lee’s copy of profile.json: public fields only, checked like the portfolio build', async () => {
    const userId = await setup()
    const r = await previewPublish(userId, NOW)
    expect(r.errors).toEqual([])
    expect(r.json).toContain('"name": "Asha Menon"')
    expect(r.json).not.toContain('+971 50 000 0000')
    expect(gh.requests).toHaveLength(0)
  })

  it('names what the portfolio build would reject', async () => {
    const userId = await setup()
    const p = syntheticProfile()
    await saveResumeProfile(userId, { ...p, basics: { ...p.basics, profiles: p.basics.profiles.slice(0, 1) } })
    expect((await previewPublish(userId, NOW)).errors).toEqual(['/basics/profiles: a "LinkedIn" profile is required (used in the footer)'])
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
