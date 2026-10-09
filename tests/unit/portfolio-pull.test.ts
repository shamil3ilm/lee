import { afterEach, describe, expect, it } from 'vitest'
import { DIFF_SECTIONS } from '@/lib/portfolio/diff'
import { toJsonResume, type JsonDoc } from '@/lib/portfolio/map'
import { findOrphans, keepLeeOnlyItemsPrivate, mergeOrphans } from '@/lib/portfolio/overlay'
import { applyPortfolio, publicFactsChanged } from '@/lib/portfolio/apply'
import { applyRepoSections } from '@/lib/portfolio/reverse'
import { portfolioEditUrl, profileEditableInLee, pullThrottleMs, PULL_THROTTLE_MS } from '@/lib/portfolio/sync-flags'
import type { ResumeProfile } from '@/lib/resume/types'
import { hl, syntheticProfile } from '@/tests/fixtures/resume/profile'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a JSON document the tests edit freely
type Loose = Record<string, any>

const META = { version: '1.0.0', lastModified: '2026-10-01T00:00:00Z' }
const NOW = new Date('2026-10-09T10:00:00Z')

let n = 0
const makeId = (): string => `new-${++n}`

/** The synthetic profile plus lee-only overlay: readiness, wordings, a private job and highlight. */
function withOverlay(): ResumeProfile {
  const p = syntheticProfile()
  const [payflow, shopkart] = p.work
  return {
    ...p,
    work: [
      {
        ...payflow!,
        highlights: [
          { ...payflow!.highlights[0]!, depth: 'ai_assisted', interviewReady: false, domainReady: true, alternates: [{ id: 'alt-1', text: 'Idempotent payouts API in Go at 2M+ requests per day', source: 'user' }] },
          ...payflow!.highlights.slice(1),
          hl('h-private', 'An internal-only result kept out of the portfolio.', { visibility: { _item: 'private' } }),
        ],
      },
      shopkart!,
      {
        id: 'w-secret',
        name: 'Stealth Startup',
        position: 'Consultant',
        location: '',
        url: '',
        description: '',
        startDate: '2024-01',
        endDate: '',
        summary: '',
        highlights: [],
        keywords: ['Go'],
        visibility: { _item: 'private' },
      },
    ],
    projects: [{ ...p.projects[0]!, depth: 'learning', interviewReady: false, domainReady: false, studyNotes: 'Revise the invariants.' }],
    skills: [{ ...p.skills[0]!, skills: [{ ...p.skills[0]!.skills[0]!, kind: 'domain', depth: 'ai_assisted', interviewReady: false, domainReady: true }, ...p.skills[0]!.skills.slice(1)] }, ...p.skills.slice(1)],
  }
}

function edit(doc: JsonDoc, fn: (d: Loose) => void): JsonDoc {
  const copy = JSON.parse(JSON.stringify(doc)) as Loose
  fn(copy)
  return copy
}

afterEach(() => {
  delete process.env.PORTFOLIO_PULL_THROTTLE_MS
})

describe('pull mapping round-trip', () => {
  it('toJsonResume → reverse (every section) gives the same profile.json and keeps ids, overlay and private items', () => {
    const lee = withOverlay()
    const doc = toJsonResume(lee, META)
    const back = applyRepoSections(lee, doc, DIFF_SECTIONS, makeId)
    expect(toJsonResume(back, META)).toEqual(doc)
    expect(back.work.map((w) => w.id)).toEqual(lee.work.map((w) => w.id))
    expect(back.work[0]!.highlights).toEqual(lee.work[0]!.highlights)
    expect(back.work.find((w) => w.id === 'w-secret')).toEqual(lee.work[2])
    // A matched item becomes explicitly public; everything else is unchanged.
    expect(back.projects[0]).toEqual({ ...lee.projects[0], visibility: { _item: 'public' } })
    expect(back.skills).toEqual(lee.skills.map((g) => ({ ...g, visibility: { _item: 'public' } })))
    expect(back.basics.phone).toBe(lee.basics.phone)
    expect(back.basics.nationality).toBe(lee.basics.nationality)
  })

  it('applies nothing when the portfolio already matches (same object back)', () => {
    const lee = withOverlay()
    const r = applyPortfolio(lee, toJsonResume(lee, META), { firstPull: false })
    expect(r.diff).toEqual([])
    expect(r.profile).toBe(lee)
  })
})

describe('overlay survives a pull', () => {
  it('a changed label and reworded highlight keep the ids, readiness and wordings', () => {
    const lee = withOverlay()
    const repo = edit(toJsonResume(lee, META), (d) => {
      d.basics.label = 'Payments Engineer'
      d.work[0].highlights[0] = 'Designed an idempotent payouts API in Go handling 2M+ requests per day, end to end.'
    })
    const r = applyPortfolio(lee, repo, { firstPull: false })
    expect(r.diff.map((d) => d.section)).toEqual(['basics', 'work'])
    expect(r.profile.basics.label).toBe('Payments Engineer')
    const h = r.profile.work[0]!.highlights[0]!
    expect(h).toMatchObject({ id: 'h-payouts', depth: 'ai_assisted', interviewReady: false, domainReady: true })
    expect(h.text).toContain('end to end')
    expect(h.alternates).toHaveLength(1)
    expect(r.profile.work[0]!.highlights.some((x) => x.id === 'h-private')).toBe(true)
    expect(r.profile.projects[0]).toMatchObject({ depth: 'learning', studyNotes: 'Revise the invariants.' })
    expect(r.profile.work.some((w) => w.id === 'w-secret')).toBe(true)
    // Matching keeps the work item's private stack.
    expect(r.profile.work[0]!.keywords).toEqual(['Go', 'PostgreSQL', 'Kafka'])
  })

  it('new items from the portfolio are not interview-ready', () => {
    const lee = syntheticProfile()
    const repo = edit(toJsonResume(lee, META), (d) => {
      d.projects.push({ name: 'Rate Limiter', description: 'Token buckets', highlights: ['Handles bursts.'] })
      d.work[1].highlights.push('Cut checkout latency by 30%.')
      d.skills[0].keywords.push('Rust')
    })
    const r = applyPortfolio(lee, repo, { firstPull: false })
    const project = r.profile.projects.find((p) => p.name === 'Rate Limiter')!
    expect(project).toMatchObject({ interviewReady: false, domainReady: false })
    expect(project.highlights[0]).toMatchObject({ interviewReady: false })
    expect(r.profile.work[1]!.highlights.at(-1)).toMatchObject({ text: 'Cut checkout latency by 30%.', interviewReady: false })
    expect(r.profile.skills[0]!.skills.find((s) => s.name === 'Rust')).toMatchObject({ interviewReady: false, domainReady: false })
    // Items lee already had keep their (ready) flags.
    expect(r.profile.projects.find((p) => p.name === 'Open Ledger')).toMatchObject({ interviewReady: true })
  })

  it('a skill moved to another group keeps its id, kind and readiness', () => {
    const lee = withOverlay()
    const repo = edit(toJsonResume(lee, META), (d) => {
      d.skills[0].keywords = d.skills[0].keywords.filter((k: string) => k !== 'Go')
      d.skills[1].keywords.push('Go')
    })
    const r = applyPortfolio(lee, repo, { firstPull: false })
    expect(r.profile.skills[1]!.skills.find((s) => s.name === 'Go')).toMatchObject({ id: 'sk-go', kind: 'domain', depth: 'ai_assisted' })
  })
})

describe('orphaned overlay', () => {
  it('items the portfolio removed are listed with the overlay they carried', () => {
    const lee = withOverlay()
    const repo = edit(toJsonResume(lee, META), (d) => {
      d.projects = []
      d.work[0].highlights.shift()
      d.meta['x-portfolio'].caseStudies = []
    })
    const r = applyPortfolio(lee, repo, { firstPull: false })
    expect(r.profile.projects).toEqual([])
    const orphans = findOrphans(lee, r.profile, NOW)
    expect(orphans.map((o) => [o.kind, o.id])).toEqual(
      expect.arrayContaining([
        ['project', 'pr-ledger'],
        ['highlight', 'h-ol'],
      ]),
    )
    expect(orphans.find((o) => o.id === 'pr-ledger')!.overlay).toMatchObject({ depth: 'learning', studyNotes: 'Revise the invariants.' })
    // Private items are never orphaned (the portfolio never had them).
    expect(orphans.some((o) => o.id === 'h-private' || o.id === 'w-secret')).toBe(false)
  })

  it('merging keeps the newest entry per id', () => {
    const a = { id: 'x', kind: 'project' as const, label: 'X', parent: null, overlay: { v: 1 }, removedAt: '2026-10-01T00:00:00Z' }
    const b = { ...a, overlay: { v: 2 }, removedAt: '2026-10-09T00:00:00Z' }
    expect(mergeOrphans([a], [b])).toEqual([b])
  })
})

describe('first pull', () => {
  it('keeps items the portfolio never had as private instead of dropping them', () => {
    const lee = syntheticProfile()
    const repo = edit(toJsonResume(lee, META), (d) => {
      d.work = d.work.slice(0, 1)
      d.meta['x-portfolio'].order.work = ['PayFlow']
    })
    const kept = keepLeeOnlyItemsPrivate(lee, repo)
    expect(kept.work.find((w) => w.name === 'ShopKart')!.visibility._item).toBe('private')
    const r = applyPortfolio(lee, repo, { firstPull: true })
    expect(r.profile.work.map((w) => w.name)).toEqual(['PayFlow', 'ShopKart'])
    expect(toJsonResume(r.profile, META).work).toEqual(repo.work)
  })
})

describe('lock and flags', () => {
  it('an overlay-only change is not a public change; a label is', () => {
    const lee = syntheticProfile()
    const ready = { ...lee, projects: lee.projects.map((p) => ({ ...p, interviewReady: false, studyNotes: 'notes' })) }
    expect(publicFactsChanged(lee, ready)).toBe(false)
    const privateJob = { ...lee, work: [...lee.work, { ...lee.work[0]!, id: 'w-x', name: 'Hidden', highlights: [], visibility: { _item: 'private' as const } }] }
    expect(publicFactsChanged(lee, privateJob)).toBe(false)
    expect(publicFactsChanged(lee, { ...lee, basics: { ...lee.basics, label: 'Other' } })).toBe(true)
  })

  it('edit-in-lee is off; the edit URL points at GitHub’s editor', () => {
    expect(profileEditableInLee()).toBe(false)
    expect(portfolioEditUrl({ repo: 'example-asha/portfolio', branch: 'main', path: 'data/profile.json' })).toBe(
      'https://github.com/example-asha/portfolio/edit/main/data/profile.json',
    )
    expect(portfolioEditUrl({ repo: '', branch: 'main', path: 'profile.json' })).toBeNull()
  })

  it('the throttle is 10 minutes unless overridden', () => {
    expect(pullThrottleMs()).toBe(PULL_THROTTLE_MS)
    process.env.PORTFOLIO_PULL_THROTTLE_MS = '0'
    expect(pullThrottleMs()).toBe(0)
  })
})
