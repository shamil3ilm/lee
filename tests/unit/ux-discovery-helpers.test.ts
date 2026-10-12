import { describe, expect, it } from 'vitest'
import { reasonChip } from '@/lib/ui/reason-chip'
import { discoveryCountParts } from '@/lib/ui/discovery-counts'
import { isNeedsLook } from '@/lib/ui/needs-look'
import { labsDefault, labsOn } from '@/lib/settings/labs-rule'

describe('reason chip (board cards and list rows)', () => {
  it('prefers the filter reason, then Needs a look, then the Fit ceiling, then the first penalty, then an info', () => {
    const notes = { penalties: ['Uncertain fit — review', 'Senior title'], infos: ['Relocation offered'] }
    const ceiling = { score: 34, reason: 'Language: Arabic required' }
    expect(reasonChip({ status: 'filtered', filterReason: 'Not your field', notes, ceiling, needsLook: true })).toMatchObject({
      label: 'Not your field',
      tone: 'warning',
    })
    expect(reasonChip({ status: 'new', notes, ceiling, needsLook: true })?.label).toBe('Needs a look')
    expect(reasonChip({ status: 'new', notes, ceiling })).toMatchObject({ label: 'Language: Arabic required', title: expect.stringContaining('capped at 34') })
    expect(reasonChip({ status: 'new', notes })).toMatchObject({ label: 'Uncertain fit — review', title: 'Ranked lower: Uncertain fit — review' })
    expect(reasonChip({ status: 'new', notes: { infos: ['Relocation offered'] } })).toMatchObject({ label: 'Relocation offered', tone: 'neutral' })
  })

  it('says nothing without a reason; a filtered row without a reason falls through', () => {
    expect(reasonChip({ status: 'new' })).toBeNull()
    expect(reasonChip({ status: 'new', notes: { boosts: ['Laravel'] } })).toBeNull()
    expect(reasonChip({ status: 'filtered', filterReason: null })).toBeNull()
  })

  it('the Needs a look seam is off until the relevance gate ships it', () => {
    expect(isNeedsLook({ status: 'new', relevanceNotes: { penalties: ['Uncertain fit — review'] } })).toBe(false)
  })
})

describe('Discovery subtitle counts', () => {
  it('reports outcomes with links: fetched · to triage · filtered', () => {
    const parts = discoveryCountParts({ fetched: 886, toTriage: 6, needsLook: 0, filtered: 880 })
    expect(parts.map((p) => p.text)).toEqual(['886 fetched', '6 to triage', '880 filtered'])
    expect(parts.find((p) => p.key === 'filtered')!.href).toBe('/discoveries?tab=jobs&status=filtered&view=list')
    expect(parts.find((p) => p.key === 'triage')!.href).toBe('/discoveries?tab=jobs&view=list')
    expect(parts.find((p) => p.key === 'fetched')!.href).toBe('/settings/sources')
  })

  it('adds "need a look" only when there are some, and drops "fetched" before the first poll', () => {
    expect(discoveryCountParts({ fetched: 10, toTriage: 1, needsLook: 1, filtered: 2 }).map((p) => p.text)).toEqual([
      '10 fetched',
      '1 to triage',
      '1 needs a look',
      '2 filtered',
    ])
    expect(discoveryCountParts({ fetched: null, toTriage: 0, needsLook: 3, filtered: 0 }).map((p) => p.text)).toEqual([
      '0 to triage',
      '3 need a look',
      '0 filtered',
    ])
    expect(discoveryCountParts({ fetched: 1234, toTriage: 0, needsLook: 0, filtered: 0 })[0]!.text).toBe('1,234 fetched')
  })
})

describe('Labs default', () => {
  it('is on for the owner, off for invitees, and a saved choice wins', () => {
    expect(labsDefault(true)).toBe(true)
    expect(labsDefault(false)).toBe(false)
    expect(labsOn(null, true)).toBe(true)
    expect(labsOn(undefined, false)).toBe(false)
    expect(labsOn(true, false)).toBe(true)
    expect(labsOn(false, true)).toBe(false)
  })
})
