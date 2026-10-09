import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as keysQ from '@/lib/db/queries/labProviderKeys'
import * as publishQ from '@/lib/db/queries/portfolioPublish'
import * as statsQ from '@/lib/db/queries/githubRepoStats'
import * as profileQ from '@/lib/db/queries/profile'
import { completeGitHubConnect, startGitHubConnect } from '@/lib/integrations/github/service'
import { refreshRepoStats } from '@/lib/integrations/github/repo-stats'
import { suggestRadarFollows } from '@/lib/integrations/github/follow'
import * as connQ from '@/lib/db/queries/integrationConnections'
import { publishProfile } from '@/lib/portfolio/publish'
import { getResumeProfile, saveResumeProfile } from '@/lib/resume/service'
import { pruneGitHubRepoStats } from '@/lib/db/retention/github'
import { fakeGitHub, type FakeGitHub } from '@/tests/fixtures/fake-github'
import { fakeGitHubApp, type FakeGitHubApp } from '@/tests/fixtures/fake-github-app'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'
import { makeUser } from '@/tests/factories'

const NOW = new Date('2026-10-06T08:00:00Z')
const PAT = 'github_pat_11SYNTHETIC0000000000_abcdefghijklmnopqrstuvwxyz0123456789'
const KEYS = ['GITHUB_APP_ID', 'GITHUB_APP_CLIENT_ID', 'GITHUB_APP_CLIENT_SECRET', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_APP_SLUG', 'GITHUB_API_URL', 'GITHUB_WEB_URL']
const saved: Record<string, string | undefined> = {}

let app: FakeGitHubApp
let contents: FakeGitHub

function setup(token: string): void {
  contents = fakeGitHub({ owner: 'example-asha', repo: 'portfolio', path: 'profile.json', token })
  app = fakeGitHubApp({ contents })
  Object.assign(process.env, app.env)
  vi.stubGlobal('fetch', app.fetch)
}

async function userWithProfile(): Promise<string> {
  const me = await makeUser()
  await saveResumeProfile(me.id, syntheticProfile())
  await publishQ.saveConfig(me.id, { repo: 'example-asha/portfolio', branch: 'main', path: 'profile.json' })
  return me.id
}

async function connect(userId: string): Promise<void> {
  const start = await startGitHubConnect(userId)
  if (!start.ok) throw new Error(start.error)
  const { code, state } = app.authorize(start.url)
  expect((await completeGitHubConnect(userId, { code, state, cookieState: state })).ok).toBe(true)
}

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k]
  delete process.env.GITHUB_API_URL
  delete process.env.GITHUB_WEB_URL
})
afterEach(() => {
  vi.unstubAllGlobals()
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('Publish with the GitHub connection', () => {
  it('uses a repo-scoped installation token when connected (sha flow unchanged)', async () => {
    setup('ghs_SYNTHETICinstallation000000000000000000')
    const userId = await userWithProfile()
    await connect(userId)
    const r = await publishProfile(userId, { now: NOW })
    expect(r).toMatchObject({ status: 'published', version: '1.0.0' })
    expect(contents.puts[0]!.authorization).toBe(`Bearer ${app.installationToken}`)
    expect(app.installationTokenRequests).toEqual([{ repositories: ['portfolio'], permissions: { contents: 'write', metadata: 'read' } }])
    expect(await publishProfile(userId, { now: NOW })).toEqual({ status: 'up_to_date' })
  })

  it('falls back to the fine-grained token when the repo is not in the installation', async () => {
    setup(PAT)
    const userId = await userWithProfile()
    await keysQ.upsert(userId, 'github_portfolio', PAT)
    await connect(userId)
    app.state.refuseRepos.add('portfolio')
    const r = await publishProfile(userId, { now: NOW })
    expect(r).toMatchObject({ status: 'published' })
    expect(contents.puts[0]!.authorization).toBe(`Bearer ${PAT}`)
  })

  it('without a connection, publishes with the fine-grained token as before', async () => {
    setup(PAT)
    const userId = await userWithProfile()
    await keysQ.upsert(userId, 'github_portfolio', PAT)
    expect(await publishProfile(userId, { now: NOW })).toMatchObject({ status: 'published' })
    expect(app.installationTokenRequests).toHaveLength(0)
  })

  it('is not configured with neither a connection nor a token', async () => {
    setup(PAT)
    const userId = await userWithProfile()
    const saveEnv = process.env.GITHUB_PORTFOLIO_TOKEN
    delete process.env.GITHUB_PORTFOLIO_TOKEN
    expect(await publishProfile(userId, { now: NOW })).toEqual({ status: 'not_configured', error: 'Connect GitHub or save a GitHub token first.' })
    if (saveEnv !== undefined) process.env.GITHUB_PORTFOLIO_TOKEN = saveEnv
  })
})

describe('From GitHub: repo evidence', () => {
  it('caches granted (incl. private) and public repos with languages and the user’s commit and PR counts', async () => {
    setup(PAT)
    const userId = await userWithProfile()
    await connect(userId)
    const r = await refreshRepoStats(userId, { now: NOW })
    expect(r).toEqual({ ok: true, refreshed: 2, total: 2 })
    const rows = await statsQ.list(userId)
    const payouts = rows.find((x) => x.fullName === 'example-asha/payouts-engine')!
    expect(payouts).toMatchObject({ isPrivate: true, userCommits: 42, userPrs: 5, stars: 0, topics: ['payments', 'laravel', 'zatca'] })
    expect(payouts.languages).toEqual([
      { name: 'PHP', share: 0.9 },
      { name: 'Blade', share: 0.1 },
    ])
    expect(payouts.lastCommitAt?.toISOString()).toBe('2026-09-19T08:00:00.000Z')
    // Fresh rows are skipped on the next refresh.
    expect(await refreshRepoStats(userId, { now: NOW })).toEqual({ ok: true, refreshed: 0, total: 2 })
  })

  it('linking a repo and refreshing never changes readiness flags', async () => {
    setup(PAT)
    const userId = await userWithProfile()
    await connect(userId)
    await refreshRepoStats(userId, { now: NOW })
    const before = (await getResumeProfile(userId)).profile
    await statsQ.setLink(userId, 'example-asha/payouts-engine', 'pr-ledger')
    await refreshRepoStats(userId, { now: NOW, force: true })
    const after = (await getResumeProfile(userId)).profile
    expect(after.projects.map((p) => [p.interviewReady, p.domainReady])).toEqual(before.projects.map((p) => [p.interviewReady, p.domainReady]))
    expect((await statsQ.get(userId, 'example-asha/payouts-engine'))?.linkedProjectId).toBe('pr-ledger')
  })

  it('retention drops stale unlinked rows and keeps linked ones', async () => {
    setup(PAT)
    const userId = await userWithProfile()
    await connect(userId)
    await refreshRepoStats(userId, { now: NOW })
    await statsQ.setLink(userId, 'example-asha/payouts-engine', 'pr-ledger')
    const later = new Date(NOW.getTime() + 31 * 86_400_000)
    expect(await pruneGitHubRepoStats(later)).toBe(1)
    expect((await statsQ.list(userId)).map((r) => r.fullName)).toEqual(['example-asha/payouts-engine'])
  })
})

describe('Radar follow suggestions', () => {
  it('suggests starred repos (when opted in) and dependencies of followed repos, minus what is already followed', async () => {
    setup(PAT)
    const userId = await userWithProfile()
    await connect(userId)
    await refreshRepoStats(userId, { now: NOW })
    await profileQ.upsert(userId, { radarReleaseProjects: ['php'] })
    await statsQ.setFollowDeps(userId, 'example-asha/payouts-engine', true)
    let r = await suggestRadarFollows(userId)
    expect(r).toMatchObject({ ok: true, starredUnavailable: false })
    if (!r.ok) return
    expect(r.suggestions.map((s) => s.id)).toEqual(['laravel'])
    await connQ.updateMeta(userId, 'github', { settings: { followStarred: true } })
    r = await suggestRadarFollows(userId)
    if (!r.ok) throw new Error(r.error)
    expect(r.suggestions.map((s) => s.id).sort()).toEqual(['gh:honojs/hono', 'laravel', 'nextjs'])
    app.state.starredForbidden = true
    r = await suggestRadarFollows(userId)
    expect(r).toMatchObject({ ok: true, starredUnavailable: true })
  })
})
