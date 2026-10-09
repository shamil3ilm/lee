import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { checkPortfolioProfile, PORTFOLIO_SCHEMA } from '@/lib/portfolio/checks'
import { toJsonResume } from '@/lib/portfolio/map'
import { resumeProfileSchema, type ResumeProfile } from '@/lib/resume/types'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'

/**
 * Validation parity with the portfolio build. tests/fixtures/portfolio holds
 * verbatim copies of the portfolio repo's scripts/lib/validate.mjs,
 * scripts/lib/profile.mjs and scripts/profile.schema.json (branch
 * feat/profile-json @ 1481115). The ORIGINAL JavaScript validator is the
 * oracle: for every document lee can generate, lee's TypeScript port must
 * report exactly the same errors — so the Publish gate (no errors) can
 * never let through a file the portfolio build would reject.
 */

const FIXTURES = path.resolve('tests/fixtures/portfolio')
/**
 * Reads ONE key from .env.local. Never load the whole file into tests: it
 * holds real credentials (e.g. the production DATABASE_URL).
 */
function envLocalValue(key: string): string | undefined {
  const file = path.resolve('.env.local')
  if (!existsSync(file)) return undefined
  const line = readFileSync(file, 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key}=`))
  return line?.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') || undefined
}

const PORTFOLIO_REPO =
  process.env.LEE_PORTFOLIO_REPO ?? envLocalValue('LEE_PORTFOLIO_REPO') ?? path.resolve('..', 'portfolio')

type JsCheck = (profile: unknown, schema: unknown) => string[]
async function original(): Promise<{ checkProfile: JsCheck; schema: unknown }> {
  const mod = (await import('../fixtures/portfolio/profile.mjs')) as { checkProfile: JsCheck }
  const schema = JSON.parse(readFileSync(path.join(FIXTURES, 'profile.schema.json'), 'utf8')) as unknown
  return { checkProfile: mod.checkProfile, schema }
}

const META = { version: 'v1.0.1', lastModified: '2026-10-02T09:30:00Z' }

describe('schema copy', () => {
  it('lib/portfolio/profile.schema.json is the portfolio schema, verbatim', () => {
    const vendored = JSON.parse(readFileSync(path.join(FIXTURES, 'profile.schema.json'), 'utf8')) as unknown
    expect(PORTFOLIO_SCHEMA).toEqual(vendored)
  })

  it.skipIf(!existsSync(path.join(PORTFOLIO_REPO, 'scripts/profile.schema.json')))(
    'the vendored copies still match the portfolio repo checkout',
    () => {
      for (const [rel, file] of [
        ['scripts/profile.schema.json', 'profile.schema.json'],
        ['scripts/lib/validate.mjs', 'validate.mjs'],
        ['scripts/lib/profile.mjs', 'profile.mjs'],
      ] as const) {
        const live = readFileSync(path.join(PORTFOLIO_REPO, rel), 'utf8').replace(/\r\n/g, '\n')
        const copy = readFileSync(path.join(FIXTURES, file), 'utf8').replace(/\r\n/g, '\n')
        expect(copy, `${rel} drifted: re-copy it into tests/fixtures/portfolio and lib/portfolio`).toBe(live)
      }
    },
  )
})

/** Deterministic PRNG (mulberry32) so failures reproduce. */
function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[Math.floor(r() * xs.length)]!
}

/** The first value (always a good one) 85% of the time, otherwise any. */
function mostly<T>(r: () => number, xs: readonly T[]): T {
  return r() < 0.85 ? xs[0]! : pick(r, xs)
}

const URLS = ['https://asha.example.dev', 'http://insecure.example.dev', 'not a url', '', 'https://ex ample.dev']
const DATES = ['2019-04', '2019', '2019-04-09', '', '2030-01', '2010']
const TEXTS = ['Backend Engineer', '', 'x'.repeat(201), 'Tab\there', 'Plain text with “quotes” – dashes']
const NETWORKS = [['GitHub', 'LinkedIn'], ['GitHub'], ['LinkedIn', 'LinkedIn', 'GitHub'], [], ['github', 'linkedin', 'X']]

/**
 * A profile with random good and bad values in the places the build
 * checks; null when lee's own profile schema already refuses it.
 */
function randomProfile(r: () => number): ResumeProfile | null {
  const base = syntheticProfile()
  const nets = mostly(r, NETWORKS)
  const workCount = r() < 0.9 ? 1 + Math.floor(r() * 3) : 0
  const work = Array.from({ length: workCount }, (_, i) => ({
    id: `w-${i}`,
    name: mostly(r, [`Company ${i}`, 'Company 0']),
    position: mostly(r, TEXTS) || 'Engineer',
    startDate: mostly(r, DATES),
    endDate: mostly(r, ['', ...DATES]),
    url: mostly(r, ['', ...URLS]),
    highlights: Array.from({ length: r() < 0.9 ? 1 + Math.floor(r() * 3) : 0 }, (_, j) => ({
      id: `h-${i}-${j}`,
      text: mostly(r, TEXTS) || 'Did a thing',
    })),
  }))
  const caseWork = work[0]
  const parsed = resumeProfileSchema.safeParse({
    ...base,
    basics: {
      ...base.basics,
      label: mostly(r, TEXTS),
      email: mostly(r, ['asha.menon@example.com', 'not-an-email', '']),
      url: mostly(r, URLS),
      profiles: nets.map((n, i) => ({ id: `p-${i}`, network: n, url: mostly(r, URLS) || 'https://github.com/x' })),
      visibility: r() < 0.1 ? { email: 'private' } : {},
    },
    work,
    projects: r() < 0.85 ? base.projects : [{ id: 'pr-x', name: 'X', keywords: r() < 0.5 ? [] : ['Go', 'Go'], highlights: [] }],
    skills: r() < 0.9 ? base.skills : [{ id: 's-e', name: 'Empty', skills: [] }],
    education: r() < 0.9 ? base.education : [{ id: 'e-x', institution: 'Example', studyType: '', area: 'CS', startDate: pick(r, DATES) }],
    portfolio: {
      ...base.portfolio,
      canonical: mostly(r, URLS),
      caseStudies:
        caseWork?.highlights[0] && r() < 0.6
          ? [
              {
                id: 'case-1',
                title: 'Case',
                url: 'https://asha.example.dev/c.html',
                workId: caseWork.id,
                highlightId: mostly(r, [caseWork.highlights[0].id, 'h-missing']),
              },
            ]
          : [],
      quickView: {
        ...base.portfolio.quickView,
        role: mostly(r, TEXTS),
        results: Array.from({ length: r() < 0.9 ? 1 + Math.floor(r() * 6) : pick(r, [0, 7]) }, (_, i) => ({
          id: `q-${i}`,
          lead: 'Lead',
          text: 'Text',
          link: r() < 0.3 ? { label: 'Read', href: mostly(r, ['case-x.html', 'index.html#top', 'javascript:void(0)', 'https://x.dev', 'Case X.html']) } : null,
        })),
        skills: mostly(r, [['Go'], [], ['Go', 'Go']]),
      },
    },
  })
  return parsed.success ? parsed.data : null
}

describe('validator parity with the portfolio build', () => {
  it('accepts lee’s synthetic profile exactly as the build does', async () => {
    const { checkProfile, schema } = await original()
    const doc = toJsonResume(syntheticProfile(), META)
    expect(checkProfile(doc, schema)).toEqual([])
    expect(checkPortfolioProfile(doc)).toEqual([])
  })

  it('reports the same errors as the build for hand-broken documents', async () => {
    const { checkProfile, schema } = await original()
    const good = toJsonResume(syntheticProfile(), META) as Record<string, unknown>
    const meta = good.meta as Record<string, unknown>
    const x = meta['x-portfolio'] as Record<string, unknown>
    const broken: unknown[] = [
      { ...good, basics: undefined },
      { ...good, meta: { ...meta, version: '1.0' } },
      { ...good, meta: { ...meta, lastModified: '2026-10-02 09:30' } },
      { ...good, meta: { ...meta, 'x-portfolio': { ...x, experiments: ['Open Ledger'] } } },
      { ...good, meta: { ...meta, 'x-portfolio': { ...x, schemaVersion: 2 } } },
      { ...good, meta: { ...meta, 'x-portfolio': { ...x, order: { work: ['Nope'] } } } },
      { ...good, work: [] },
      { ...good, work: [...(good.work as unknown[]), (good.work as unknown[])[0]] },
      { ...good, skills: [{ name: 'X', keywords: ['a', 'a'] }] },
      { ...good, education: [{ institution: 'X', studyType: 'Y', area: 'Z', startDate: '2020', endDate: '2019' }] },
      [],
      null,
      'text',
    ]
    for (const doc of broken) {
      const expected = checkProfile(doc, schema)
      expect(expected.length).toBeGreaterThan(0)
      expect(checkPortfolioProfile(doc)).toEqual(expected)
    }
  })

  it('agrees with the build on 600 generated profiles (so Publish never sends a file the build rejects)', async () => {
    const { checkProfile, schema } = await original()
    const r = rng(20261002)
    let valid = 0
    let invalid = 0
    for (let i = 0; valid + invalid < 600; i++) {
      const profile = randomProfile(r)
      if (!profile) continue
      const doc = toJsonResume(profile, META)
      const expected = checkProfile(doc, schema)
      const actual = checkPortfolioProfile(doc)
      expect(actual, `case ${i}`).toEqual(expected)
      if (actual.length === 0) valid++
      else invalid++
    }
    // Both outcomes are exercised, not just one.
    expect(valid).toBeGreaterThan(20)
    expect(invalid).toBeGreaterThan(20)
  })
})
