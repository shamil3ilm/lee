import { describe, expect, it } from 'vitest'
import { diffDocuments, parseChoices, sectionValue } from '@/lib/portfolio/diff'
import { toJsonResume, type JsonDoc } from '@/lib/portfolio/map'
import { applyRepoSections } from '@/lib/portfolio/reverse'
import { checkPortfolioProfile } from '@/lib/portfolio/checks'
import type { ResumeProfile } from '@/lib/resume/types'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'

const META = { version: 'v1.0.1', lastModified: '2026-10-02T09:30:00Z' }

function handEdited(doc: JsonDoc): JsonDoc {
  const copy = JSON.parse(JSON.stringify(doc)) as JsonDoc
  const work = copy.work as Array<{ highlights: string[] }>
  work[0]!.highlights[0] = 'Designed an idempotent payouts API in Go handling 2M+ requests per day (edited on GitHub).'
  const meta = copy.meta as JsonDoc
  meta.version = 'v1.0.7'
  meta.lastModified = '2026-10-05T10:00:00Z'
  const x = meta['x-portfolio'] as { quickView: { line: string }; order: { work: string[] } }
  x.quickView.line = 'Payments, ledgers and e-invoicing.'
  x.order.work = [...x.order.work].reverse()
  copy.volunteer = [{ organization: 'Code Club' }]
  return copy
}

describe('diffDocuments', () => {
  it('finds nothing between identical files, ignoring version, timestamp and order', () => {
    const lee = toJsonResume(syntheticProfile(), META)
    const repo = JSON.parse(JSON.stringify(lee)) as JsonDoc
    ;(repo.meta as JsonDoc).version = 'v9.0.0'
    expect(diffDocuments(repo, lee)).toEqual([])
  })

  it('reports field-level changes grouped by section', () => {
    const lee = toJsonResume(syntheticProfile(), META)
    const diff = diffDocuments(handEdited(lee), lee)
    expect(diff.map((d) => d.section)).toEqual(['work', 'portfolio', 'other'])
    expect(diff[0]!.changes).toEqual([
      {
        path: '/work/0/highlights/0',
        repo: 'Designed an idempotent payouts API in Go handling 2M+ requests per day (edited on GitHub).',
        lee: 'Designed an idempotent payouts API in Go handling 2M+ requests per day.',
      },
    ])
    expect(diff[1]!.changes[0]).toMatchObject({ path: '/portfolio/quickView/line', lee: 'Payments and ledgers in Go.' })
    expect(diff[2]!.changes[0]).toMatchObject({ path: '/other/volunteer', lee: undefined })
  })

  it('parses only known sections and sides', () => {
    expect(parseChoices({ work: 'repo', basics: 'lee', meta: 'repo', skills: 'mine' })).toEqual({ work: 'repo', basics: 'lee' })
    expect(parseChoices(null)).toEqual({})
  })
})

describe('applyRepoSections (take the repo version)', () => {
  it('imports the chosen sections so the next publish reproduces the repo', () => {
    const profile = syntheticProfile()
    const repo = handEdited(toJsonResume(profile, META))
    const next = applyRepoSections(profile, repo, ['work', 'portfolio', 'other'])
    const out = toJsonResume(next, META)
    for (const s of ['work', 'portfolio', 'other'] as const) expect(sectionValue(out, s)).toEqual(sectionValue(repo, s))
    expect(diffDocuments(repo, out)).toEqual([])
    expect(checkPortfolioProfile(out)).toEqual([])
    // Ids, readiness and alternates of matched items survive.
    expect(next.work[0]!.id).toBe('w-payflow')
    expect(next.work[0]!.highlights[1]!.id).toBe('h-ledger')
    expect(next.portfolio.caseStudies[0]).toMatchObject({ workId: 'w-payflow' })
  })

  it('keeps lee-only private items and private fields', () => {
    const base = syntheticProfile()
    const profile: ResumeProfile = {
      ...base,
      work: [...base.work, { ...base.work[1]!, id: 'w-secret', name: 'Stealth Co', visibility: { _item: 'private' } }],
    }
    const repo = toJsonResume(base, META)
    const next = applyRepoSections(profile, repo, ['basics', 'work'])
    expect(next.work.map((w) => w.id)).toEqual(['w-payflow', 'w-shopkart', 'w-secret'])
    expect(next.basics.phone).toBe('+971 50 000 0000')
    expect(next.basics.nationality).toBe('Indian')
    expect(JSON.stringify(toJsonResume(next, META))).not.toContain('Stealth Co')
  })

  it('stops publishing a basics field the repo removed, without deleting it', () => {
    const profile = syntheticProfile()
    const repo = JSON.parse(JSON.stringify(toJsonResume(profile, META))) as JsonDoc
    delete (repo.basics as JsonDoc).summary
    const next = applyRepoSections(profile, repo, ['basics'])
    expect(next.basics.summary).toBe(profile.basics.summary)
    expect(next.basics.visibility.summary).toBe('private')
  })
})
