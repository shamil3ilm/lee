import { describe, it, expect, vi } from 'vitest'
import { enrichCandidates, pastedItem } from '@/lib/discovery/manual-import/enrich'
import { dropDuplicates, employerTitleKey, keysOf } from '@/lib/discovery/manual-import/dedupe'
import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from '@/lib/discovery/adapters/types'
import type { ImportCandidate } from '@/lib/discovery/manual-import/types'

function cand(url: string, over: Partial<ImportCandidate> = {}): ImportCandidate {
  return { title: 'Data Analyst', employer: 'Example Co', location: 'Dubai', postedDate: '', url, snippet: 'From the paste.', ...over }
}

function boardItem(id: string, title: string, applyUrl: string): DiscoveryItem {
  const normalized: NormalizedJob = {
    kind: 'job',
    title,
    companyName: 'exampleco',
    location: 'Dubai, UAE',
    applyUrl,
    descriptionMd: 'Full description from the board.',
    techStack: [],
    raw: { id },
  }
  return { sourceItemId: id, raw: { id }, normalized }
}

function fakeAdapters(items: Record<string, DiscoveryItem[] | Error>) {
  const calls: Array<{ kind: string; config: unknown }> = []
  const getAdapter = vi.fn((kind: string): DiscoveryAdapter | null => {
    const result = items[kind]
    if (!result) return null
    return {
      kind,
      async fetch(config: unknown) {
        calls.push({ kind, config })
        if (result instanceof Error) throw result
        return result
      },
    }
  })
  return { getAdapter, calls }
}

const GH = 'https://boards.greenhouse.io/exampleco/jobs/4567890'

describe('enrichCandidates', () => {
  it('fills a known ATS posting from its board, reading each board once', async () => {
    const { getAdapter, calls } = fakeAdapters({
      greenhouse: [boardItem('4567890', 'Data Analyst II', GH), boardItem('4567891', 'BI Analyst', `${GH.slice(0, -1)}1`)],
    })
    const out = await enrichCandidates([cand(GH), cand(`${GH.slice(0, -1)}1`, { title: 'BI Analyst' })], { getAdapter })
    expect(calls).toEqual([{ kind: 'greenhouse', config: { company: 'exampleco' } }])
    expect(out.map((o) => o.enrichedFrom)).toEqual(['greenhouse', 'greenhouse'])
    const job = out[0]!.item.normalized as NormalizedJob
    expect(job.title).toBe('Data Analyst II')
    expect(job.descriptionMd).toMatch(/Full description/)
    expect(job.companyName).toBe('Example Co')
    expect(job.tags).toEqual(expect.arrayContaining(['via:manual_import', 'ats:greenhouse']))
    expect(out[0]!.item.sourceItemId).toBe('greenhouse:exampleco:4567890')
  })

  it('keeps the pasted details when the posting is not on the board or the board fails', async () => {
    const missing = fakeAdapters({ greenhouse: [boardItem('1', 'Other', 'https://boards.greenhouse.io/exampleco/jobs/1')] })
    const failing = fakeAdapters({ greenhouse: new Error('greenhouse 500') })
    for (const deps of [missing, failing]) {
      const [o] = await enrichCandidates([cand(GH)], deps)
      expect(o!.enrichedFrom).toBeNull()
      expect((o!.item.normalized as NormalizedJob).descriptionMd).toBe('From the paste.')
    }
  })

  it('never fetches link-only pages (LinkedIn, SmartRecruiters, careers sites)', async () => {
    const { getAdapter } = fakeAdapters({})
    const out = await enrichCandidates(
      [
        cand('https://linkedin.com/jobs/view/1234567890'),
        cand('https://jobs.smartrecruiters.com/ExampleCo/743999'),
        cand('https://careers.example.org/jobs/1'),
      ],
      { getAdapter },
    )
    expect(getAdapter).not.toHaveBeenCalled()
    expect(out.every((o) => o.enrichedFrom === null)).toBe(true)
    expect((out[0]!.item.normalized as NormalizedJob).subSource).toBe('linkedin')
  })

  it('narrows a Workday read with the title and matches the external path', async () => {
    const url = 'https://exampleco.wd3.myworkdayjobs.com/en-US/External/job/Dubai/Data-Analyst_R123'
    const { getAdapter, calls } = fakeAdapters({
      workday: [boardItem('/job/Dubai/Data-Analyst_R123', 'Data Analyst', 'https://exampleco.wd3.myworkdayjobs.com/External/job/Dubai/Data-Analyst_R123')],
    })
    const [o] = await enrichCandidates([cand(url)], { getAdapter })
    expect(calls[0]!.config).toEqual({ url: 'https://exampleco.wd3.myworkdayjobs.com/External', searchText: 'Data Analyst' })
    expect(o!.enrichedFrom).toBe('workday')
  })

  it('pastedItem keeps title, employer, location, link and snippet only', () => {
    const item = pastedItem(cand('https://careers.example.org/jobs/1?utm_source=x', { postedDate: '2026-10-01' }))
    const job = item.normalized as NormalizedJob
    expect(item.sourceItemId).toBe('url:https://careers.example.org/jobs/1')
    expect(job).toMatchObject({ title: 'Data Analyst', companyName: 'Example Co', location: 'Dubai', applyUrl: 'https://careers.example.org/jobs/1' })
    expect(job.postedAt?.toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })
})

describe('dedupe', () => {
  const existing = keysOf([
    { applyUrl: 'https://www.careers.example.org/jobs/1/', title: 'Other', companyName: 'Other' },
    { applyUrl: null, title: 'Data Analyst', companyName: 'Sample Bank LLC' },
  ])

  it('drops items with the same canonical link or the same employer and title', () => {
    const items = [
      pastedItem(cand('https://careers.example.org/jobs/1')),
      pastedItem(cand('https://careers.example.org/jobs/2', { employer: 'Sample Bank' })),
      pastedItem(cand('https://careers.example.org/jobs/3', { title: 'New Role' })),
      pastedItem(cand('https://careers.example.org/jobs/3', { title: 'New Role' })),
    ]
    const r = dropDuplicates(items, existing)
    expect(r.fresh.map((i) => (i.normalized as NormalizedJob).applyUrl)).toEqual(['https://careers.example.org/jobs/3'])
    expect(r.duplicates).toBe(3)
  })

  it('ignores company suffixes and punctuation in the employer/title key', () => {
    expect(employerTitleKey('Sample Bank, L.L.C.', 'Data  Analyst')).toBe(employerTitleKey('sample bank', 'data analyst'))
    expect(employerTitleKey('', 'x')).toBeNull()
  })
})
