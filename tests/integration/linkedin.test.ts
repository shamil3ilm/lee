import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import * as connQ from '@/lib/db/queries/integrationConnections'
import * as linkedinQ from '@/lib/db/queries/linkedin'
import { integrationConnections } from '@/lib/db/schema'
import { isEncrypted } from '@/lib/crypto/token-vault'
import { clearJwksCache } from '@/lib/integrations/linkedin/oauth'
import { completeLinkedInConnect, disconnectLinkedIn, getLinkedInStatus, startLinkedInConnect } from '@/lib/integrations/linkedin/service'
import { draftPost, listComposerSources, publishPost } from '@/lib/integrations/linkedin/composer'
import { importConnections, referralHint } from '@/lib/integrations/linkedin/connections'
import { suggestProfileRewrites } from '@/lib/integrations/linkedin/optimizer-service'
import { saveResumeProfile } from '@/lib/resume/service'
import { logger } from '@/lib/logger'
import { fakeLinkedIn, MEMBER_SUB, type FakeLinkedIn } from '@/tests/fixtures/fake-linkedin'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'
import { makeUser } from '@/tests/factories'

const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

let li: FakeLinkedIn
const KEYS = ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_WEB_URL', 'LINKEDIN_API_URL']
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  li = fakeLinkedIn()
  clearJwksCache()
  for (const k of KEYS) saved[k] = process.env[k]
  delete process.env.LINKEDIN_WEB_URL
  delete process.env.LINKEDIN_API_URL
  Object.assign(process.env, li.env)
  vi.stubGlobal('fetch', li.fetch)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

async function connect(userId: string, posting = true): Promise<void> {
  const start = await startLinkedInConnect(userId, { posting })
  if (!start.ok) throw new Error(start.error)
  const { code, state } = li.authorize(start.url)
  expect(await completeLinkedInConnect(userId, { code, state, cookieState: state })).toEqual({ ok: true })
}

describe('Connect LinkedIn (OIDC)', () => {
  it('asks for openid profile email, plus w_member_social only when posting is on', async () => {
    const me = await makeUser()
    const a = await startLinkedInConnect(me.id, { posting: false })
    const b = await startLinkedInConnect(me.id, { posting: true })
    if (!a.ok || !b.ok) throw new Error('start failed')
    expect(new URL(a.url).searchParams.get('scope')).toBe('openid profile email')
    expect(new URL(b.url).searchParams.get('scope')).toBe('openid profile email w_member_social')
    expect(new URL(b.url).searchParams.get('nonce')).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(new URL(b.url).origin + new URL(b.url).pathname).toBe('https://www.linkedin.com/oauth/v2/authorization')
  })

  it('verifies the id_token, stores name / photo / email and the token encrypted with its expiry', async () => {
    const me = await makeUser()
    await connect(me.id)
    const s = await getLinkedInStatus(me.id)
    expect(s).toMatchObject({ connected: true, name: 'Asha Example', email: 'asha@example.com', canPost: true, expired: false })
    expect(new Date(s.expiresAt!).getTime()).toBeGreaterThan(Date.now() + 59 * 86_400_000)
    const [row] = await db.select().from(integrationConnections).where(eq(integrationConnections.userId, me.id))
    expect(isEncrypted(row!.tokens)).toBe(true)
    expect(JSON.stringify(row)).not.toContain(li.issued[0])
    expect(row!.accountId).toBe(MEMBER_SUB)
  })

  it('rejects a state mismatch and an id_token whose nonce is not ours', async () => {
    const me = await makeUser()
    const start = await startLinkedInConnect(me.id, { posting: false })
    if (!start.ok) throw new Error(start.error)
    const { code, state } = li.authorize(start.url)
    expect(await completeLinkedInConnect(me.id, { code, state, cookieState: 'other' })).toEqual({ ok: false, reason: 'state' })
    li.state.tamperNonce = true
    const again = await startLinkedInConnect(me.id, { posting: false })
    if (!again.ok) throw new Error(again.error)
    const second = li.authorize(again.url)
    expect(await completeLinkedInConnect(me.id, { code: second.code, state: second.state, cookieState: second.state })).toEqual({ ok: false, reason: 'id_token' })
    expect(await connQ.get(me.id, 'linkedin')).toBeNull()
  })

  it('Disconnect deletes the token', async () => {
    const me = await makeUser()
    await connect(me.id)
    expect(await disconnectLinkedIn(me.id)).toEqual({ ok: true })
    expect((await getLinkedInStatus(me.id)).connected).toBe(false)
  })
})

describe('Post composer', () => {
  it('drafts from one source, fact-locked, without posting anything', async () => {
    const me = await makeUser()
    await saveResumeProfile(me.id, syntheticProfile())
    await connect(me.id)
    const { FixtureAIProvider } = await import('@/lib/ai/fixtures')
    const ai = await import('@/lib/ai')
    vi.spyOn(ai, 'getAIProviderForUser').mockResolvedValue(new FixtureAIProvider())
    const sources = await listComposerSources(me.id)
    expect(sources.map((s) => s.kind)).toEqual(expect.arrayContaining(['achievement', 'case_study', 'open_to_work']))
    const caseStudy = sources.find((s) => s.kind === 'case_study')!
    const r = await draftPost(me.id, caseStudy.id)
    expect(r).toMatchObject({ ok: true, aiUsed: true })
    if (r.ok) expect(r.text).toContain('https://asha.example.dev/case-payouts.html')
    expect(li.posts).toHaveLength(0)
  })

  it('falls back to the plain facts when the AI draft invents a number', async () => {
    const me = await makeUser()
    await saveResumeProfile(me.id, syntheticProfile())
    const { FixtureAIProvider } = await import('@/lib/ai/fixtures')
    const ai = await import('@/lib/ai')
    vi.spyOn(ai, 'getAIProviderForUser').mockResolvedValue(new FixtureAIProvider({ draftLinkedInPost: () => ({ text: 'We grew revenue 300% in a week.' }) }))
    const source = (await listComposerSources(me.id)).find((s) => s.kind === 'open_to_work')!
    const r = await draftPost(me.id, source.id)
    expect(r).toMatchObject({ ok: true, aiUsed: false })
    if (r.ok) expect(r.text).not.toContain('300')
  })

  it('posts only through publishPost with the Share payload shape, and keeps a history', async () => {
    const me = await makeUser()
    await saveResumeProfile(me.id, syntheticProfile())
    await connect(me.id)
    const text = 'Designed an idempotent payouts API in Go handling 2M+ requests per day (#payments).'
    const r = await publishPost(me.id, { text, sourceId: null, sourceKind: 'custom' })
    expect(r).toEqual({ ok: true, url: 'https://www.linkedin.com/feed/update/urn:li:share:7000000000000000001/' })
    expect(li.posts).toHaveLength(1)
    expect(li.posts[0]!.headers['linkedin-version']).toMatch(/^\d{6}$/)
    expect(li.posts[0]!.headers['x-restli-protocol-version']).toBe('2.0.0')
    expect(li.posts[0]!.body).toEqual({
      author: `urn:li:person:${MEMBER_SUB}`,
      commentary: 'Designed an idempotent payouts API in Go handling 2M+ requests per day \\(\\#payments\\).',
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    })
    const history = await linkedinQ.listPosts(me.id)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ sourceKind: 'custom', postUrn: 'urn:li:share:7000000000000000001' })
  })

  it('refuses numbers or links that are not in the profile, a connection without posting, and an unconfirmed action', async () => {
    const me = await makeUser()
    await saveResumeProfile(me.id, syntheticProfile())
    await connect(me.id, false)
    expect(await publishPost(me.id, { text: 'Hello', sourceId: null, sourceKind: 'custom' })).toEqual({ ok: false, error: 'Reconnect LinkedIn with posting turned on.' })
    await connect(me.id, true)
    const bad = await publishPost(me.id, { text: 'Cut costs by 73% — see https://evil.example.com', sourceId: null, sourceKind: 'custom' })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error).toMatch(/73.*evil\.example\.com/)
    sessionMock.mockResolvedValue(me.id)
    const { publishPostAction } = await import('@/app/(authed)/settings/linkedin/actions')
    expect(await publishPostAction({ text: 'Hello from lee', sourceId: null, sourceKind: 'custom' })).toEqual({ ok: false, error: 'Preview the post and click Post to publish it.' })
    expect(li.posts).toHaveLength(0)
    expect(await publishPostAction({ text: 'Hello from lee', sourceId: null, sourceKind: 'custom', confirmed: true })).toMatchObject({ ok: true })
    expect(li.posts).toHaveLength(1)
  })

  it('never logs the LinkedIn token', async () => {
    const me = await makeUser()
    await saveResumeProfile(me.id, syntheticProfile())
    const spies = [vi.spyOn(logger, 'info'), vi.spyOn(logger, 'warn'), vi.spyOn(logger, 'error')]
    await connect(me.id)
    li.state.postStatus = 401
    await publishPost(me.id, { text: 'Hello from lee', sourceId: null, sourceKind: 'custom' })
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls))
    expect(logged).not.toContain(li.issued[0])
    expect(logged).toContain('linkedin_post_failed')
  })
})

describe('Connections and referral hints', () => {
  const rows = [
    { firstName: 'Rami', lastName: 'Example', company: 'Careem Networks FZ-LLC', position: 'Engineering Manager', connectedOn: '2023-03-15', email: 'rami@example.com' },
    { firstName: 'Noor', lastName: 'Example', company: 'careem', position: 'Recruiter', connectedOn: '2024-01-02', email: '' },
    { firstName: 'Omar', lastName: 'Example', company: 'Talabat', position: 'Backend Engineer', connectedOn: '', email: '' },
  ]

  it('stores compactly (no email unless opted in), re-imports idempotently and builds hints by company', async () => {
    const me = await makeUser()
    await importConnections(me.id, rows, false)
    await importConnections(me.id, rows, false)
    expect(await linkedinQ.countConnections(me.id)).toBe(3)
    const all = await linkedinQ.searchConnections(me.id, '')
    expect(all.every((r) => r.email === null)).toBe(true)
    const hint = await referralHint(me.id, 'Careem')
    expect(hint).toMatchObject({ company: 'Careem', count: 2 })
    expect(hint!.people.map((p) => p.name).sort()).toEqual(['Noor Example', 'Rami Example'])
    expect(await referralHint(me.id, 'Unknown Co')).toBeNull()
    const other = await makeUser()
    expect(await referralHint(other.id, 'Careem')).toBeNull()
  })

  it('keeps emails only when opted in; search and delete all', async () => {
    const me = await makeUser()
    await importConnections(me.id, rows, true)
    expect((await linkedinQ.searchConnections(me.id, 'Rami'))[0]!.email).toBe('rami@example.com')
    expect((await linkedinQ.searchConnections(me.id, 'talabat')).map((r) => r.name)).toEqual(['Omar Example'])
    expect(await linkedinQ.deleteAllConnections(me.id)).toBe(3)
    expect(await linkedinQ.countConnections(me.id)).toBe(0)
  })
})

describe('Profile optimizer', () => {
  it('keeps only fact-locked suggestions', async () => {
    const me = await makeUser()
    await saveResumeProfile(me.id, syntheticProfile())
    const { FixtureAIProvider } = await import('@/lib/ai/fixtures')
    const ai = await import('@/lib/ai')
    vi.spyOn(ai, 'getAIProviderForUser').mockResolvedValue(
      new FixtureAIProvider({
        suggestLinkedInProfile: () => ({
          headlines: ['Backend Engineer | Go · PostgreSQL', 'Backend Engineer with 12 years of experience'],
          about: 'I build payment systems handling 2M+ requests per day.',
        }),
      }),
    )
    const r = await suggestProfileRewrites(me.id)
    expect(r).toEqual({ ok: true, headlines: ['Backend Engineer | Go · PostgreSQL'], about: 'I build payment systems handling 2M+ requests per day.', dropped: 1 })
  })
})
