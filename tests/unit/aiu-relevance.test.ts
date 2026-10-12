import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BambooHrAdapter } from '@/lib/discovery/adapters/bamboohr'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'
import { evaluateRelevance, formatReasons } from '@/lib/discovery/relevance/gate'
import { EMPTY_PREFS, type SearchPrefs } from '@/lib/discovery/relevance/prefs'
import { detectSeniority } from '@/lib/discovery/relevance/seniority'
import { domainEvidence } from '@/lib/discovery/relevance/domains'
import { REGION_CODES } from '@/lib/discovery/relevance/places'
import { fakeBamboo } from '@/tests/fixtures/bamboohr/serve'

/**
 * The AIU board (synthetic fixtures modelled on aiu.bamboohr.com) through
 * the adapter and the relevance gate for the owner's preferences: backend /
 * web and data-analysis roles, junior to mid, the GCC.
 */
const OWNER: SearchPrefs = {
  ...EMPTY_PREFS,
  active: true,
  roleFamilies: ['backend', 'fullstack', 'data_analyst'],
  seniority: ['junior', 'mid'],
  regionIds: ['gcc', 'kerala'],
  regions: [...REGION_CODES],
  remoteScope: 'worldwide',
}

let original: typeof globalThis.fetch
beforeEach(() => {
  original = globalThis.fetch
  globalThis.fetch = fakeBamboo().fetch
})
afterEach(() => {
  globalThis.fetch = original
})

describe('AIU board through the relevance gate', () => {
  it('keeps the IT, web and data roles in Kuwait; filters professor, dean, mandoub and auditor', async () => {
    const items = await new BambooHrAdapter({ spacingMs: 0 }).fetch({ company: 'aiu', displayName: 'American International University' })
    const verdict = Object.fromEntries(
      items.map((i) => {
        const j = i.normalized as NormalizedJob
        const r = evaluateRelevance({ title: j.title, location: j.location, remoteType: j.remoteType, descriptionMd: j.descriptionMd, techStack: j.techStack }, OWNER)
        expect(r.regionIds, j.title).toEqual(expect.arrayContaining(['jahra', 'kw', 'gcc']))
        return [i.sourceItemId, r.pass ? 'new' : `filtered: ${formatReasons(r.reasons)}`]
      }),
    )
    expect(verdict['475']).toBe('new') // Application Developer (local hire: a chip, not a filter)
    expect(verdict['522']).toBe('new') // Web Developer & Designer / SEO Specialist
    expect(verdict['523']).toBe('new') // Institutional Research Officer
    expect(verdict['526']).toBe('new') // AI Technician
    expect(verdict['494']).toMatch(/^filtered: .*Teaching/) // Professor of Physics
    expect(verdict['464']).toMatch(/^filtered: /) // Dean
    expect(verdict['527']).toMatch(/^filtered: .*Admin/) // Mandoub
    expect(verdict['446']).toMatch(/^filtered: .*Accounting/) // Internal Auditor
  })
})

describe('relevance rules r9', () => {
  it('deans, provosts and chancellors are director level', () => {
    expect(detectSeniority('Dean – School of Engineering & Computing')).toBe('director')
    expect(detectSeniority('Associate Dean of Students')).toBe('director')
    expect(detectSeniority('Vice Provost for Research')).toBe('director')
  })

  it('mandoub, counsellor and dean titles are non-tech domains; AI Technician is not a trade', () => {
    expect(domainEvidence('Mandoub', '').domain?.id).toBe('admin')
    expect(domainEvidence('Government Relations Officer (PRO)', '').domain?.id).toBe('admin')
    expect(domainEvidence('Mental Health Counsellor', '').domain?.id).toBe('healthcare')
    expect(domainEvidence('Dean of Faculty', '').domain?.id).toBe('teaching')
    expect(domainEvidence('AI Technician', '').techTitle).toBe(true)
    expect(domainEvidence('HVAC Technician', '').techTitle).toBe(false)
  })
})
