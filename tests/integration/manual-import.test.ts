import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeUser } from '@/tests/factories'
import { db } from '@/lib/db/client'
import { discoveries, sources } from '@/lib/db/schema'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import * as sourcesQ from '@/lib/db/queries/sources'
import * as adapters from '@/lib/discovery/adapters'
import { importOpenings, MANUAL_IMPORT_KIND } from '@/lib/discovery/manual-import/service'
import { extractOpenings } from '@/lib/discovery/manual-import/extract'
import { unavailableAi } from '@/lib/discovery/manual-import/no-ai'
import type { DiscoveryItem, NormalizedJob } from '@/lib/discovery/adapters/types'
import type { ImportCandidate } from '@/lib/discovery/manual-import/types'

const GH = 'https://boards.greenhouse.io/exampleco/jobs/4567890'

function stubGreenhouse(items: DiscoveryItem[]): ReturnType<typeof vi.fn> {
  const fetchBoard = vi.fn(async () => items)
  const real = adapters.getAdapter
  vi.spyOn(adapters, 'getAdapter').mockImplementation((kind: string) =>
    kind === 'greenhouse' ? { kind, fetch: fetchBoard } : real(kind),
  )
  return fetchBoard
}

const boardJob: DiscoveryItem = {
  sourceItemId: '4567890',
  raw: { id: 4567890 },
  normalized: {
    kind: 'job',
    title: 'Data Analyst',
    companyName: 'exampleco',
    location: 'Dubai, United Arab Emirates',
    applyUrl: GH,
    descriptionMd: 'SQL, Power BI and stakeholder reporting.',
    techStack: [],
    raw: {},
  } satisfies NormalizedJob,
}

function cand(url: string, over: Partial<ImportCandidate> = {}): ImportCandidate {
  return { title: 'Backend Engineer', employer: 'Sample Fintech', location: 'Riyadh', postedDate: '', url, snippet: 'Pasted.', ...over }
}

async function rowsFor(userId: string) {
  return db.select().from(discoveries).where(eq(discoveries.userId, userId))
}

describe('importOpenings', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('imports picked openings as manual_import discoveries, enriching ATS links', async () => {
    const u = await makeUser()
    const fetchBoard = stubGreenhouse([boardJob])
    const summary = await importOpenings({
      userId: u.id,
      ai: new FixtureAIProvider(),
      candidates: [cand(GH, { title: 'Data Analyst', employer: 'Example Co' }), cand('https://www.linkedin.com/jobs/view/1234567890')],
    })
    expect(summary).toMatchObject({ imported: 2, duplicates: 0, enriched: 1 })
    expect(fetchBoard).toHaveBeenCalledTimes(1)

    const [src] = await db.select().from(sources).where(eq(sources.userId, u.id))
    expect(src).toMatchObject({ kind: MANUAL_IMPORT_KIND, enabled: false })
    const rows = await rowsFor(u.id)
    const byTitle = new Map(rows.map((r) => [(r.normalized as NormalizedJob).title, r]))
    const enriched = byTitle.get('Data Analyst')!.normalized as NormalizedJob
    expect(enriched.descriptionMd).toMatch(/Power BI/)
    expect(enriched.companyName).toBe('Example Co')
    const linkOnly = byTitle.get('Backend Engineer')!.normalized as NormalizedJob
    expect(linkOnly).toMatchObject({ applyUrl: 'https://linkedin.com/jobs/view/1234567890', subSource: 'linkedin', descriptionMd: 'Pasted.' })
    // Gate ran: every row carries a relevance key.
    expect(rows.every((r) => r.relevanceKey)).toBe(true)
  })

  it('skips openings already in Discovery from any source (link or employer + title)', async () => {
    const u = await makeUser()
    const other = await sourcesQ.create(u.id, { name: 'Board', kind: 'greenhouse', config: { company: 'x' } })
    await db.insert(discoveries).values({
      userId: u.id,
      sourceId: other.id,
      sourceJobId: 'x-1',
      raw: {},
      normalized: { kind: 'job', title: 'QA Engineer', companyName: 'Demo Co', applyUrl: 'https://www.careers.example.org/jobs/1/', descriptionMd: '', techStack: [] },
    })
    const summary = await importOpenings({
      userId: u.id,
      ai: unavailableAi('no key'),
      candidates: [
        cand('https://careers.example.org/jobs/1?utm_source=x'),
        cand('https://careers.example.org/jobs/2', { title: 'qa engineer', employer: 'Demo Co LLC' }),
        cand('https://careers.example.org/jobs/3', { title: 'New Role' }),
      ],
    })
    expect(summary).toMatchObject({ imported: 1, duplicates: 2 })
    const again = await importOpenings({ userId: u.id, ai: unavailableAi('no key'), candidates: [cand('https://careers.example.org/jobs/3', { title: 'New Role' })] })
    expect(again).toMatchObject({ imported: 0, duplicates: 1 })
    const manual = (await sourcesQ.list(u.id)).filter((s) => s.kind === MANUAL_IMPORT_KIND)
    expect(manual).toHaveLength(1)
  })

  it('tags openings at a watched GCC employer', async () => {
    const u = await makeUser()
    await importOpenings({
      userId: u.id,
      ai: unavailableAi('no key'),
      candidates: [cand('https://careers.etihad.com/job/123', { title: 'Data Engineer', employer: 'Etihad Airways' })],
    })
    const [row] = await rowsFor(u.id)
    expect((row!.normalized as NormalizedJob).tags).toEqual(expect.arrayContaining(['via:manual_import', 'employer:etihad-airways']))
  })

  it('paste → extract → import works with no AI key (links only)', async () => {
    const u = await makeUser()
    const text = 'Backend Engineer at Sample Fintech (Riyadh) https://careers.example.org/jobs/77\nhttps://www.bayt.com/en/uae/jobs/data-analyst-1234567/'
    const extracted = await extractOpenings(text, null)
    expect(extracted.mode).toBe('urls')
    const summary = await importOpenings({
      userId: u.id,
      ai: unavailableAi('no key'),
      candidates: extracted.candidates.map((c) => ({ ...c, title: c.title || 'Data Analyst' })),
    })
    expect(summary.imported).toBe(2)
  })
})
