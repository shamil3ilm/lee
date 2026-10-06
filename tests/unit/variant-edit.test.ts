import { describe, expect, it } from 'vitest'
import { applyProposalToRecipe } from '@/lib/variants/apply-proposal'
import { moveHighlight, moveSection, sectionRows, setWording, toggleHighlight, toggleId, toggleItem, toggleOverride, toggleSection } from '@/lib/variants/edit'
import { buildRecipe } from '@/lib/variants/presets'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'

const profile = syntheticProfile()
const base = buildRecipe(profile, { region: 'remote', roleFamily: null, lengthTarget: 2 })

describe('recipe edits are immutable and keep master order', () => {
  it('removes and re-adds a job in its master position', () => {
    const without = toggleItem(base, profile, 'work', 'w-payflow', false)
    expect(without.work.map((w) => w.id)).toEqual(['w-shopkart'])
    expect(base.work).toHaveLength(2)
    const back = toggleItem(without, profile, 'work', 'w-payflow', true)
    expect(back.work.map((w) => w.id)).toEqual(['w-payflow', 'w-shopkart'])
  })

  it('toggles, reorders and rewords highlights', () => {
    let r = toggleHighlight(base, 'work', 'w-payflow', 'h-ledger', false)
    expect(r.work[0]!.highlights.map((h) => h.id)).toEqual(['h-payouts', 'h-zatca'])
    r = moveHighlight(r, 'work', 'w-payflow', 'h-zatca', -1)
    expect(r.work[0]!.highlights.map((h) => h.id)).toEqual(['h-zatca', 'h-payouts'])
    r = setWording(r, 'work', 'w-payflow', 'h-payouts', 'w-1')
    expect(r.work[0]!.highlights[1]).toEqual({ id: 'h-payouts', wordingId: 'w-1' })
  })

  it('sections, ids and overrides', () => {
    let r = toggleSection(base, 'projects', false)
    expect(r.sections).not.toContain('projects')
    expect(sectionRows(r).slice(-2)).toEqual([{ key: 'projects', on: false }, { key: 'languages', on: false }])
    r = moveSection(r, 'skills', -1)
    expect(r.sections.indexOf('skills')).toBe(base.sections.indexOf('skills') - 2)
    expect(toggleId(base, 'languages', 'l-ar', false).languages).toEqual(['l-en'])
    expect(toggleOverride(toggleOverride(base, 'pr-x', true), 'pr-x', true).overrides).toEqual(['pr-x'])
  })
})

describe('applyProposalToRecipe', () => {
  it('leads with the selected highlights, keeps jobs, picks accepted wordings', () => {
    const r = applyProposalToRecipe(profile, base, {
      headline: 'Payments Backend Engineer',
      summary: null,
      selectedIds: ['h-ledger', 'h-payouts', 'pr-ledger'],
      wordingIds: new Map([['h-ledger', 'w-new']]),
    })
    expect(r.headline).toBe('Payments Backend Engineer')
    expect(r.summary).toBe(base.summary)
    expect(r.work[0]!.highlights).toEqual([
      { id: 'h-ledger', wordingId: 'w-new' },
      { id: 'h-payouts', wordingId: null },
    ])
    expect(r.work[1]).toEqual(base.work[1])
    expect(r.projects.map((p) => p.id)).toEqual(['pr-ledger'])
  })
})
