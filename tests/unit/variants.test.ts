import { describe, expect, it } from 'vitest'
import { buildRecipe, defaultVariantName, fieldOn, REGION_PRESETS } from '@/lib/variants/presets'
import { renderVariant, formatMonth } from '@/lib/variants/render'
import { domainOnlyBullets, toPlainText, variantToMasterCv } from '@/lib/variants/export'
import { variantToLatex } from '@/lib/variants/latex'
import { jobSignals, suggestVariant, type VariantSummary } from '@/lib/variants/suggest'
import { projectSchema, type ResumeProfile } from '@/lib/resume/types'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'

function withStudyItems(): ResumeProfile {
  const p = syntheticProfile()
  return {
    ...p,
    work: p.work.map((w) => ({
      ...w,
      highlights: w.highlights.map((h) =>
        h.id === 'h-zatca'
          ? { ...h, depth: 'ai_assisted' as const, interviewReady: false, domainReady: true, alternates: [{ id: 'w-design', text: 'Designed the ZATCA e-invoicing clearance flow for 3 Saudi merchants.', source: 'user' as const }] }
          : h,
      ),
    })),
    projects: [
      ...p.projects,
      projectSchema.parse({ id: 'pr-vibe', name: 'Vibe Wallet', description: 'Wallet app', keywords: ['Rust'], depth: 'ai_assisted', highlights: [{ id: 'h-v', text: 'A wallet in Rust.', depth: 'ai_assisted' }] }),
      projectSchema.parse({ id: 'pr-learn', name: 'Learning Elixir', keywords: ['Elixir'], depth: 'learning', highlights: [{ id: 'h-l', text: 'Toy chat server.', depth: 'learning' }] }),
    ],
  }
}

describe('presets', () => {
  it('GCC turns on nationality, visa, notice and languages; photo and DOB stay off', () => {
    const r = buildRecipe(syntheticProfile(), { region: 'gcc', roleFamily: null })
    expect(r.fields).toMatchObject({ nationality: true, visaStatus: true, noticePeriod: true, phone: true, photo: false, dateOfBirth: false })
    expect(r.sections).toContain('languages')
  })

  it('Remote never shows photo, date of birth or marital status, even when toggled', () => {
    const r = buildRecipe(syntheticProfile(), { region: 'remote', roleFamily: null })
    const forced = { ...r, fields: { ...r.fields, photo: true, dateOfBirth: true, maritalStatus: true } }
    expect(fieldOn(forced, 'photo')).toBe(false)
    expect(fieldOn(forced, 'dateOfBirth')).toBe(false)
    expect(fieldOn(forced, 'maritalStatus')).toBe(false)
    expect(REGION_PRESETS.remote.template).toBe('ats')
    expect(fieldOn({ region: 'india', fields: { ...r.fields, photo: true } }, 'photo')).toBe(false)
    expect(fieldOn({ region: 'india', fields: { ...r.fields, expectedSalary: false } }, 'expectedSalary')).toBe(false)
  })

  it('only picks interview-ready items by default', () => {
    const r = buildRecipe(withStudyItems(), { region: 'remote', roleFamily: null, lengthTarget: 2 })
    expect(r.projects.map((p) => p.id)).toEqual(['pr-ledger'])
    expect(r.work[0]!.highlights.map((h) => h.id)).not.toContain('h-zatca')
  })

  it('a role preset leads with the matching items', () => {
    const r = buildRecipe(syntheticProfile(), { region: 'gcc', roleFamily: 'einvoicing' })
    expect(r.work[0]!.highlights[0]!.id).toBe('h-zatca')
    const fe = buildRecipe(syntheticProfile(), { region: 'remote', roleFamily: 'frontend' })
    expect(fe.skills[0]).toBe('sk-ts')
    expect(defaultVariantName('gcc', 'payments')).toBe('GCC · Payments / Fintech Backend Engineer')
  })
})

describe('renderVariant', () => {
  it('renders facts from the master and region fields from the recipe', () => {
    const p = syntheticProfile()
    const out = renderVariant(p, buildRecipe(p, { region: 'gcc', roleFamily: 'payments' }))
    expect(out.contact.map((c) => c.label)).toEqual(['Email', 'Phone', 'Location', 'Website', 'GitHub', 'LinkedIn', 'Nationality', 'Visa', 'Notice period'])
    expect(out.sections.map((s) => s.key)).toEqual(['summary', 'work', 'skills', 'projects', 'education', 'languages', 'certificates'])
    expect(out.sections.find((s) => s.key === 'languages')?.lines).toEqual(['English — Fluent', 'Arabic — Elementary'])
    expect(out.warnings).toEqual([])
  })

  it('leaves out not-ready items unless overridden, with a warning', () => {
    const p = withStudyItems()
    const base = buildRecipe(p, { region: 'remote', roleFamily: null, lengthTarget: 2 })
    const recipe = {
      ...base,
      projects: [...base.projects, { id: 'pr-vibe', highlights: [{ id: 'h-v', wordingId: null }] }, { id: 'pr-learn', highlights: [] }],
    }
    const plain = renderVariant(p, recipe)
    const names = plain.sections.find((s) => s.key === 'projects')!.entries.map((e) => e.title)
    expect(names).toEqual(['Open Ledger'])
    expect(plain.warnings.map((w) => w.kind)).toEqual(['excluded', 'excluded'])

    const overridden = renderVariant(p, { ...recipe, overrides: ['pr-vibe', 'pr-learn'] })
    expect(overridden.sections.find((s) => s.key === 'projects')!.entries.map((e) => e.title)).toEqual(['Open Ledger', 'Vibe Wallet'])
    expect(overridden.warnings.find((w) => w.kind === 'override')?.message).toContain('You may be asked about this in an interview.')
    // learning items cannot be overridden.
    expect(overridden.warnings.some((w) => w.kind === 'excluded' && w.message.includes('Learning Elixir'))).toBe(true)
  })

  it('shows a domain-ready highlight only in its design wording', () => {
    const p = withStudyItems()
    const base = buildRecipe(p, { region: 'gcc', roleFamily: null })
    const recipe = { ...base, work: base.work.map((w, i) => (i === 0 ? { ...w, highlights: [...w.highlights, { id: 'h-zatca', wordingId: null }] } : w)) }
    const out = renderVariant(p, recipe)
    const bullets = out.sections.find((s) => s.key === 'work')!.entries[0]!.bullets
    expect(bullets.at(-1)).toEqual({ text: 'Designed the ZATCA e-invoicing clearance flow for 3 Saudi merchants.', mode: 'domain' })
    expect(domainOnlyBullets(out)).toEqual(['Designed the ZATCA e-invoicing clearance flow for 3 Saudi merchants.'])
  })

  it('reports removed items, stale wordings, invented summary numbers and GCC gaps', () => {
    const p = syntheticProfile()
    const base = buildRecipe(p, { region: 'gcc', roleFamily: null })
    const recipe = {
      ...base,
      summary: 'Backend engineer with 9 years in payments.',
      work: [...base.work.map((w, i) => (i === 0 ? { ...w, highlights: [{ id: 'h-payouts', wordingId: 'w-gone' }] } : w)), { id: 'w-deleted', highlights: [] }],
    }
    const noArabic = { ...p, languages: p.languages.filter((l) => l.language !== 'Arabic'), basics: { ...p.basics, phone: '050 000 0000' } }
    const kinds = renderVariant(noArabic, recipe).warnings.map((w) => w.kind)
    expect(kinds).toEqual(expect.arrayContaining(['stale', 'missing', 'numbers', 'region']))
    expect(renderVariant(noArabic, recipe).warnings.filter((w) => w.kind === 'region')).toHaveLength(2)
  })

  it('formats US-style dates', () => {
    expect(formatMonth('2021-04')).toBe('Apr 2021')
    expect(formatMonth('2018')).toBe('2018')
  })
})

describe('outputs', () => {
  const p = withStudyItems()
  const out = renderVariant(p, buildRecipe(p, { region: 'remote', roleFamily: 'payments' }))

  it('plain text for portal forms', () => {
    const text = toPlainText(out)
    expect(text.startsWith('ASHA MENON\nBackend Engineer\n')).toBe(true)
    expect(text).toContain('EXPERIENCE\nBackend Engineer — PayFlow (Dubai | Apr 2021 – Present)\n- ')
    expect(text).not.toContain('\\')
    expect(text).not.toContain('Vibe Wallet')
  })

  it('as a MasterCV for tailoring and scoring, with only what the variant shows', () => {
    const cv = variantToMasterCv(out)
    expect(cv.experience[0]).toMatchObject({ company: 'PayFlow', role: 'Backend Engineer', start: 'Apr 2021', end: 'present' })
    expect(JSON.stringify(cv)).not.toContain('Vibe Wallet')
    expect(JSON.stringify(cv)).not.toContain('Indian')
  })

  it('LaTeX: ATS-plain has no colour; the designed one uses the brand tokens; text is escaped', () => {
    const tricky = { ...out, name: 'Asha & Co_50%' }
    const ats = variantToLatex(tricky, 1)
    // A Remote / US variant defaults to US Letter (GCC and India: A4).
    expect(ats).toContain('\\documentclass[10pt,letterpaper]{article}')
    expect(ats).toContain('Asha \\& Co\\_50\\%')
    expect(ats).not.toContain('xcolor')
    expect(ats).not.toContain('includegraphics')
    const brand = variantToLatex({ ...tricky, template: 'brand' }, 2)
    expect(brand).toContain('\\definecolor{leetile}{HTML}{1A2B4C}')
    expect(brand).toContain('\\documentclass[11pt,letterpaper]{article}')
  })
})

describe('suggestVariant', () => {
  const variants: VariantSummary[] = [
    { id: 'v1', name: 'GCC · Payments', region: 'gcc', roleFamily: 'payments', currentVersion: 3 },
    { id: 'v2', name: 'Remote · Full-stack', region: 'remote', roleFamily: 'fullstack', currentVersion: 1 },
  ]

  it('picks the variant matching the posting region and role family', () => {
    const s = suggestVariant(variants, jobSignals({ title: 'Payments Engineer', location: 'Dubai, UAE' }))
    expect(s.variant?.id).toBe('v1')
    expect(s.reason).toBe('Matches: GCC job · Payments / Fintech Backend Engineer')
    expect(s.create).toBeNull()
  })

  it('suggests creating a variant when none fits', () => {
    const signals = jobSignals({ title: 'ZATCA E-invoicing Developer', location: 'Bengaluru, India' })
    expect(signals).toMatchObject({ regions: ['india'], families: ['einvoicing'] })
    const s = suggestVariant(variants, signals)
    expect(s.variant).toBeNull()
    expect(s.create).toEqual({ region: 'india', roleFamily: 'einvoicing' })
  })

  it('falls back to a region-only match and still offers a closer variant', () => {
    const s = suggestVariant(variants, jobSignals({ title: 'Backend Developer', location: 'Riyadh, Saudi Arabia' }))
    expect(s.variant?.id).toBe('v1')
    expect(s.create).toEqual({ region: 'gcc', roleFamily: 'backend' })
  })
})
