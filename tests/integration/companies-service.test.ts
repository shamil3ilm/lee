import { describe, it, expect, vi, beforeEach } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { addWatchedCompany } from '@/lib/companies/service'
import { makeUser } from '@/tests/factories'
import { db } from '@/lib/db/client'
import { companies, sources } from '@/lib/db/schema'

describe('addWatchedCompany', () => {
  beforeEach(() => {
    // Reset the global fetch between tests so ATS probing doesn't leak state.
    vi.restoreAllMocks()
  })

  it('creates + updates company and inserts a disabled ATS source when detected', async () => {
    const u = await makeUser()
    global.fetch = vi.fn(
      async (url: RequestInfo | URL) =>
        new Response('', { status: String(url).includes('greenhouse') ? 200 : 404 }),
    ) as unknown as typeof fetch

    const r = await addWatchedCompany({
      userId: u.id,
      name: 'Stripe',
      domain: 'stripe.com',
      size: '1000+',
      stage: 'public',
      interestLevel: 5,
    })

    expect(r.company.isWatched).toBe(true)
    expect(r.company.stance).toBe('watching')
    expect(r.company.size).toBe('1000+')
    expect(r.company.stage).toBe('public')
    expect(r.company.interestLevel).toBe(5)
    expect(r.detectedSource?.kind).toBe('greenhouse')
    expect(r.detectedSource?.slug).toBe('stripe')

    const src = await db
      .select()
      .from(sources)
      .where(and(eq(sources.userId, u.id), eq(sources.kind, 'greenhouse')))
    expect(src).toHaveLength(1)
    expect(src[0]!.enabled).toBe(false)
    expect(src[0]!.config).toMatchObject({ company: 'stripe', companyId: r.company.id })
  })

  it('inserts no source row when no ATS responds', async () => {
    const u = await makeUser()
    global.fetch = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch

    const r = await addWatchedCompany({
      userId: u.id,
      name: 'Nowhere Corp',
      domain: 'nowhere.example',
    })

    expect(r.detectedSource).toBeNull()
    const src = await db.select().from(sources).where(eq(sources.userId, u.id))
    expect(src).toHaveLength(0)
  })

  it('preserves existing company fields when args omit them', async () => {
    const u = await makeUser()
    global.fetch = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch

    await addWatchedCompany({
      userId: u.id,
      name: 'Acme',
      domain: 'acme.com',
      size: '500',
      stage: 'series-b',
    })

    // Add again with only name — size/stage should stick.
    await addWatchedCompany({
      userId: u.id,
      name: 'Acme',
      domain: 'acme.com',
    })

    const [row] = await db
      .select()
      .from(companies)
      .where(and(eq(companies.userId, u.id), eq(companies.domain, 'acme.com')))
    expect(row!.size).toBe('500')
    expect(row!.stage).toBe('series-b')
  })
})
