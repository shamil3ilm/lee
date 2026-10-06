import { describe, expect, it } from 'vitest'
import { checkPortfolioProfile } from '@/lib/portfolio/checks'
import { toVariantJsonResume, variantProfile } from '@/lib/portfolio/variant-map'
import { isVariantSlug, slugify, variantJsonUrl, variantPageUrl, variantRepoPath } from '@/lib/portfolio/variant-paths'
import { projectSchema, type ResumeProfile } from '@/lib/resume/types'
import { buildRecipe } from '@/lib/variants/presets'
import type { Recipe } from '@/lib/variants/types'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'

const META = { version: '1.0.0', lastModified: '2026-10-06T08:00:00Z' }

type Doc = {
  basics: Record<string, unknown> & { label: string; summary: string }
  work: Array<{ name: string; highlights: string[] }>
  projects: Array<{ name: string }>
  skills: Array<{ name: string; keywords: string[] }>
  education: unknown[]
  languages?: unknown[]
  meta: { canonical: string; 'x-portfolio': { order: Record<string, string[]>; caseStudies: Array<{ highlight: number }> } }
}

function profile(): ResumeProfile {
  const p = syntheticProfile()
  return {
    ...p,
    work: p.work.map((w) =>
      w.id === 'w-payflow'
        ? {
            ...w,
            highlights: w.highlights.map((h) =>
              h.id === 'h-ledger'
                ? { ...h, alternates: [{ id: 'w-short', text: 'Moved the ledger to PostgreSQL; reconciliation errors down 85%.', source: 'user' as const }] }
                : h.id === 'h-zatca'
                  ? { ...h, visibility: { _item: 'private' as const } }
                  : h,
            ),
          }
        : w,
    ),
    projects: [
      ...p.projects,
      projectSchema.parse({ id: 'pr-vibe', name: 'Vibe Wallet', description: 'Wallet app', keywords: ['Rust'], depth: 'ai_assisted', highlights: [{ id: 'h-vibe', text: 'Generated a wallet app.', depth: 'ai_assisted' }] }),
    ],
  }
}

function recipe(p: ResumeProfile, patch: Partial<Recipe> = {}): Recipe {
  const base = buildRecipe(p, { region: 'gcc', roleFamily: null, lengthTarget: 2 })
  return {
    ...base,
    headline: 'Payments Backend Engineer',
    summary: 'Payments and ledgers in Go.',
    work: [{ id: 'w-payflow', highlights: [{ id: 'h-ledger', wordingId: 'w-short' }, { id: 'h-payouts', wordingId: null }, { id: 'h-zatca', wordingId: null }] }],
    projects: [{ id: 'pr-ledger', highlights: [{ id: 'h-ol', wordingId: null }] }, { id: 'pr-vibe', highlights: [{ id: 'h-vibe', wordingId: null }] }],
    skills: ['sk-pg', 'sk-go'],
    ...patch,
  }
}

describe('variant JSON Resume', () => {
  const p = profile()
  const doc = toVariantJsonResume(p, recipe(p), 'gcc-payments', META) as unknown as Doc

  it('passes the portfolio build’s own checks', () => {
    expect(checkPortfolioProfile(doc)).toEqual([])
  })

  it('has only what the variant includes, in its order and wording', () => {
    expect(doc.basics.label).toBe('Payments Backend Engineer')
    expect(doc.basics.summary).toBe('Payments and ledgers in Go.')
    expect(doc.work.map((w) => w.name)).toEqual(['PayFlow'])
    expect(doc.work[0]!.highlights).toEqual([
      'Moved the ledger to PostgreSQL; reconciliation errors down 85%.',
      'Designed an idempotent payouts API in Go handling 2M+ requests per day.',
    ])
    // Skills grouped under their master group, in the variant's order.
    expect(doc.skills).toEqual([
      { name: 'Databases', keywords: ['PostgreSQL'] },
      { name: 'Languages', keywords: ['Go'] },
    ])
    expect(doc.meta['x-portfolio'].order.work).toEqual(['PayFlow'])
  })

  it('never writes private fields, private items or not-ready items', () => {
    const text = JSON.stringify(doc)
    expect(text).not.toContain('ZATCA') // private highlight
    expect(text).not.toContain('Vibe Wallet') // not interview-ready, not overridden
    expect(text).not.toContain('Indian')
    expect(text).not.toContain('AED')
    expect(text).not.toContain('+971') // phone is private in the master
    expect(text).not.toContain('interviewReady')
    expect(text).not.toContain('depth')
  })

  it('maps case studies onto the variant’s highlight positions', () => {
    expect(doc.meta['x-portfolio'].caseStudies).toEqual([expect.objectContaining({ work: 'PayFlow', highlight: 1 })])
  })

  it('points meta.canonical at variants/<slug>.json on the portfolio', () => {
    expect(doc.meta.canonical).toBe('https://asha.example.dev/variants/gcc-payments.json')
  })

  it('phone and location need both the public flag and the variant toggle', () => {
    const pub = { ...p, basics: { ...p.basics, visibility: { phone: 'public' as const, location: 'public' as const } } }
    const on = toVariantJsonResume(pub, recipe(pub), 's', META) as unknown as Doc
    expect(on.basics.phone).toBe('+971 50 000 0000')
    expect(on.basics.location).toMatchObject({ city: 'Dubai', countryCode: 'AE' })
    const r = recipe(pub)
    const off = toVariantJsonResume(pub, { ...r, fields: { ...r.fields, phone: false, location: false } }, 's', META) as unknown as Doc
    expect(off.basics.phone).toBeUndefined()
    expect(off.basics.location).toBeUndefined()
  })

  it('never publishes the photo, even a public photo URL', () => {
    const pub = { ...p, basics: { ...p.basics, image: 'https://asha.example.dev/me.jpg', visibility: { image: 'public' as const } } }
    const r = recipe(pub)
    const out = toVariantJsonResume(pub, { ...r, fields: { ...r.fields, photo: true } }, 's', META) as unknown as Doc
    expect(out.basics.image).toBeUndefined()
  })

  it('leaves out sections the variant excludes and the JSON Resume extras', () => {
    const extra = { ...p, portfolio: { ...p.portfolio, extra: { volunteer: [{ organization: 'Example' }] } } }
    const out = toVariantJsonResume(extra, recipe(extra, { sections: ['summary', 'work', 'skills'] }), 's', META) as unknown as Doc & { volunteer?: unknown }
    expect(out.projects).toEqual([])
    expect(out.education).toEqual([])
    expect(out.languages).toBeUndefined()
    expect(out.volunteer).toBeUndefined()
  })

  it('a domain-only project is left out (the page would list its stack)', () => {
    const domain = { ...p, projects: p.projects.map((x) => (x.id === 'pr-ledger' ? { ...x, interviewReady: false, domainReady: true, depth: 'ai_assisted' as const } : x)) }
    expect(variantProfile(domain, recipe(domain)).projects).toEqual([])
  })

  it('an overridden ai_assisted project is included, as on the PDF', () => {
    const out = variantProfile(p, recipe(p, { overrides: ['pr-vibe', 'h-vibe'] }))
    expect(out.projects.map((x) => x.name)).toEqual(['Open Ledger', 'Vibe Wallet'])
  })
})

describe('variant paths', () => {
  it('slugs', () => {
    expect(slugify('GCC · Payments / Fintech Backend')).toBe('gcc-payments-fintech-backend')
    expect(slugify('Résumé Ünïcode')).toBe('resume-unicode')
    expect(slugify('···')).toBe('resume')
    expect(slugify('x'.repeat(80))).toHaveLength(60)
    expect(isVariantSlug('gcc-payments')).toBe(true)
    expect(isVariantSlug('-bad')).toBe(false)
    expect(isVariantSlug('Bad')).toBe(false)
    expect(isVariantSlug('a/b')).toBe(false)
  })

  it('repo path next to profile.json, URLs on the portfolio origin', () => {
    expect(variantRepoPath('profile.json', 'gcc')).toBe('variants/gcc.json')
    expect(variantRepoPath('data/profile.json', 'gcc')).toBe('data/variants/gcc.json')
    expect(variantJsonUrl('https://asha.example.dev/profile.json', 'gcc')).toBe('https://asha.example.dev/variants/gcc.json')
    expect(variantPageUrl('https://asha.example.dev/profile.json', 'gcc')).toBe('https://asha.example.dev/resume/gcc.html')
    expect(variantPageUrl('', 'gcc')).toBeNull()
    expect(variantPageUrl('http://insecure.example/profile.json', 'gcc')).toBeNull()
  })
})
