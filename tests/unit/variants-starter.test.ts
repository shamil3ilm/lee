import { describe, expect, it } from 'vitest'
import { checkDomainWording } from '@/lib/resume/fact-lock'
import { resolveHighlight } from '@/lib/resume/readiness'
import { parseResumeProfile } from '@/lib/resume/types'
import { renderVariant } from '@/lib/variants/render'
import { STARTER_ROLES, starterName, starterOptions, starterRecipe, startersFor } from '@/lib/variants/starter'
import { tailorProfile } from '@/tests/fixtures/resume/tailor'

const role = (id: string) => STARTER_ROLES.find((r) => r.id === id)!

function einvoicingProfile() {
  const base = tailorProfile()
  return parseResumeProfile({
    ...base,
    work: [
      {
        ...base.work[0]!,
        highlights: [
          ...base.work[0]!.highlights,
          {
            id: 'h-ubl',
            text: 'Built the UBL e-invoicing XML mapping for ZATCA.',
            depth: 'ai_assisted',
            domainReady: true,
            alternates: [{ id: 'w-ubl-design', text: 'Specified the UBL e-invoicing XML mapping for ZATCA clearance.' }],
          },
        ],
      },
      base.work[1]!,
    ],
  })
}

describe('starter set', () => {
  it('offers starters only for accepted role families, plus uncovered families on their own', () => {
    expect(startersFor([]).length).toBe(0)
    const ids = startersFor(['payments', 'data_analyst', 'devops']).map((r) => r.id)
    expect(ids).toEqual(['payments-backend', 'data-bi', 'family-devops'])
  })

  it('lists GCC / India / Remote per starter and marks the ones that exist', () => {
    const opts = starterOptions(['einvoicing'], [{ region: 'gcc', roleFamily: 'einvoicing' }])
    expect(opts).toHaveLength(1)
    expect(opts[0]!.options.map((o) => [o.name, o.exists])).toEqual([
      ['ERP / E-invoicing · GCC', true],
      ['ERP / E-invoicing · India', false],
      ['ERP / E-invoicing · Remote', false],
    ])
    expect(starterName(role('data-bi'), 'gcc')).toBe('Data Analyst / BI · GCC')
  })

  it('picks only ready items (never learning ones)', () => {
    const profile = tailorProfile()
    const recipe = starterRecipe(profile, role('payments-backend'), 'gcc')
    const picked = recipe.work.flatMap((w) => w.highlights.map((h) => h.id))
    expect(picked).not.toContain('h-k8s')
    expect(picked).not.toContain('h-zatca')
    expect(recipe.skills).not.toContain('sk-k8s')
    expect(renderVariant(profile, recipe).warnings.filter((w) => w.kind === 'excluded')).toEqual([])
  })

  it('uses an approved wording when it speaks the role better', () => {
    const recipe = starterRecipe(tailorProfile(), role('payments-backend'), 'remote')
    const hooks = recipe.work.flatMap((w) => w.highlights).find((h) => h.id === 'h-hooks')
    expect(hooks).toBeDefined()
    expect([null, 'w-hooks-idem']).toContain(hooks!.wordingId)
  })

  it('ERP / e-invoicing adds domain-ready items, only in design wording', () => {
    const profile = einvoicingProfile()
    const recipe = starterRecipe(profile, role('erp-einvoicing'), 'gcc')
    const picks = recipe.work.flatMap((w) => w.highlights)
    expect(picks.map((p) => p.id)).toContain('h-ubl')
    expect(picks.map((p) => p.id)).toContain('h-zatca')
    const bullets = renderVariant(profile, recipe).sections.flatMap((s) => s.entries.flatMap((e) => e.bullets))
    const ubl = bullets.find((b) => b.text.includes('UBL'))!
    expect(ubl.mode).toBe('domain')
    expect(checkDomainWording(ubl.text).ok).toBe(true)
    for (const b of bullets.filter((x) => x.mode === 'domain')) expect(checkDomainWording(b.text).ok).toBe(true)
    // The payments starter leaves design-only items out.
    const payments = starterRecipe(profile, role('payments-backend'), 'gcc')
    expect(payments.work.flatMap((w) => w.highlights).map((h) => h.id)).not.toContain('h-ubl')
    for (const p of picks) {
      const h = profile.work.flatMap((w) => w.highlights).find((x) => x.id === p.id)!
      expect(resolveHighlight(h, p.wordingId)).not.toBeNull()
    }
  })
})
