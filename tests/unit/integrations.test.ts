import { describe, expect, it } from 'vitest'
import { createSign, generateKeyPairSync } from 'node:crypto'
import { decryptToken, encryptToken, isEncrypted } from '@/lib/crypto/token-vault'
import { githubAppConfig, linkedinAppConfig, normalizePem, safeBase } from '@/lib/integrations/config'
import { assertAllowedUrl } from '@/lib/integrations/http'
import { pkceChallenge } from '@/lib/integrations/oauth-state'
import { createAppJwt } from '@/lib/integrations/github/app-jwt'
import { findAppInstallation, isRepoFullName, lastPage } from '@/lib/integrations/github/api'
import { applyRepoSuggestion, buildRepoSuggestion, reviewHint } from '@/lib/integrations/github/evidence'
import { projectsFromComposerJson, projectsFromPackageJson, projectsFromStarred } from '@/lib/integrations/github/dependencies'
import { cleanProjectIds, releaseProject } from '@/lib/radar/new/projects'
import { IdTokenError, verifyIdToken } from '@/lib/integrations/linkedin/id-token'
import { buildPostPayload, escapeLittleText } from '@/lib/integrations/linkedin/share'
import { buildChecklist } from '@/lib/integrations/linkedin/optimizer'
import { checkPostFacts, profileFactText } from '@/lib/integrations/linkedin/facts'
import { redactText, sanitizeContext } from '@/lib/logs/redact'
import { toEventRow } from '@/lib/logs/sink'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'

describe('token vault', () => {
  it('round-trips, is self-describing, and fails on tampering', () => {
    const enc = encryptToken('ghu_SYNTHETIC123')
    expect(isEncrypted(enc)).toBe(true)
    expect(enc).not.toContain('ghu_')
    expect(decryptToken(enc)).toBe('ghu_SYNTHETIC123')
    expect(isEncrypted('ghu_plain')).toBe(false)
    // Legacy plaintext passes through (the shared vault re-encrypts it on read).
    expect(decryptToken('ghu_plain')).toBe('ghu_plain')
    // enc:v1:<iv>.<tag>.<ciphertext> (base64url): a tampered ciphertext fails authentication.
    const [iv, tag] = enc.slice('enc:v1:'.length).split('.')
    expect(() => decryptToken(`enc:v1:${iv}.${tag}.${Buffer.from('tampered').toString('base64url')}`)).toThrow()
  })
})

describe('config', () => {
  it('lists missing env and normalizes an escaped PEM', () => {
    expect(githubAppConfig({})).toEqual({ ok: false, missing: ['GITHUB_APP_ID', 'GITHUB_APP_CLIENT_ID', 'GITHUB_APP_CLIENT_SECRET', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_APP_SLUG'] })
    expect(linkedinAppConfig({ LINKEDIN_CLIENT_ID: 'x', LINKEDIN_CLIENT_SECRET: ' ' })).toEqual({ ok: false, missing: ['LINKEDIN_CLIENT_SECRET'] })
    expect(normalizePem('-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----')).toBe('-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----')
  })
  it('allows plain-http stub bases only on localhost outside production', () => {
    expect(safeBase('http://localhost:3199', 'https://github.com', { NODE_ENV: 'development' })).toBe('http://localhost:3199')
    expect(safeBase('http://localhost:3199', 'https://github.com', { NODE_ENV: 'production' })).toBe('https://github.com')
    expect(safeBase('http://10.0.0.1', 'https://github.com', { NODE_ENV: 'development' })).toBe('https://github.com')
    expect(safeBase('https://ghe.example.com/', 'https://github.com', {})).toBe('https://ghe.example.com')
  })
  it('only sends requests to the configured provider hosts', () => {
    expect(() => assertAllowedUrl('https://api.github.com/user', ['https://api.github.com'])).not.toThrow()
    expect(() => assertAllowedUrl('https://api.github.com.evil.example/user', ['https://api.github.com'])).toThrow()
    expect(() => assertAllowedUrl('http://169.254.169.254/latest', ['https://api.github.com'])).toThrow()
  })
})

describe('PKCE and the app JWT', () => {
  it('computes the RFC 7636 S256 challenge', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
  it('signs an RS256 app JWT valid for under 10 minutes', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const jwt = createAppJwt('424242', privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), new Date('2026-10-09T00:00:00Z'))
    const claims = JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString()) as { iat: number; exp: number; iss: string }
    expect(claims.iss).toBe('424242')
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(600)
    expect(claims.iat).toBe(Date.parse('2026-10-09T00:00:00Z') / 1000 - 60)
  })
  it('validates repo names and prefers the installation on the user’s own account', () => {
    expect(isRepoFullName('example-asha/portfolio')).toBe(true)
    expect(isRepoFullName('example-asha/..')).toBe(false)
    expect(isRepoFullName('a/b/c')).toBe(false)
    const inst = (id: string, account: string) => ({ id, appId: '1', appSlug: 'lee', account, repositorySelection: 'selected' as const, permissions: {} })
    expect(findAppInstallation([inst('9', 'some-org'), inst('7', 'Example-Asha')], { appId: '1', slug: 'lee' }, 'example-asha')?.id).toBe('7')
  })
  it('reads the commit count from the Link header', () => {
    expect(lastPage('<https://api.github.com/x?per_page=1&page=2>; rel="next", <https://api.github.com/x?per_page=1&page=37>; rel="last"')).toBe(37)
    expect(lastPage(null)).toBeNull()
  })
})

describe('repo evidence', () => {
  const project = syntheticProfile().projects[0]!
  it('only suggests reviewing readiness; never decides it', () => {
    expect(reviewHint({ interviewReady: false }, { userCommits: 25, userPrs: 0 })).toBe('review_ready')
    expect(reviewHint({ interviewReady: true }, { userCommits: 0, userPrs: 0 })).toBe('review_low_activity')
    expect(reviewHint({ interviewReady: true }, { userCommits: 25, userPrs: 2 })).toBe('none')
  })
  it('suggests description and new topics, never a private URL, and applies only what is ticked', () => {
    const s = buildRepoSuggestion({ ...project, url: '' }, { description: 'A ledger', topics: ['Go', 'ledger', 'accounting'], htmlUrl: 'https://github.com/x/y', isPrivate: true })
    expect(s).toEqual({ projectId: project.id, description: 'A ledger', keywords: ['ledger', 'accounting'], url: null })
    const profile = syntheticProfile()
    const next = applyRepoSuggestion(profile, s, { description: false, keywords: ['ledger', 'injected'], url: true })
    expect(next.projects[0]!.description).toBe(project.description)
    expect(next.projects[0]!.keywords).toEqual([...project.keywords, 'ledger'])
    expect(next.projects[0]!.interviewReady).toBe(project.interviewReady)
  })
})

describe('Radar follows', () => {
  it('maps package.json and composer.json dependencies to release projects', () => {
    expect(projectsFromPackageJson(JSON.stringify({ dependencies: { next: '16', react: '19', lodash: '4' }, devDependencies: { '@playwright/test': '1' }, engines: { node: '>=20' } })).sort()).toEqual(['nextjs', 'nodejs', 'playwright', 'react'])
    expect(projectsFromComposerJson(JSON.stringify({ require: { php: '^8.3', 'laravel/framework': '^12' }, 'require-dev': { 'phpunit/phpunit': '^11' } }))).toEqual(['php', 'laravel'])
    expect(projectsFromPackageJson('not json')).toEqual([])
  })
  it('follows starred repos by catalog id or as gh:owner/repo', () => {
    expect(projectsFromStarred(['vercel/next.js', 'honojs/hono', 'bad name'])).toEqual(['nextjs', 'gh:honojs/hono'])
    expect(releaseProject('gh:honojs/hono')).toMatchObject({ github: 'honojs/hono' })
    expect(cleanProjectIds(['gh:honojs/hono', 'gh:../etc', 'laravel', 'nope'])).toEqual(['gh:honojs/hono', 'laravel'])
  })
})

describe('LinkedIn id_token', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1' }
  const sign = (claims: Record<string, unknown>) => {
    const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k1' })).toString('base64url')
    const p = Buffer.from(JSON.stringify(claims)).toString('base64url')
    return `${h}.${p}.${createSign('RSA-SHA256').update(`${h}.${p}`).sign(privateKey).toString('base64url')}`
  }
  const now = new Date('2026-10-09T00:00:00Z')
  const base = { iss: 'https://www.linkedin.com', aud: 'cid', sub: 'm1', exp: now.getTime() / 1000 + 600, nonce: 'n1' }
  const opts = { keys: [jwk], issuers: ['https://www.linkedin.com'], audience: 'cid', nonce: 'n1', now }

  it('accepts a valid token', () => expect(verifyIdToken(sign(base), opts).sub).toBe('m1'))
  it.each([
    ['nonce', { ...base, nonce: 'other' }],
    ['audience', { ...base, aud: 'someone-else' }],
    ['issuer', { ...base, iss: 'https://evil.example' }],
    ['expired', { ...base, exp: now.getTime() / 1000 - 3600 }],
  ])('rejects a bad %s', (code, claims) => {
    expect(() => verifyIdToken(sign(claims), opts)).toThrow(new IdTokenError(code as IdTokenError['code']).message)
  })
  it('rejects a forged signature', () => {
    const t = sign(base).split('.')
    t[1] = Buffer.from(JSON.stringify({ ...base, sub: 'attacker' })).toString('base64url')
    expect(() => verifyIdToken(t.join('.'), opts)).toThrow('id_token signature')
  })
})

describe('Share payload', () => {
  it('escapes little-text markup and targets the member feed', () => {
    expect(escapeLittleText('Hi @team (v2) #go *bold*')).toBe('Hi \\@team \\(v2\\) \\#go \\*bold\\*')
    expect(buildPostPayload('abc', 'x')).toEqual({
      author: 'urn:li:person:abc',
      commentary: 'x',
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    })
  })
})

describe('optimizer and fact lock', () => {
  const profile = syntheticProfile()
  it('locks numbers and links to the profile', () => {
    const facts = profileFactText(profile)
    expect(checkPostFacts('Payouts API handling 2M+ requests per day: https://asha.example.dev/case-payouts.html', facts).ok).toBe(true)
    expect(checkPostFacts('Cut costs by 40%', facts)).toEqual({ ok: false, numbers: ['40'], links: [] })
    expect(checkPostFacts('See https://elsewhere.example.com', facts)).toEqual({ ok: false, numbers: [], links: ['https://elsewhere.example.com'] })
  })
  it('builds the checklist', () => {
    const items = buildChecklist({
      headline: 'Backend Engineer | Go · PostgreSQL',
      about: 'x'.repeat(1200),
      positions: [{ company: 'PayFlow', title: 'Backend Engineer' }],
      targetRoles: ['Backend'],
      keywords: ['Go', 'PostgreSQL', 'Redis'],
      cvWork: profile.work.map((w) => ({ company: w.name, position: w.position })),
      portfolioUrl: 'https://asha.example.dev',
      caseStudyUrls: ['https://asha.example.dev/case-payouts.html'],
      gcc: true,
    })
    const by = Object.fromEntries(items.map((i) => [i.id, i]))
    expect(by.headline_role!.status).toBe('pass')
    expect(by.headline_keywords!.status).toBe('pass')
    expect(by.about_length!.status).toBe('pass')
    expect(by.featured_links!.status).toBe('warn')
    expect(by.positions_match).toMatchObject({ status: 'warn', detail: expect.stringContaining('ShopKart') })
    expect(by.open_to_work!.detail).toContain('Recruiters only')
  })
})

describe('redaction: no GitHub or LinkedIn token reaches the logs', () => {
  const secrets = [
    'ghu_SYNTHETICaccess0001abcdefghijklmnopqrstuv',
    'ghr_SYNTHETICrefresh0001abcdefghijklmnopqrstuvwxyz0123456789abcdefghijk',
    'ghs_SYNTHETICinstallation000000000000000000',
    `AQV${'x'.repeat(20)}SYNTHETIC1${'y'.repeat(30)}`,
  ]
  it('redacts tokens in free text', () => {
    for (const s of secrets) {
      expect(redactText(`call failed with ${s}`)).not.toContain(s)
      expect(redactText(`authorization: Bearer ${s}`)).not.toContain(s)
    }
    expect(redactText('https://example.com/cb?code=abc123&state=xyz')).not.toMatch(/abc123|xyz/)
  })
  it('drops token-named context keys and string values not allow-listed', () => {
    const ctx = sanitizeContext({ accessToken: secrets[0], refresh_token: secrets[1], code: secrets[2], status: 401, err: `bad ${secrets[3]}` }, new Set(['err', 'code']))
    const out = JSON.stringify(ctx)
    for (const s of secrets) expect(out).not.toContain(s)
    expect(ctx.status).toBe(401)
  })
  it('persisted events from the integrations never carry a token', () => {
    const row = toEventRow('warn', 'github_connect_exchange_failed', { userId: '00000000-0000-4000-8000-000000000000', code: secrets[0], token: secrets[1], err: secrets[3] }, new Date())
    const out = JSON.stringify(row)
    for (const s of secrets) expect(out).not.toContain(s)
  })
})
