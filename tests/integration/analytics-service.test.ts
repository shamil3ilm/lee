import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db/client'
import { activities, aiCallLogs, discoveries, sources } from '@/lib/db/schema'
import {
  aiUsageStats,
  discoveryCalibration,
  responseTimeDistribution,
  sourceFunnel,
  statusDistribution,
  timeToOutcome,
  weeklyActivity,
} from '@/lib/analytics/service'
import { makeApplication, makeCompany, makeJob, makeUser } from '@/tests/factories'

async function makeSource(userId: string) {
  const [s] = await db
    .insert(sources)
    .values({ userId, name: 'LinkedIn', kind: 'linkedin', config: {} })
    .returning()
  if (!s) throw new Error('failed to create source')
  return s
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

describe('sourceFunnel', () => {
  it('returns empty array when user has no applications', async () => {
    const u = await makeUser()
    const rows = await sourceFunnel(u.id)
    expect(rows).toEqual([])
  })

  it('groups applications by source and counts each funnel stage inclusively', async () => {
    const u = await makeUser()
    const c = await makeCompany(u.id)
    // linkedin: 2 applied, 1 screen, 1 interview, 1 offer (total = 5 applied bucket)
    for (let i = 0; i < 2; i++) {
      const j = await makeJob(u.id, c.id)
      await makeApplication(u.id, j.id, { source: 'linkedin', status: 'applied' })
    }
    {
      const j = await makeJob(u.id, c.id)
      await makeApplication(u.id, j.id, { source: 'linkedin', status: 'screen' })
    }
    {
      const j = await makeJob(u.id, c.id)
      await makeApplication(u.id, j.id, { source: 'linkedin', status: 'interview' })
    }
    {
      const j = await makeJob(u.id, c.id)
      await makeApplication(u.id, j.id, { source: 'linkedin', status: 'offer' })
    }
    {
      const j = await makeJob(u.id, c.id)
      await makeApplication(u.id, j.id, { source: 'linkedin', status: 'rejected' })
    }
    // referral: 1 offered
    {
      const j = await makeJob(u.id, c.id)
      await makeApplication(u.id, j.id, { source: 'referral', status: 'offer' })
    }
    // null source → 'unknown'
    {
      const j = await makeJob(u.id, c.id)
      await makeApplication(u.id, j.id, { status: 'applied' })
    }

    const rows = await sourceFunnel(u.id)
    const byKey = Object.fromEntries(rows.map((r) => [r.source, r]))

    expect(byKey.linkedin).toEqual({
      source: 'linkedin',
      applied: 5, // 2 applied + 1 screen + 1 interview + 1 offer
      screened: 3, // screen + interview + offer
      interviewed: 2, // interview + offer
      offered: 1,
      rejected: 1,
    })
    expect(byKey.referral).toEqual({
      source: 'referral',
      applied: 1,
      screened: 1,
      interviewed: 1,
      offered: 1,
      rejected: 0,
    })
    expect(byKey.unknown!.applied).toBe(1)
  })

  it('scopes results to the given user', async () => {
    const u1 = await makeUser()
    const u2 = await makeUser()
    const c = await makeCompany(u1.id)
    const j = await makeJob(u1.id, c.id)
    await makeApplication(u1.id, j.id, { source: 'linkedin', status: 'applied' })

    const rows = await sourceFunnel(u2.id)
    expect(rows).toEqual([])
  })
})

describe('responseTimeDistribution', () => {
  it('returns all buckets with zero counts when nothing qualifies', async () => {
    const u = await makeUser()
    const rows = await responseTimeDistribution(u.id)
    expect(rows.map((r) => r.bucketDays)).toEqual(['0-3', '4-7', '8-14', '15-30', '30+'])
    expect(rows.every((r) => r.count === 0)).toBe(true)
  })

  it('buckets applications by days-to-first-response', async () => {
    const u = await makeUser()
    const c = await makeCompany(u.id)

    // 2-day response (email)
    const j1 = await makeJob(u.id, c.id)
    const a1 = await makeApplication(u.id, j1.id, {
      status: 'applied',
      appliedAt: daysAgo(10),
    })
    await db.insert(activities).values({
      userId: u.id,
      applicationId: a1.id,
      kind: 'email',
      payload: {},
      createdAt: daysAgo(8),
    })

    // 5-day response (status_change → screen)
    const j2 = await makeJob(u.id, c.id)
    const a2 = await makeApplication(u.id, j2.id, {
      status: 'screen',
      appliedAt: daysAgo(20),
    })
    await db.insert(activities).values({
      userId: u.id,
      applicationId: a2.id,
      kind: 'status_change',
      payload: { from: 'applied', to: 'screen' },
      createdAt: daysAgo(15),
    })

    // 40-day response (email)
    const j3 = await makeJob(u.id, c.id)
    const a3 = await makeApplication(u.id, j3.id, {
      status: 'applied',
      appliedAt: daysAgo(60),
    })
    await db.insert(activities).values({
      userId: u.id,
      applicationId: a3.id,
      kind: 'email',
      payload: {},
      createdAt: daysAgo(20),
    })

    // status_change → 'saved' should NOT count as a response
    const j4 = await makeJob(u.id, c.id)
    const a4 = await makeApplication(u.id, j4.id, {
      status: 'saved',
      appliedAt: daysAgo(5),
    })
    await db.insert(activities).values({
      userId: u.id,
      applicationId: a4.id,
      kind: 'status_change',
      payload: { from: 'applied', to: 'saved' },
      createdAt: daysAgo(2),
    })

    const rows = await responseTimeDistribution(u.id)
    const byLabel = Object.fromEntries(rows.map((r) => [r.bucketDays, r.count]))
    expect(byLabel['0-3']).toBe(1) // 2 days
    expect(byLabel['4-7']).toBe(1) // 5 days
    expect(byLabel['30+']).toBe(1) // 40 days
    expect(byLabel['8-14']).toBe(0)
    expect(byLabel['15-30']).toBe(0)
  })
})

describe('timeToOutcome', () => {
  it('returns zeros when no outcomes recorded', async () => {
    const u = await makeUser()
    const stats = await timeToOutcome(u.id)
    expect(stats.offer).toEqual({ median: 0, p90: 0, count: 0 })
    expect(stats.rejection).toEqual({ median: 0, p90: 0, count: 0 })
  })

  it('computes median and p90 days from applied_at to first offer/rejection status change', async () => {
    const u = await makeUser()
    const c = await makeCompany(u.id)

    // 5 offer outcomes at days 10, 20, 30, 40, 100 → median=30, p90=76 (interp)
    const offerDays = [10, 20, 30, 40, 100]
    for (const d of offerDays) {
      const j = await makeJob(u.id, c.id)
      const a = await makeApplication(u.id, j.id, {
        status: 'offer',
        appliedAt: daysAgo(d + 60),
      })
      await db.insert(activities).values({
        userId: u.id,
        applicationId: a.id,
        kind: 'status_change',
        payload: { from: 'interview', to: 'offer' },
        createdAt: daysAgo(60),
      })
    }

    // 3 rejections at 15, 45, 90
    const rejDays = [15, 45, 90]
    for (const d of rejDays) {
      const j = await makeJob(u.id, c.id)
      const a = await makeApplication(u.id, j.id, {
        status: 'rejected',
        appliedAt: daysAgo(d + 60),
      })
      await db.insert(activities).values({
        userId: u.id,
        applicationId: a.id,
        kind: 'status_change',
        payload: { from: 'applied', to: 'rejected' },
        createdAt: daysAgo(60),
      })
    }

    const stats = await timeToOutcome(u.id)
    expect(stats.offer.count).toBe(5)
    expect(stats.offer.median).toBe(30)
    // p90 of [10,20,30,40,100] at q=0.9 → interp between idx 3.6 → 40 + 0.6*60 = 76
    expect(stats.offer.p90).toBe(76)
    expect(stats.rejection.count).toBe(3)
    expect(stats.rejection.median).toBe(45)
  })
})

describe('discoveryCalibration', () => {
  it('returns empty array when no scored discoveries exist', async () => {
    const u = await makeUser()
    const rows = await discoveryCalibration(u.id)
    expect(rows).toEqual([])
  })

  it('bins by (matchScore, outcome) and counts occurrences', async () => {
    const u = await makeUser()
    const c = await makeCompany(u.id)
    const src = await makeSource(u.id)

    // Discovery linked to an application that is offered
    const j1 = await makeJob(u.id, c.id)
    const a1 = await makeApplication(u.id, j1.id, { status: 'offer' })
    await db.insert(discoveries).values({
      userId: u.id,
      sourceId: src.id,
      sourceJobId: 'j1',
      raw: {},
      normalized: {},
      matchScore: 85,
      status: 'saved',
      savedApplicationId: a1.id,
    })

    // Another discovery at same score, also offered → count=2
    const j2 = await makeJob(u.id, c.id)
    const a2 = await makeApplication(u.id, j2.id, { status: 'offer' })
    await db.insert(discoveries).values({
      userId: u.id,
      sourceId: src.id,
      sourceJobId: 'j2',
      raw: {},
      normalized: {},
      matchScore: 85,
      status: 'saved',
      savedApplicationId: a2.id,
    })

    // Dismissed discovery without application
    await db.insert(discoveries).values({
      userId: u.id,
      sourceId: src.id,
      sourceJobId: 'j3',
      raw: {},
      normalized: {},
      matchScore: 40,
      status: 'dismissed',
    })

    // Discovery without a match score should NOT appear
    await db.insert(discoveries).values({
      userId: u.id,
      sourceId: src.id,
      sourceJobId: 'j4',
      raw: {},
      normalized: {},
      matchScore: null,
      status: 'new',
    })

    const rows = await discoveryCalibration(u.id)
    const byKey = Object.fromEntries(rows.map((r) => [`${r.matchScore}:${r.outcome}`, r.count]))
    expect(byKey['85:offered']).toBe(2)
    expect(byKey['40:dismissed']).toBe(1)
    expect(rows.every((r) => Number.isInteger(r.matchScore))).toBe(true)
    expect(rows.length).toBe(2)
  })
})

describe('weeklyActivity', () => {
  it('returns weeks in the window even when empty', async () => {
    const u = await makeUser()
    const bars = await weeklyActivity(u.id, 4)
    expect(bars.length).toBeGreaterThanOrEqual(4)
    expect(bars.every((b) => b.count === 0)).toBe(true)
    // Weeks are sorted ascending
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i]!.weekStart >= bars[i - 1]!.weekStart).toBe(true)
    }
  })

  it('counts applications in the right week and clips to the window', async () => {
    const u = await makeUser()
    const c = await makeCompany(u.id)
    const j = await makeJob(u.id, c.id)
    // 3 apps this week
    for (let i = 0; i < 3; i++) {
      await makeApplication(u.id, j.id, { createdAt: daysAgo(1) })
    }
    // 1 app 30 days ago
    await makeApplication(u.id, j.id, { createdAt: daysAgo(30) })
    // 1 app 200 days ago → should be excluded from a 12-week window
    await makeApplication(u.id, j.id, { createdAt: daysAgo(200) })

    const bars = await weeklyActivity(u.id, 12)
    const total = bars.reduce((s, b) => s + b.count, 0)
    expect(total).toBe(4)
    // The most recent week should hold the 3-count
    const last = bars[bars.length - 1]!
    expect(last.count).toBe(3)
  })
})

describe('statusDistribution', () => {
  it('returns empty array when user has no applications', async () => {
    const u = await makeUser()
    const rows = await statusDistribution(u.id)
    expect(rows).toEqual([])
  })

  it('counts applications grouped by current status', async () => {
    const u = await makeUser()
    const c = await makeCompany(u.id)
    for (const status of ['applied', 'applied', 'screen', 'offer'] as const) {
      const j = await makeJob(u.id, c.id)
      await makeApplication(u.id, j.id, { status })
    }
    const rows = await statusDistribution(u.id)
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.count]))
    expect(byStatus.applied).toBe(2)
    expect(byStatus.screen).toBe(1)
    expect(byStatus.offer).toBe(1)
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(4)
  })
})

describe('aiUsageStats', () => {
  it('returns zeros and back-filled daily bars when the user has no calls', async () => {
    const u = await makeUser()
    const stats = await aiUsageStats(u.id, 30)
    expect(stats.totalCalls).toBe(0)
    expect(stats.totalEstimatedCostUsd).toBe(0)
    expect(stats.rows).toEqual([])
    // 30-day window → 30 or 31 daily bars back-filled with zero cost.
    expect(stats.byDay.length).toBeGreaterThanOrEqual(30)
    expect(stats.byDay.every((b) => b.cost === 0 && b.calls === 0)).toBe(true)
  })

  it('aggregates by (provider, kind) and estimates cost from the price table', async () => {
    const u = await makeUser()
    await db.insert(aiCallLogs).values([
      // Gemini flash defaults: input $0.075/M, output $0.30/M
      // 2M input + 1M output → $0.15 + $0.30 = $0.45 across two calls
      {
        userId: u.id,
        provider: 'gemini',
        kind: 'parse',
        promptTokens: 1_000_000,
        completionTokens: 500_000,
        latencyMs: 400,
        status: 'ok',
      },
      {
        userId: u.id,
        provider: 'gemini',
        kind: 'parse',
        promptTokens: 1_000_000,
        completionTokens: 500_000,
        latencyMs: 600,
        status: 'ok',
      },
      // Groq gpt-oss-20b defaults: input $0.075/M, output $0.30/M
      // 500k input + 500k output → $0.0375 + $0.15 = $0.1875
      {
        userId: u.id,
        provider: 'groq',
        kind: 'parse',
        promptTokens: 500_000,
        completionTokens: 500_000,
        latencyMs: 200,
        status: 'ok',
      },
    ])

    const stats = await aiUsageStats(u.id, 30)
    expect(stats.totalCalls).toBe(3)
    expect(stats.totalPromptTokens).toBe(2_500_000)
    expect(stats.totalCompletionTokens).toBe(1_500_000)
    // Sum: 0.45 (gemini) + 0.1875 (groq) = 0.6375
    expect(stats.totalEstimatedCostUsd).toBeCloseTo(0.6375, 4)

    const byKey = Object.fromEntries(
      stats.rows.map((r) => [`${r.provider}:${r.kind}`, r]),
    )
    expect(byKey['gemini:parse']!.calls).toBe(2)
    expect(byKey['gemini:parse']!.promptTokens).toBe(2_000_000)
    expect(byKey['gemini:parse']!.completionTokens).toBe(1_000_000)
    expect(byKey['gemini:parse']!.avgLatencyMs).toBe(500)
    expect(byKey['gemini:parse']!.estimatedCostUsd).toBeCloseTo(0.45, 4)
    expect(byKey['groq:parse']!.calls).toBe(1)
    expect(byKey['groq:parse']!.estimatedCostUsd).toBeCloseTo(0.1875, 4)
  })

  it('scopes results to the given user and honors the days window', async () => {
    const u1 = await makeUser()
    const u2 = await makeUser()
    // u2's call should not leak into u1's stats.
    await db.insert(aiCallLogs).values({
      userId: u2.id,
      provider: 'gemini',
      kind: 'parse',
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      latencyMs: 300,
      status: 'ok',
    })
    // An old u1 call outside the window should be excluded.
    const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    await db.insert(aiCallLogs).values({
      userId: u1.id,
      provider: 'gemini',
      kind: 'parse',
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      latencyMs: 300,
      status: 'ok',
      createdAt: oldDate,
    })

    const stats = await aiUsageStats(u1.id, 30)
    expect(stats.totalCalls).toBe(0)
    expect(stats.rows).toEqual([])
  })

  it('treats unknown providers as zero-cost but still counts calls and tokens', async () => {
    const u = await makeUser()
    await db.insert(aiCallLogs).values({
      userId: u.id,
      provider: 'anthropic',
      kind: 'parse',
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      latencyMs: 300,
      status: 'ok',
    })
    const stats = await aiUsageStats(u.id, 30)
    expect(stats.totalCalls).toBe(1)
    expect(stats.totalEstimatedCostUsd).toBe(0)
    expect(stats.rows[0]!.estimatedCostUsd).toBe(0)
  })
})
