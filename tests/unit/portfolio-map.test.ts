import { describe, expect, it } from 'vitest'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'
import { contentHash, JSON_RESUME_SCHEMA_URL, nextVersion, toJsonResume, formatLastModified } from '@/lib/portfolio/map'
import { checkPortfolioProfile } from '@/lib/portfolio/checks'
import type { ResumeProfile } from '@/lib/resume/types'

const META = { version: 'v1.0.1', lastModified: '2026-10-02T09:30:00Z' }

type Json = Record<string, unknown>
const basicsOf = (doc: Json) => doc.basics as Json
const xOf = (doc: Json) => (doc.meta as Json)['x-portfolio'] as Json

describe('toJsonResume', () => {
  it('maps the public profile to JSON Resume v1.2.1 + meta.x-portfolio that the portfolio build accepts', () => {
    const doc = toJsonResume(syntheticProfile(), META)
    expect(doc.$schema).toBe(JSON_RESUME_SCHEMA_URL)
    expect(checkPortfolioProfile(doc)).toEqual([])
    expect(basicsOf(doc)).toMatchObject({
      name: 'Asha Menon',
      label: 'Backend Engineer',
      email: 'asha.menon@example.com',
      url: 'https://asha.example.dev',
    })
    expect(doc.meta).toMatchObject({ canonical: 'https://asha.example.dev/profile.json', ...META })
  })

  it('never exports private fields', () => {
    const doc = toJsonResume(syntheticProfile(), META)
    const text = JSON.stringify(doc)
    for (const secret of ['+971 50 000 0000', 'Indian', 'visit visa', '1 month', 'AED 18,000']) {
      expect(text).not.toContain(secret)
    }
    // Country is public by default, the city is "location detail".
    expect(basicsOf(doc).location).toEqual({ countryCode: 'AE' })
    expect(basicsOf(doc).phone).toBeUndefined()
  })

  it('exports a private field once the user makes it public', () => {
    const p = syntheticProfile()
    const doc = toJsonResume({ ...p, basics: { ...p.basics, visibility: { phone: 'public', location: 'public' } } }, META)
    expect(basicsOf(doc).phone).toBe('+971 50 000 0000')
    expect(basicsOf(doc).location).toEqual({ city: 'Dubai', countryCode: 'AE' })
  })

  it('drops private items and private highlights, and re-indexes case studies to the public highlights', () => {
    const p = syntheticProfile()
    const [payflow, shopkart] = p.work
    const hidden: ResumeProfile = {
      ...p,
      work: [
        { ...payflow!, highlights: payflow!.highlights.map((h, i) => (i === 0 ? h : { ...h })) },
        { ...shopkart!, visibility: { _item: 'private' } },
      ],
      portfolio: {
        ...p.portfolio,
        caseStudies: [
          { id: 'ledger', title: 'Ledger', url: 'https://asha.example.dev/case-ledger.html', workId: 'w-payflow', highlightId: 'h-ledger' },
        ],
      },
    }
    const withPrivateFirst: ResumeProfile = {
      ...hidden,
      work: [
        { ...hidden.work[0]!, highlights: [{ ...hidden.work[0]!.highlights[0]!, visibility: { _item: 'private' } }, ...hidden.work[0]!.highlights.slice(1)] },
        hidden.work[1]!,
      ],
    }
    const doc = toJsonResume(withPrivateFirst, META)
    const work = doc.work as Json[]
    expect(work.map((w) => w.name)).toEqual(['PayFlow'])
    expect(work[0]!.highlights).toHaveLength(2)
    expect(xOf(doc).caseStudies).toEqual([
      { id: 'ledger', title: 'Ledger', url: 'https://asha.example.dev/case-ledger.html', work: 'PayFlow', highlight: 0 },
    ])
    expect((xOf(doc).order as Json).work).toEqual(['PayFlow'])
  })

  it('drops a case study whose highlight is private', () => {
    const p = syntheticProfile()
    const work = p.work.map((w) =>
      w.id === 'w-payflow'
        ? { ...w, highlights: w.highlights.map((h) => (h.id === 'h-payouts' ? { ...h, visibility: { _item: 'private' as const } } : h)) }
        : w,
    )
    expect(xOf(toJsonResume({ ...p, work }, META)).caseStudies).toEqual([])
  })

  it('writes master wording (never alternates), omits empty optionals and "Present" end dates', () => {
    const p = syntheticProfile()
    const work = p.work.map((w, i) =>
      i === 0
        ? { ...w, highlights: [{ ...w.highlights[0]!, alternates: [{ id: 'a1', text: 'Payouts API, 2M+ req/day', source: 'user' as const }] }] }
        : w,
    )
    const doc = toJsonResume({ ...p, work }, META)
    const first = (doc.work as Json[])[0]!
    expect(first.highlights).toEqual(['Designed an idempotent payouts API in Go handling 2M+ requests per day.'])
    expect(first).not.toHaveProperty('endDate')
    expect(first).not.toHaveProperty('url')
    expect((doc.work as Json[])[1]).toMatchObject({ endDate: '2021-03' })
  })

  it('maps languages and certificates to their JSON Resume names', () => {
    const doc = toJsonResume(syntheticProfile(), META)
    expect(doc.languages).toEqual([
      { language: 'English', fluency: 'Fluent' },
      { language: 'Arabic', fluency: 'Elementary' },
    ])
    expect(doc.certificates).toEqual([{ name: 'AWS Certified Developer', date: '2022-06', issuer: 'Amazon Web Services' }])
  })

  it('publishes public items whatever their depth, and never writes readiness', () => {
    const p = syntheticProfile()
    const studying = { depth: 'ai_assisted' as const, interviewReady: false, domainReady: false, studyNotes: 'Read the clearance code' }
    const doc = toJsonResume(
      {
        ...p,
        projects: p.projects.map((pr) => ({ ...pr, ...studying })),
        work: p.work.map((w) => ({ ...w, highlights: w.highlights.map((h) => ({ ...h, ...studying })) })),
        skills: p.skills.map((g) => ({ ...g, skills: g.skills.map((s) => ({ ...s, ...studying })) })),
      },
      META,
    )
    expect((doc.projects as Json[]).map((x) => x.name)).toEqual(['Open Ledger'])
    expect(((doc.work as Json[])[0]!.highlights as string[]).length).toBe(3)
    expect((doc.skills as Json[])[0]!.keywords).toEqual(['Go', 'TypeScript', 'PHP'])
    const text = JSON.stringify(doc)
    for (const leak of ['depth', 'ai_assisted', 'interviewReady', 'domainReady', 'studyNotes', 'Read the clearance', 'experiment']) {
      expect(text).not.toContain(leak)
    }
    expect(checkPortfolioProfile(doc)).toEqual([])
  })

  it('keeps extra JSON Resume sections taken from the repo', () => {
    const p = syntheticProfile()
    const doc = toJsonResume({ ...p, portfolio: { ...p.portfolio, extra: { volunteer: [{ organization: 'Code Club' }] } } }, META)
    expect(doc.volunteer).toEqual([{ organization: 'Code Club' }])
    expect(checkPortfolioProfile(doc)).toEqual([])
  })
})

describe('publish meta helpers', () => {
  it('bumps the patch version, keeping a v prefix', () => {
    expect(nextVersion('v1.0.0')).toBe('v1.0.1')
    expect(nextVersion('2.3.9')).toBe('2.3.10')
    expect(nextVersion(null)).toBe('1.0.0')
    expect(nextVersion('garbage')).toBe('1.0.0')
  })

  it('formats lastModified without milliseconds', () => {
    expect(formatLastModified(new Date('2026-09-27T08:05:03.123Z'))).toBe('2026-09-27T08:05:03Z')
  })

  it('hashes content but not the version or timestamp', () => {
    const p = syntheticProfile()
    const a = contentHash(toJsonResume(p, META))
    const b = contentHash(toJsonResume(p, { version: 'v9.9.9', lastModified: '2027-01-01T00:00:00Z' }))
    const c = contentHash(toJsonResume({ ...p, basics: { ...p.basics, label: 'Payments Engineer' } }, META))
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})
