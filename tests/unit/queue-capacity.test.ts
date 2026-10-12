import { describe, expect, it } from 'vitest'
import {
  DAILY_CRON_DRAINS,
  DRAIN_BUDGET_MS,
  DRAIN_LANES,
  MIN_DRAIN_SLICE_MS,
  TIER_PRIORITY_OFFSET,
  activityTier,
  dailyLaneMs,
  dailyPlanPoolMs,
  drainSliceMs,
  pickSources,
  planCapacity,
  rankSources,
  sourceCost,
  type ActivityTier,
  type PlanSource,
  type PlanUser,
} from '@/lib/queue/capacity'
import { fixedCostMs } from '@/lib/queue/scheduler'
import { stopMarginMs } from '@/lib/queue/drain'
import { JOB_PRIORITY, JOB_TYPES } from '@/lib/queue/job-types'

/**
 * Capacity model: 100 users through one Hobby day (the scheduler cron and
 * three drain crons, 240 s × 3 lanes each). The simulator mirrors the
 * drain: fair claim order (priority, then round-robin per user), per-user
 * time slices per drain, the 20 s minimum budget for a poll, the stop
 * margin, and the wait-for chain (polls → Scam Shield → shortlist). Poll
 * times are drawn around each source's observed mean (±40 %).
 */

const DAY = 86_400_000
const NOW = new Date('2026-10-12T09:00:00Z')
const POLL_MIN_BUDGET_MS = 20_000

/** Deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface SimUser extends PlanUser {
  meanMs: Map<string, number>
}

function makeUsers(n: number, sourcesEach: number, seed = 7): SimUser[] {
  const r = rng(seed)
  const out: SimUser[] = []
  for (let u = 0; u < n; u++) {
    // 60 % active, 30 % idle, 10 % dormant.
    const tier: ActivityTier = u % 10 < 6 ? 'active' : u % 10 < 9 ? 'idle' : 'dormant'
    const meanMs = new Map<string, number>()
    const sources: PlanSource[] = []
    for (let s = 0; s < sourcesEach; s++) {
      const id = `u${u}-s${s}`
      const mean = 5_000 + r() * 15_000 // 5–20 s per poll
      meanMs.set(id, mean)
      sources.push({
        id,
        // A fifth of users have starred regions that 4 of their sources hit.
        starredYield: u % 5 === 0 && s < 4 ? 3 + s : 0,
        lastPolledAt: new Date(NOW.getTime() - (1 + Math.floor(r() * 7)) * DAY),
        costMs: sourceCost(mean),
      })
    }
    out.push({ userId: `user-${u}`, tier, sources, meanMs, fixedCostMs: fixedCostMs({ read: false, send: false }, 0, false) })
  }
  return out
}

interface SimJob {
  id: string
  userId: string
  type: string
  priority: number
  runAfter: number
  durationMs: number
  minBudgetMs: number
  waitFor: string | null
  status: 'queued' | 'done'
}

const FIXED = [
  { type: JOB_TYPES.followups, ms: 500, waitFor: null },
  { type: JOB_TYPES.discoveryBenefits, ms: 800, waitFor: null },
  { type: JOB_TYPES.scamReassess, ms: 1_500, waitFor: JOB_TYPES.discoverySource },
  { type: JOB_TYPES.shortlist, ms: 1_500, waitFor: JOB_TYPES.scamReassess },
] as const

function buildJobs(users: readonly SimUser[], plan: (u: SimUser) => string[], fair: boolean, seed = 11): SimJob[] {
  const r = rng(seed)
  const jobs: SimJob[] = []
  for (const u of users) {
    const ids = plan(u)
    if (u.tier === 'dormant' && fair) continue
    ids.forEach((sid, i) =>
      jobs.push({
        id: sid,
        userId: u.userId,
        type: JOB_TYPES.discoverySource,
        priority: JOB_PRIORITY[JOB_TYPES.discoverySource] + (fair ? TIER_PRIORITY_OFFSET[u.tier] : 0),
        runAfter: i,
        durationMs: (u.meanMs.get(sid) ?? 10_000) * (0.6 + r() * 0.8),
        minBudgetMs: POLL_MIN_BUDGET_MS,
        waitFor: null,
        status: 'queued',
      }),
    )
    for (const f of FIXED) {
      jobs.push({
        id: `${u.userId}-${f.type}`,
        userId: u.userId,
        type: f.type,
        priority: JOB_PRIORITY[f.type],
        runAfter: 0,
        durationMs: f.ms,
        minBudgetMs: 3_000,
        waitFor: f.waitFor,
        status: 'queued',
      })
    }
  }
  return jobs
}

/** One drain over `jobs` (mutates their status), mirroring lib/queue/drain.ts. */
function simulateDrain(jobs: SimJob[], fair: boolean): { usedLaneMs: number } {
  const running = new Set<string>()
  const blocked = (j: SimJob) =>
    j.waitFor !== null && jobs.some((d) => d.userId === j.userId && d.type === j.waitFor && (d.status === 'queued' || running.has(d.id)))
  const due = () => jobs.filter((j) => j.status === 'queued' && !running.has(j.id) && !blocked(j))
  const usersWithWork = new Set(due().map((j) => j.userId)).size
  const slice = fair ? drainSliceMs(DRAIN_BUDGET_MS, DRAIN_LANES, usersWithWork) : Infinity
  const stopAt = DRAIN_BUDGET_MS - stopMarginMs(DRAIN_BUDGET_MS)
  const spent = new Map<string, number>()
  const order = (list: SimJob[]): SimJob[] => {
    if (!fair) return [...list].sort((a, b) => a.priority - b.priority || a.userId.localeCompare(b.userId) || a.runAfter - b.runAfter)
    const rank = new Map<string, number>()
    const byKey = new Map<string, SimJob[]>()
    for (const j of list) byKey.set(`${j.userId}|${j.priority}`, [...(byKey.get(`${j.userId}|${j.priority}`) ?? []), j])
    for (const group of byKey.values()) group.sort((a, b) => a.runAfter - b.runAfter).forEach((j, i) => rank.set(j.id, i))
    return [...list].sort((a, b) => a.priority - b.priority || rank.get(a.id)! - rank.get(b.id)! || a.runAfter - b.runAfter)
  }
  // Event-driven lanes: each lane is free at laneAt[i].
  const laneAt = Array.from({ length: DRAIN_LANES }, () => 0)
  const laneOpen = Array.from({ length: DRAIN_LANES }, () => true)
  const finishing: Array<{ at: number; job: SimJob }> = []
  let used = 0
  for (;;) {
    const open = laneAt.map((t, i) => (laneOpen[i] ? i : -1)).filter((i) => i >= 0)
    if (open.length === 0) break
    const lane = open.reduce((best, i) => (laneAt[i]! < laneAt[best]! ? i : best), open[0]!)
    const t = laneAt[lane]!
    // Complete everything that finished by now.
    for (const f of finishing.filter((x) => x.at <= t)) {
      f.job.status = 'done'
      running.delete(f.job.id)
    }
    finishing.splice(0, finishing.length, ...finishing.filter((x) => x.at > t))
    if (t >= stopAt) {
      laneOpen[lane] = false
      continue
    }
    const candidates = order(due())
    const over = new Set([...spent].filter(([, ms]) => ms >= slice).map(([u]) => u))
    const job = candidates.find((j) => !over.has(j.userId)) ?? candidates[0]
    if (!job) {
      // Nothing due: wait for a running job (it may unblock a chain) or stop.
      const next = finishing.reduce<number | null>((m, x) => (m === null || x.at < m ? x.at : m), null)
      if (next === null) laneOpen[lane] = false
      else laneAt[lane] = next
      continue
    }
    if (DRAIN_BUDGET_MS - t < job.minBudgetMs) {
      // Released: the lane stops, the job waits for the next drain.
      laneOpen[lane] = false
      continue
    }
    const dur = Math.min(job.durationMs, DRAIN_BUDGET_MS - t)
    running.add(job.id)
    finishing.push({ at: t + dur, job })
    spent.set(job.userId, (spent.get(job.userId) ?? 0) + dur)
    used += dur
    laneAt[lane] = t + dur
  }
  for (const f of finishing) {
    f.job.status = 'done'
    running.delete(f.job.id)
  }
  return { usedLaneMs: used }
}

function simulateDay(jobs: SimJob[], fair: boolean): { usedLaneMs: number } {
  let usedLaneMs = 0
  for (let d = 0; d < DAILY_CRON_DRAINS; d++) usedLaneMs += simulateDrain(jobs, fair).usedLaneMs
  return { usedLaneMs }
}

describe('capacity primitives', () => {
  it('the Hobby day is 4 drains × 240 s × 3 lanes', () => {
    expect(dailyLaneMs()).toBe(2_880_000)
    expect(dailyPlanPoolMs()).toBe(2_160_000)
  })

  it('classifies activity by last visit', () => {
    expect(activityTier(new Date(NOW.getTime() - 1 * DAY), NOW, NOW)).toBe('active')
    expect(activityTier(new Date(NOW.getTime() - 7 * DAY), NOW, NOW)).toBe('idle')
    expect(activityTier(new Date(NOW.getTime() - 20 * DAY), NOW, NOW)).toBe('dormant')
    // Never seen: the account's age decides.
    expect(activityTier(null, new Date(NOW.getTime() - 2 * DAY), NOW)).toBe('active')
  })

  it('ranks by staleness with a starred-region bonus', () => {
    const s = (id: string, starredYield: number, daysAgo: number | null): PlanSource => ({
      id,
      starredYield,
      lastPolledAt: daysAgo === null ? null : new Date(NOW.getTime() - daysAgo * DAY),
      costMs: 10_000,
    })
    // never (30) > old (5) > star polled 1 day ago (1+3) > star today (0+3) > polled 1 day ago (1).
    const ranked = rankSources([s('old', 0, 5), s('never', 0, null), s('star', 2, 0), s('star-yesterday', 9, 1), s('new', 0, 1)], NOW)
    expect(ranked.map((x) => x.id)).toEqual(['never', 'old', 'star-yesterday', 'star', 'new'])
  })

  it('always picks at least one source, then only what fits', () => {
    const big: PlanSource = { id: 'big', starredYield: 0, lastPolledAt: null, costMs: 50_000 }
    const small: PlanSource = { id: 'small', starredYield: 0, lastPolledAt: new Date(NOW), costMs: 5_000 }
    expect(pickSources([big, small], 1_000, NOW).ids).toEqual(['big'])
    expect(pickSources([big, small], 54_000, NOW).ids).toEqual(['big'])
    expect(pickSources([big, small], 55_000, NOW).ids).toEqual(['big', 'small'])
  })

  it('slices a drain across users with work, never below the minimum', () => {
    expect(drainSliceMs(240_000, 3, 10)).toBe(72_000)
    expect(drainSliceMs(240_000, 3, 100)).toBe(MIN_DRAIN_SLICE_MS)
    expect(drainSliceMs(240_000, 3, 0)).toBe(Number.POSITIVE_INFINITY)
  })

  it('gives a single user every source (the owner today)', () => {
    const [u] = makeUsers(1, 16)
    const plan = planCapacity([{ ...u!, tier: 'active' }], undefined, NOW)
    expect(plan.get(u!.userId)!.sourceIds).toHaveLength(16)
  })

  it('returns surplus from light users to heavy ones (water-filling)', () => {
    const light: PlanUser = { userId: 'light', tier: 'active', fixedCostMs: 0, sources: [{ id: 'l1', starredYield: 0, lastPolledAt: null, costMs: 5_000 }] }
    const heavy: PlanUser = {
      userId: 'heavy',
      tier: 'idle',
      fixedCostMs: 0,
      sources: Array.from({ length: 10 }, (_, i) => ({ id: `h${i}`, starredYield: 0, lastPolledAt: null, costMs: 10_000 })),
    }
    const plan = planCapacity([light, heavy], 60_000, NOW)
    expect(plan.get('light')!.sourceIds).toEqual(['l1'])
    // 55 s left after the light user → 5 of the heavy user's 10 s polls.
    expect(plan.get('heavy')!.sourceIds).toHaveLength(5)
  })
})

describe('capacity model: 100 users × 16 sources on the Hobby cron budget', () => {
  const users = makeUsers(100, 16)
  const plan = planCapacity(users, undefined, NOW)

  it('the naive plan (every source, first-created first) does not fit: 4–16× short', () => {
    const naiveDemand = users.reduce((s, u) => s + [...u.meanMs.values()].reduce((a, b) => a + b, 0), 0)
    expect(naiveDemand / dailyLaneMs()).toBeGreaterThan(4)
    const jobs = buildJobs(users, (u) => u.sources.map((s) => s.id), false)
    simulateDay(jobs, false)
    const served = new Set(jobs.filter((j) => j.type === JOB_TYPES.discoverySource && j.status === 'done').map((j) => j.userId))
    const live = users.filter((u) => u.tier !== 'dormant')
    // Most users never get a single poll.
    expect(live.filter((u) => !served.has(u.userId)).length).toBeGreaterThan(50)
  })

  it('plans at least one poll for every non-dormant user and none for dormant users', () => {
    for (const u of users) {
      const p = plan.get(u.userId)!
      if (u.tier === 'dormant') expect(p.sourceIds).toEqual([])
      else expect(p.sourceIds.length).toBeGreaterThanOrEqual(1)
    }
    const totalPlanned = [...plan.values()].reduce((s, p) => s + p.plannedMs, 0)
    const fixed = users.filter((u) => u.tier !== 'dormant').reduce((s, u) => s + u.fixedCostMs, 0)
    expect(totalPlanned + fixed).toBeLessThanOrEqual(dailyPlanPoolMs() * 1.05)
  })

  it('starred-region sources are polled more often over two weeks', () => {
    const u = users.find((x) => x.tier === 'active' && x.sources.some((s) => s.starredYield > 0))!
    let sources = u.sources.map((s) => ({ ...s }))
    const count = new Map<string, number>()
    for (let day = 0; day < 14; day++) {
      const at = new Date(NOW.getTime() + day * DAY)
      const p = planCapacity([...users.filter((x) => x.userId !== u.userId), { ...u, sources }], undefined, at).get(u.userId)!
      for (const id of p.sourceIds) count.set(id, (count.get(id) ?? 0) + 1)
      sources = sources.map((s) => (p.sourceIds.includes(s.id) ? { ...s, lastPolledAt: at } : s))
    }
    const avg = (pred: (s: PlanSource) => boolean) => {
      const xs = u.sources.filter(pred).map((s) => count.get(s.id) ?? 0)
      return xs.reduce((a, b) => a + b, 0) / xs.length
    }
    expect(avg((s) => s.starredYield > 0)).toBeGreaterThan(avg((s) => s.starredYield === 0))
    // …and every source still came round.
    expect(u.sources.every((s) => (count.get(s.id) ?? 0) > 0)).toBe(true)
  })

  it('every non-dormant user gets their whole planned discovery (and shortlist) within the day', () => {
    const jobs = buildJobs(users, (u) => plan.get(u.userId)!.sourceIds, true)
    const { usedLaneMs } = simulateDay(jobs, true)
    const live = users.filter((u) => u.tier !== 'dormant')
    const missed: string[] = []
    for (const u of live) {
      const mine = jobs.filter((j) => j.userId === u.userId)
      if (mine.some((j) => j.status !== 'done')) missed.push(u.userId)
    }
    expect(missed).toEqual([])
    expect(usedLaneMs).toBeLessThanOrEqual(dailyLaneMs())
    const polls = (t: ActivityTier) =>
      live.filter((u) => u.tier === t).map((u) => plan.get(u.userId)!.sourceIds.length)
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    // Active users get more of the day than idle ones.
    expect(avg(polls('active'))).toBeGreaterThan(avg(polls('idle')))
    if (process.env.CAPACITY_REPORT) {
      const naive = users.reduce((s, u) => s + [...u.meanMs.values()].reduce((a, b) => a + b, 0), 0)
      process.stdout.write(
        `\nCAPACITY ${JSON.stringify({
          laneSecondsPerDay: dailyLaneMs() / 1000,
          planPoolSeconds: dailyPlanPoolMs() / 1000,
          naiveDemandSeconds: Math.round(naive / 1000),
          naiveOverBudget: +(naive / dailyLaneMs()).toFixed(1),
          usedSeconds: Math.round(usedLaneMs / 1000),
          users: { active: polls('active').length, idle: polls('idle').length, dormant: users.length - live.length },
          pollsPerUser: { active: +avg(polls('active')).toFixed(1), idle: +avg(polls('idle')).toFixed(1), min: Math.min(...polls('active'), ...polls('idle')) },
          sourcesCoveredPerDay: [...plan.values()].reduce((s, p) => s + p.sourceIds.length, 0),
        })}\n`,
      )
    }
  })

  it('rotation: every source of an idle user (one poll a day) is polled within 16 days', () => {
    const u = users.find((x) => x.tier === 'idle')!
    let sources = u.sources.map((s) => ({ ...s }))
    const polled = new Set<string>()
    for (let day = 0; day < 16; day++) {
      const at = new Date(NOW.getTime() + day * DAY)
      const p = planCapacity([...users.filter((x) => x.userId !== u.userId), { ...u, sources }], undefined, at).get(u.userId)!
      for (const id of p.sourceIds) polled.add(id)
      sources = sources.map((s) => (p.sourceIds.includes(s.id) ? { ...s, lastPolledAt: at } : s))
    }
    expect(polled.size).toBe(u.sources.length)
  })
})
