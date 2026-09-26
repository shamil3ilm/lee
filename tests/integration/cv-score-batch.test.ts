import { describe, expect, it, vi } from 'vitest'
import { pgliteClient } from '@/lib/db/client'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import { MAX_AI_ITEMS_PER_BATCH, batchScoreMaster } from '@/lib/cv-score/compare'
import { saveMasterCV } from '@/lib/documents/master'
import { makeApplication, makeCompany, makeJob, makeUser } from '@/tests/factories'
import { NOW, strongCv } from '@/tests/fixtures/cv-score/cvs'

const PARSED_META = {
  seniority: 'senior',
  tech_stack: ['TypeScript', 'Postgres'],
  requirements: [
    '5+ years of backend engineering experience',
    'Strong experience with PostgreSQL and event-driven systems',
    'Experience mentoring engineers',
  ],
}

async function seed(n: number) {
  const user = await makeUser()
  const company = await makeCompany(user.id, { name: 'FinPay' })
  for (let i = 0; i < n; i++) {
    const job = await makeJob(user.id, company.id, {
      title: `Senior Backend Engineer ${i}`,
      parsedMeta: PARSED_META,
      descriptionMd: 'FinPay builds payments infrastructure.',
    })
    await makeApplication(user.id, job.id, { status: 'applied' })
  }
  await saveMasterCV(user.id, strongCv())
  return user.id
}

describe('batchScoreMaster', () => {
  it('reuses the preloaded applications and profile instead of re-fetching per item', async () => {
    const userId = await seed(6)
    const spy = vi.spyOn(pgliteClient!, 'query')
    const b = await batchScoreMaster({ userId, ai: null, now: NOW })
    const sqls = spy.mock.calls.map((c) => String(c[0]))
    spy.mockRestore()
    expect(b.rows).toHaveLength(6)
    // Before: the list plus one application lookup per item, and one
    // user_profile read per item. Now constant: the lean list plus one batched
    // load of the full job rows (JD) for the batch, however many items.
    expect(sqls.filter((s) => /from "applications"/i.test(s))).toHaveLength(2)
    expect(sqls.filter((s) => /from "user_profile"/i.test(s)).length).toBeLessThanOrEqual(1)
  })

  it(`runs the AI requirement fit on at most ${MAX_AI_ITEMS_PER_BATCH} items per batch`, async () => {
    const userId = await seed(MAX_AI_ITEMS_PER_BATCH + 3)
    const ai = new FixtureAIProvider()
    const fit = vi.spyOn(ai, 'assessRequirementFit')
    const b = await batchScoreMaster({ userId, ai, includeAi: true, now: NOW })
    expect(b.rows).toHaveLength(MAX_AI_ITEMS_PER_BATCH + 3)
    expect(fit.mock.calls.length).toBeLessThanOrEqual(MAX_AI_ITEMS_PER_BATCH)
    expect(b.aiCapped).toBe(true)
  })
})
