import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import * as connQ from '@/lib/db/queries/integrationConnections'
import * as statsQ from '@/lib/db/queries/githubRepoStats'
import { integrationConnections, oauthStates } from '@/lib/db/schema'
import { isEncrypted } from '@/lib/crypto/token-vault'
import { completeGitHubConnect, disconnectGitHub, getGitHubStatus, startGitHubConnect, testGitHub } from '@/lib/integrations/github/service'
import { getGitHubUserToken } from '@/lib/integrations/github/token'
import { pruneIntegrationScratch } from '@/lib/db/retention/github'
import { logger } from '@/lib/logger'
import { fakeGitHubApp, type FakeGitHubApp } from '@/tests/fixtures/fake-github-app'
import { makeUser } from '@/tests/factories'

let gh: FakeGitHubApp
const saved: Record<string, string | undefined> = {}
const KEYS = ['GITHUB_APP_ID', 'GITHUB_APP_CLIENT_ID', 'GITHUB_APP_CLIENT_SECRET', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_APP_SLUG', 'GITHUB_API_URL', 'GITHUB_WEB_URL']

beforeEach(() => {
  gh = fakeGitHubApp()
  for (const k of KEYS) saved[k] = process.env[k]
  delete process.env.GITHUB_API_URL
  delete process.env.GITHUB_WEB_URL
  Object.assign(process.env, gh.env)
  vi.stubGlobal('fetch', gh.fetch)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

async function connect(userId: string): Promise<void> {
  const start = await startGitHubConnect(userId)
  if (!start.ok) throw new Error(start.error)
  const { code, state } = gh.authorize(start.url)
  const r = await completeGitHubConnect(userId, { code, state, cookieState: state })
  expect(r).toEqual({ ok: true, login: 'example-asha' })
}

describe('Connect GitHub (GitHub App user authorization)', () => {
  it('starts with state + S256 PKCE and the registered callback', async () => {
    const me = await makeUser()
    const r = await startGitHubConnect(me.id)
    if (!r.ok) throw new Error(r.error)
    const u = new URL(r.url)
    expect(u.origin + u.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(u.searchParams.get('state')).toBe(r.state)
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    expect(u.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(u.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/integrations/github/callback')
    // The state is stored hashed, never raw, with an encrypted verifier.
    const rows = await db.select().from(oauthStates)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.stateHash).not.toBe(r.state)
    expect(isEncrypted(rows[0]!.secret)).toBe(true)
  })

  it('rejects a state that does not match the cookie, an unknown state, and a reused state', async () => {
    const me = await makeUser()
    const start = await startGitHubConnect(me.id)
    if (!start.ok) throw new Error(start.error)
    const { code, state } = gh.authorize(start.url)
    expect(await completeGitHubConnect(me.id, { code, state, cookieState: 'attacker-state' })).toEqual({ ok: false, reason: 'state' })
    expect(await completeGitHubConnect(me.id, { code, state: 'unknown', cookieState: 'unknown' })).toEqual({ ok: false, reason: 'state' })
    expect(await completeGitHubConnect(me.id, { code, state, cookieState: state })).toMatchObject({ ok: true })
    expect(await completeGitHubConnect(me.id, { code, state, cookieState: state })).toEqual({ ok: false, reason: 'state' })
  })

  it("never completes another user's authorization (per-user, no owner fallback)", async () => {
    const owner = await makeUser()
    const invitee = await makeUser()
    const start = await startGitHubConnect(owner.id)
    if (!start.ok) throw new Error(start.error)
    const { code, state } = gh.authorize(start.url)
    expect(await completeGitHubConnect(invitee.id, { code, state, cookieState: state })).toEqual({ ok: false, reason: 'state' })
    await connect(invitee.id)
    expect(await connQ.get(owner.id, 'github')).toBeNull()
    expect((await getGitHubStatus(owner.id)).connected).toBe(false)
  })

  it('rejects an expired state', async () => {
    const me = await makeUser()
    const start = await startGitHubConnect(me.id, new Date(Date.now() - 11 * 60_000))
    if (!start.ok) throw new Error(start.error)
    const { code, state } = gh.authorize(start.url)
    expect(await completeGitHubConnect(me.id, { code, state, cookieState: state })).toEqual({ ok: false, reason: 'state' })
  })

  it('stores the tokens encrypted at rest and never logs them', async () => {
    const me = await makeUser()
    const spies = [vi.spyOn(logger, 'info'), vi.spyOn(logger, 'warn'), vi.spyOn(logger, 'error')]
    await connect(me.id)
    const [row] = await db.select().from(integrationConnections).where(eq(integrationConnections.userId, me.id))
    expect(isEncrypted(row!.tokens)).toBe(true)
    const raw = JSON.stringify(row)
    for (const t of gh.issued) expect(raw).not.toContain(t)
    const tokens = await connQ.getTokens(me.id, 'github')
    expect(tokens?.access).toBe(gh.issued[0])
    expect(tokens?.refresh).toBe(gh.issued[1])
    expect(row!.installationId).toBe('777')
    expect(row!.scopes).toEqual(['contents:write', 'metadata:read'])
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls))
    for (const t of gh.issued) expect(logged).not.toContain(t)
    expect(logged).toContain('github_connected')
  })

  it('shows login, avatar, installed repos and permissions', async () => {
    const me = await makeUser()
    await connect(me.id)
    const s = await getGitHubStatus(me.id)
    expect(s).toMatchObject({
      configured: true,
      connected: true,
      login: 'example-asha',
      installed: true,
      permissions: ['contents:write', 'metadata:read'],
      manageUrl: 'https://github.com/settings/installations/777',
      installUrl: 'https://github.com/apps/lee-test-app/installations/new',
    })
    expect(s.repos.map((r) => r.fullName)).toEqual(['example-asha/portfolio', 'example-asha/payouts-engine'])
    expect(s.repos[1]!.isPrivate).toBe(true)
  })

  it('refreshes an expiring token, stores the rotated pair, and reports expiry when refresh is refused', async () => {
    const me = await makeUser()
    await connect(me.id)
    await db.update(integrationConnections).set({ accessExpiresAt: new Date(Date.now() - 1000) }).where(eq(integrationConnections.userId, me.id))
    const r = await getGitHubUserToken(me.id)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.token).toBe(gh.issued[2])
    expect(gh.tokenRequests.at(-1)).toMatchObject({ grant_type: 'refresh_token', refresh_token: gh.issued[1] })
    expect((await connQ.getTokens(me.id, 'github'))?.refresh).toBe(gh.issued[3])
    await db.update(integrationConnections).set({ accessExpiresAt: new Date(Date.now() - 1000) }).where(eq(integrationConnections.userId, me.id))
    gh.state.nextRefreshFails = true
    expect(await getGitHubUserToken(me.id)).toEqual({ ok: false, reason: 'expired' })
    expect((await getGitHubStatus(me.id)).needsReconnect).toBe(true)
  })

  it('Test checks the token and the installation', async () => {
    const me = await makeUser()
    expect(await testGitHub(me.id)).toEqual({ ok: false, message: 'Connect GitHub first.' })
    await connect(me.id)
    expect(await testGitHub(me.id)).toEqual({ ok: true, message: 'Connected as example-asha; the app is installed.' })
  })

  it('Disconnect revokes the grant at GitHub and deletes tokens and cached stats', async () => {
    const me = await makeUser()
    await connect(me.id)
    await statsQ.upsert(me.id, { fullName: 'example-asha/portfolio', isPrivate: false, htmlUrl: 'https://github.com/example-asha/portfolio', description: null, topics: [], languages: [], stars: 0, pushedAt: null, lastCommitAt: null, userCommits: 1, userPrs: 0 }, new Date())
    const r = await disconnectGitHub(me.id)
    expect(r).toEqual({ ok: true, revoked: true })
    expect(gh.revoked).toEqual([gh.issued[0]])
    expect(await connQ.get(me.id, 'github')).toBeNull()
    expect(await statsQ.count(me.id)).toBe(0)
  })

  it('rate-limits connect attempts', async () => {
    const me = await makeUser()
    for (let i = 0; i < 10; i += 1) expect((await startGitHubConnect(me.id)).ok).toBe(true)
    expect(await startGitHubConnect(me.id)).toEqual({ ok: false, error: 'Too many connect attempts. Please wait a few minutes.' })
  })

  it('shows "not configured" with the missing env vars', async () => {
    const me = await makeUser()
    delete process.env.GITHUB_APP_PRIVATE_KEY
    const s = await getGitHubStatus(me.id)
    expect(s).toMatchObject({ configured: false, missingEnv: ['GITHUB_APP_PRIVATE_KEY'] })
    expect(await startGitHubConnect(me.id)).toEqual({ ok: false, error: 'GitHub is not configured on this deployment yet.' })
  })

  it('retention deletes abandoned states', async () => {
    const me = await makeUser()
    await startGitHubConnect(me.id, new Date('2026-01-01T00:00:00Z'))
    expect(await pruneIntegrationScratch(new Date('2026-01-03T00:00:00Z'))).toBeGreaterThanOrEqual(1)
    expect(await db.select().from(oauthStates)).toHaveLength(0)
  })
})
