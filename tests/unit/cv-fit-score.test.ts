import { describe, expect, it } from 'vitest'
import { parseJd } from '@/lib/discovery/match/jd'
import type { MatchJob } from '@/lib/discovery/match/types'
import { renderedEvidence } from '@/lib/cv-fit/evidence'
import { jobRegions, regionFit, REGION_FIT_MAX } from '@/lib/cv-fit/region'
import { FIT_WEIGHTS, pickBest, rankFits, scoreVariant, type FitVariantInput } from '@/lib/cv-fit/score'
import { toBestCv, type VariantFit } from '@/lib/cv-fit/types'
import { buildRecipe } from '@/lib/variants/presets'
import { renderVariant } from '@/lib/variants/render'
import type { Region } from '@/lib/variants/types'
import { parseResumeProfile } from '@/lib/resume/types'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'

const GCC_JD: MatchJob = {
  title: 'Backend Engineer, Payments',
  location: 'Dubai, UAE',
  remoteType: 'onsite',
  descriptionMd: [
    '## Responsibilities',
    '- Build payout and ledger services in Go.',
    '- Run reconciliation for merchant settlements.',
    '## Requirements',
    '- 3+ years with Go.',
    '- Strong PostgreSQL experience.',
    '- Kafka or RabbitMQ.',
    '- Kubernetes in production.',
    '## Nice to have',
    '- Experience with React.',
  ].join('\n'),
}

function variant(region: Region, family: string | null, id = `v-${region}-${family ?? 'none'}`, quality = 70): FitVariantInput {
  const profile = syntheticProfile()
  const rendered = renderVariant(profile, buildRecipe(profile, { region, roleFamily: family }))
  return { id, version: 1, name: `${region} · ${family ?? 'General'}`, region, roleFamily: family, evidence: renderedEvidence(rendered), quality }
}

function job(m: MatchJob) {
  return { job: m, jd: parseJd(m), regions: jobRegions(m), families: ['payments'] }
}

describe('renderedEvidence', () => {
  it('reads skills from what the variant shows', () => {
    const ev = variant('gcc', 'payments').evidence
    expect(ev.skills.has('go')).toBe(true)
    expect(ev.skills.has('postgresql')).toBe(true)
    expect(ev.evidence.some((l) => l.startsWith('Skills:'))).toBe(true)
  })

  it('never reads skills from a design-only bullet or a not-ready item', () => {
    const profile = parseResumeProfile({
      ...syntheticProfile(),
      work: [
        {
          id: 'w-1',
          name: 'Acme',
          position: 'Engineer',
          startDate: '2020-01',
          highlights: [
            { id: 'h-1', text: 'Built REST APIs in Go.' },
            { id: 'h-2', text: 'Designed the Kubernetes rollout plan.', depth: 'ai_assisted', domainReady: true },
            { id: 'h-3', text: 'Wrote Terraform modules.', depth: 'learning' },
          ],
        },
      ],
      projects: [],
      skills: [],
    })
    const recipe = buildRecipe(profile, { region: 'remote', roleFamily: null })
    // Include the not-ready highlights by hand: render still decides.
    const work = [{ id: 'w-1', highlights: ['h-1', 'h-2', 'h-3'].map((id) => ({ id, wordingId: null })) }]
    const ev = renderedEvidence(renderVariant(profile, { ...recipe, work }))
    expect(ev.skills.has('go')).toBe(true)
    expect(ev.skills.has('kubernetes')).toBe(false)
    expect(ev.skills.has('terraform')).toBe(false)
    expect(ev.evidence).toContain('Designed the Kubernetes rollout plan.')
    expect(ev.evidence.join(' ')).not.toContain('Terraform')
  })
})

describe('regionFit', () => {
  it('maps job places to résumé conventions', () => {
    expect(jobRegions(GCC_JD)).toEqual(['gcc'])
    expect(jobRegions({ title: 'Engineer', location: 'Bengaluru, India' })).toEqual(['india'])
    expect(jobRegions({ title: 'Engineer', location: 'Remote', remoteType: 'remote' })).toEqual(['remote'])
    expect(jobRegions({ title: 'Engineer', location: 'Berlin, Germany' })).toEqual(['remote'])
    expect(jobRegions({ title: 'Engineer', location: '' })).toEqual([])
  })

  it('scores the region table', () => {
    expect(regionFit('gcc', ['gcc']).points).toBe(REGION_FIT_MAX)
    expect(regionFit('gcc', []).points).toBe(9)
    expect(regionFit('remote', ['gcc']).points).toBe(6)
    expect(regionFit('gcc', ['remote']).points).toBe(4)
    expect(regionFit('india', ['gcc']).points).toBe(0)
    expect(regionFit('gcc', ['gcc']).label).toBe('GCC variant for a GCC job')
  })
})

describe('scoreVariant', () => {
  it('scores coverage, responsibilities, region and quality into 0–100', () => {
    const f = scoreVariant(variant('gcc', 'payments'), job(GCC_JD))
    expect(f.familyHit).toBe(true)
    expect(scoreVariant(variant('gcc', 'data_analyst'), job(GCC_JD)).familyHit).toBe(false)
    expect(f.fit).toBeGreaterThan(0)
    expect(f.fit).toBeLessThanOrEqual(100)
    expect(f.must.total).toBe(4)
    // Go and PostgreSQL are on the CV. Kafka is only a job keyword (the
    // résumé never prints it) and Kubernetes is nowhere.
    expect(f.must.met).toBe(2)
    expect(f.must.missing).toBe(2)
    expect(f.reasons[0]).toBe('Covers 2 of 4 must-haves')
    expect(f.reasons).toContain('GCC variant for a GCC job')
  })

  it('prefers the GCC variant for a GCC job when coverage is equal', () => {
    const gcc = scoreVariant(variant('gcc', 'payments'), job(GCC_JD))
    const remote = scoreVariant(variant('remote', 'payments'), job(GCC_JD))
    expect(gcc.must).toEqual(remote.must)
    expect(gcc.fit - remote.fit).toBe(REGION_FIT_MAX - 6)
  })

  it('falls back to the JD skills when no line can be checked', () => {
    const titleOnly: MatchJob = { title: 'Go Developer', location: 'Remote', remoteType: 'remote', techStack: ['Go', 'Rust'] }
    const f = scoreVariant(variant('remote', 'backend'), job(titleOnly))
    expect(f.reasons[0]).toMatch(/^Shows 1 of 2 skills asked$/)
  })

  it('weights add up to 100', () => {
    expect(Object.values(FIT_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100)
  })
})

function fit(over: Partial<VariantFit>): VariantFit {
  return {
    variantId: 'a',
    version: 1,
    name: 'A',
    region: 'gcc',
    fit: 70,
    must: { met: 1, partial: 0, missing: 0, total: 1 },
    reasons: ['Covers 1 of 1 must-haves'],
    covered: [],
    quality: 60,
    familyHit: false,
    ...over,
  }
}

describe('pickBest', () => {
  it('returns null with no variants', () => {
    expect(pickBest([])).toBeNull()
  })

  it('picks the best and the runner-up with reasons', () => {
    const r = pickBest([
      fit({ variantId: 'b', name: 'Payments · GCC', fit: 71, covered: ['Go'] }),
      fit({ variantId: 'a', name: 'Data Analyst · GCC', fit: 78, covered: ['Go', 'Power BI dashboards'] }),
    ])!
    expect(r.best.variantId).toBe('a')
    expect(r.runnerUp?.variantId).toBe('b')
    expect(r.best.reasons).toContain('Only this one shows: Power BI dashboards')
    expect(r.runnerUp?.reasons).toContain('Misses: Power BI dashboards')
    expect(r.compared).toBe(2)
  })

  it('breaks ties on CV Score, then name', () => {
    const tied = rankFits([fit({ variantId: 'x', name: 'Z', quality: 50 }), fit({ variantId: 'y', name: 'Y', quality: 80 })])
    expect(tied[0]!.variantId).toBe('y')
    const same = rankFits([fit({ variantId: 'x', name: 'Z' }), fit({ variantId: 'y', name: 'B' })])
    expect(same[0]!.variantId).toBe('y')
    const r = pickBest([fit({ variantId: 'x', quality: 50 }), fit({ variantId: 'y', quality: 80 })])!
    expect(r.best.reasons.at(-1)).toBe('Tie on fit; higher CV Score (80 vs 50)')
    const family = pickBest([fit({ variantId: 'x', name: 'A' }), fit({ variantId: 'y', name: 'Z', familyHit: true })])!
    expect(family.best.variantId).toBe('y')
    expect(family.best.reasons.at(-1)).toBe('Tie on fit; built for this kind of role')
    expect(pickBest([fit({ variantId: 'x', name: 'A' }), fit({ variantId: 'y', name: 'Z' })])!.best.reasons.at(-1)).toBe('Tie on fit and CV Score')
  })

  it('round-trips through the stored reader and rejects junk', () => {
    const r = pickBest([fit({}), fit({ variantId: 'b', fit: 40 })])!
    expect(toBestCv(JSON.parse(JSON.stringify(r)))).toEqual(r)
    expect(toBestCv(null)).toBeNull()
    expect(toBestCv({ best: { variantId: 'a' } })).toBeNull()
    expect(toBestCv({ best: { ...r.best, region: 'mars' } })).toBeNull()
  })
})
