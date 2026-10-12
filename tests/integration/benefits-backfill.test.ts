import { afterEach, describe, expect, it, vi } from 'vitest'

// Same seam as queue-parity.test.ts: the discovery handler's AI provider.
const aiHolder = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('@/lib/ai', () => ({
  getAIProvider: () => aiHolder.current,
  getAIProviderForUser: async () => aiHolder.current,
  MODEL_REGISTRY: [],
  DEFAULT_MODEL_ID: 'gemini:gemini-2.0-flash',
  findModel: () => null,
}))
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import type { AIProvider } from '@/lib/ai'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import { discoveries } from '@/lib/db/schema'
import * as profileQ from '@/lib/db/queries/profile'
import * as sourcesQ from '@/lib/db/queries/sources'
import * as adapters from '@/lib/discovery/adapters'
import type { DiscoveryAdapter, DiscoveryItem } from '@/lib/discovery/adapters/types'
import { backfillBenefits, benefitsContextFor } from '@/lib/benefits/service'
import { appRegistry } from '@/lib/queue/handlers'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { scheduleDailyJobs } from '@/lib/queue/scheduler'
import { drain } from '@/lib/queue/drain'
import { makeDiscovery, makeSource, makeUser } from '@/tests/factories'

/** Benefits are extracted at ingest and re-extracted when the key changes. */

const JD = 'Laravel developer in Dubai. AED 14,000 per month, housing allowance, annual air ticket, medical insurance and visa sponsorship.'

afterEach(() => vi.restoreAllMocks())

function item(i: number, descriptionMd: string): DiscoveryItem {
  return {
    sourceItemId: `b-${i}`,
    raw: { id: i },
    normalized: {
      kind: 'job',
      title: `Developer ${i}`,
      companyName: 'Acme',
      remoteType: 'onsite',
      employmentType: 'fulltime',
      descriptionMd,
      applyUrl: `https://boards.greenhouse.io/acme/jobs/${i}`,
      techStack: ['php'],
      raw: {},
    },
  }
}

describe('benefits at ingest', () => {
  it('every new row gets a benefits score, detail and key (no AI needed)', async () => {
    const u = await makeUser()
    await sourcesQ.create(u.id, { name: 'Acme', kind: 'greenhouse', config: { company: 'acme' } })
    const fake: DiscoveryAdapter = { kind: 'greenhouse', fetch: async () => [item(1, JD), item(2, 'Build APIs.')] }
    vi.spyOn(adapters, 'getAdapter').mockImplementation((k: string) => (k === 'greenhouse' ? fake : null))
    aiHolder.current = new FixtureAIProvider({}) as unknown as AIProvider
    await scheduleDailyJobs(new Date())
    await drain({ budgetMs: 60_000, concurrency: 1 })
    const rows = await db.select().from(discoveries).where(eq(discoveries.userId, u.id))
    const byJob = new Map(rows.map((r) => [r.sourceJobId, r]))
    const rich = byJob.get('b-1')!
    expect(rich.benefitsScore).toBeGreaterThan(0)
    expect(rich.benefitsKey).toBe(benefitsContextFor(await profileQ.get(u.id)).key)
    expect((rich.benefitsDetail as { explanation: string }).explanation).toContain('Housing allowance')
    // Nothing stated: unknown (NULL), not 0.
    expect(byJob.get('b-2')!.benefitsScore).toBeNull()
  })
})

describe('benefits backfill', () => {
  it('re-extracts rows stored under another key, only once', async () => {
    const u = await makeUser()
    const src = await makeSource(u.id)
    const d = await makeDiscovery(u.id, src.id, { normalized: { title: 'Dev', companyName: 'Acme', descriptionMd: JD } })
    expect(await backfillBenefits(u.id)).toEqual({ updated: 1, more: false })
    const [row] = await db.select().from(discoveries).where(eq(discoveries.id, d.id))
    expect(row?.benefitsScore).toBeGreaterThan(0)
    expect(await backfillBenefits(u.id)).toEqual({ updated: 0, more: false })

    // New weights → new key → re-scored.
    await profileQ.upsert(u.id, { benefitPrefs: { weights: { housing_allowance: 50 } } })
    expect(await backfillBenefits(u.id)).toEqual({ updated: 1, more: false })
    const [after] = await db.select().from(discoveries).where(eq(discoveries.id, d.id))
    expect(after?.benefitsKey).not.toBe(row?.benefitsKey)
  })

  it('stops at maxRows and reports more', async () => {
    const u = await makeUser()
    const src = await makeSource(u.id)
    for (let i = 0; i < 3; i++) await makeDiscovery(u.id, src.id)
    expect(await backfillBenefits(u.id, { maxRows: 2 })).toEqual({ updated: 2, more: true })
    expect(await backfillBenefits(u.id)).toEqual({ updated: 1, more: false })
  })

  it('the daily job runs the backfill', async () => {
    const u = await makeUser()
    const src = await makeSource(u.id)
    await makeDiscovery(u.id, src.id, { normalized: { title: 'Dev', descriptionMd: JD } })
    const job = { id: crypto.randomUUID(), userId: u.id, type: JOB_TYPES.discoveryBenefits, payload: {}, attempts: 1, maxAttempts: 5, createdAt: new Date() }
    const r = await appRegistry.get(JOB_TYPES.discoveryBenefits)!.execute({ job, deadline: Date.now() + 30_000, signal: new AbortController().signal })
    expect(r.metrics).toEqual({ benefits_updated: 1 })
  })
})
