import { describe, it, expect, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createApplicationFromUrl, updateStatus } from '@/lib/applications/service'
import { makeUser, makeCompany, makeJob, makeApplication } from '@/tests/factories'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import { db } from '@/lib/db/client'
import { activities, applications } from '@/lib/db/schema'

vi.mock('@/lib/ingest/fetch', () => ({
  fetchPage: vi.fn(async () => ({
    html: '<html><body><h1>Senior Backend Engineer</h1><p>Great role at Acme.</p></body></html>',
    finalUrl: 'https://acme.com/jobs/1',
    status: 200,
  })),
}))

vi.mock('@/lib/ingest/firecrawl', () => ({
  firecrawlFetch: vi.fn(async () => ''),
}))

describe('createApplicationFromUrl', () => {
  it('parses, creates company + job + application + activity', async () => {
    const u = await makeUser()
    const ai = new FixtureAIProvider({
      parseJob: () => ({
        title: 'Senior Backend Engineer',
        company_name: 'Acme',
        company_domain: 'acme.com',
        location: 'Remote',
        remote_type: 'remote',
        employment_type: 'fulltime',
        salary_min: null,
        salary_max: null,
        salary_currency: null,
        seniority: 'senior',
        tech_stack: ['laravel'],
        responsibilities: [],
        requirements: [],
        benefits: { visa_sponsorship: true },
      }),
    })
    const r = await createApplicationFromUrl({
      userId: u.id,
      url: 'https://acme.com/jobs/1',
      ai,
    })
    expect(r.application.status).toBe('saved')
    expect(r.job.title).toBe('Senior Backend Engineer')
    expect(r.company.domain).toBe('acme.com')
    expect(r.activities).toHaveLength(1)
    expect(r.activities[0]!.kind).toBe('status_change')
  })
})

describe('createApplicationFromUrl firecrawl fallback', () => {
  it('falls back to firecrawl markdown when cleaned text is short and FIRECRAWL_API_KEY is set', async () => {
    const u = await makeUser()
    const { fetchPage } = await import('@/lib/ingest/fetch')
    const { firecrawlFetch } = await import('@/lib/ingest/firecrawl')
    vi.mocked(fetchPage).mockResolvedValueOnce({
      html: '<html><body><div id="root"></div></body></html>',
      finalUrl: 'https://spa.example.com/jobs/42',
      status: 200,
    })
    const longMd = 'Senior Platform Engineer at Zeta. ' + 'Great role. '.repeat(200)
    vi.mocked(firecrawlFetch).mockResolvedValueOnce(longMd)

    // Ensure env has an API key for the fallback branch. env is validated at
    // import time so we mutate the module-level export in place.
    const envMod = await import('@/lib/env')
    const prev = envMod.env.FIRECRAWL_API_KEY
    ;(envMod.env as { FIRECRAWL_API_KEY?: string }).FIRECRAWL_API_KEY = 'test-key'

    const parseSpy = vi.fn(() => ({
      title: 'Senior Platform Engineer',
      company_name: 'Zeta',
      company_domain: 'zeta.com',
      location: null,
      remote_type: 'remote' as const,
      employment_type: 'fulltime' as const,
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      seniority: 'senior' as const,
      tech_stack: [],
      responsibilities: [],
      requirements: [],
      benefits: {},
    }))
    const ai = new FixtureAIProvider({ parseJob: parseSpy })

    try {
      await createApplicationFromUrl({
        userId: u.id,
        url: 'https://spa.example.com/jobs/42',
        ai,
      })
      expect(vi.mocked(firecrawlFetch)).toHaveBeenCalledWith('https://spa.example.com/jobs/42')
      expect(parseSpy).toHaveBeenCalledTimes(1)
      const passed = parseSpy.mock.calls[0]![0] as string
      expect(passed).toContain('Senior Platform Engineer at Zeta')
      expect(passed.length).toBeGreaterThan(500)
    } finally {
      ;(envMod.env as { FIRECRAWL_API_KEY?: string }).FIRECRAWL_API_KEY = prev
    }
  })
})

describe('updateStatus', () => {
  it('changes status, writes activity, sets applied_at on apply', async () => {
    const u = await makeUser()
    const c = await makeCompany(u.id)
    const j = await makeJob(u.id, c.id)
    const a = await makeApplication(u.id, j.id)
    await updateStatus({ userId: u.id, applicationId: a.id, newStatus: 'applied' })
    const [after] = await db.select().from(applications).where(eq(applications.id, a.id))
    expect(after!.status).toBe('applied')
    expect(after!.appliedAt).toBeTruthy()
    const acts = await db.select().from(activities).where(eq(activities.applicationId, a.id))
    expect(acts.some((x) => x.kind === 'status_change')).toBe(true)
  })
})
