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
