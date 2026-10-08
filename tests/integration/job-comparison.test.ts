import { afterEach, describe, expect, it, vi } from 'vitest'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import { AISkippedError } from '@/lib/ai/signal'
import * as repQ from '@/lib/db/queries/companyReputation'
import * as profileQ from '@/lib/db/queries/profile'
import { buildShortlistForUser, readShortlist } from '@/lib/apply/shortlist'
import { loadComparisonCard } from '@/lib/compare/card-data'
import { opportunityKey } from '@/lib/compare/inputs'
import { confirmNarrative, draftNarrative, savedNarrative } from '@/lib/compare/narrative'
import { compareKeys, comparisonChips, loadSettings, prefillFromProfile } from '@/lib/compare/service'
import { CompareError, saveAssumptions, saveCurrentJob, setFactorShortlist } from '@/lib/compare/settings'
import { setLogSink } from '@/lib/logger'
import { savePastedJd } from '@/lib/compare/paste-jd'
import { previewPublish } from '@/lib/portfolio/publish'
import { makeApplication, makeCompany, makeDiscovery, makeJob, makeSource, makeUser } from '@/tests/factories'

// Synthetic data only: no real employer, person or salary.
const NOW = new Date('2026-10-08T09:00:00Z')
const SECRET_PAY = 173_219
const EMPLOYER = 'Quillfeather Synthetic Pvt Ltd'

const CURRENT = {
  employer: EMPLOYER,
  title: 'Software Engineer',
  location: 'Kochi',
  place: 'IN',
  workMode: 'hybrid',
  startDate: '2024-03',
  monthlyGross: SECRET_PAY,
  currency: 'INR',
  benefits: { health: 'self', bonus: false, pfGratuity: true, leaveDays: 21, wfh: true },
  commuteNotes: '40 minutes each way',
  ratings: { growth: 2, techStack: 3, manager: 3, workLife: 4, security: 4, culture: 3 },
  wantMore: ['growth', 'pay'],
}

const GCC_POSTING = `Senior Backend Engineer (Dubai). Build our e-invoicing platform.
Salary: AED 20,000 - 24,000 per month.
We offer an employment visa, medical insurance for you and your family, an annual air ticket and 30 days annual leave.`

afterEach(() => {
  setLogSink(undefined)
  vi.restoreAllMocks()
})

async function seeded() {
  const u = await makeUser()
  await saveCurrentJob(u.id, CURRENT)
  await saveAssumptions(u.id, { fx: { rates: { INR: 83 } }, places: { IN: { taxRate: 15 } } }, NOW)
  const company = await makeCompany(u.id, { name: 'Dunefold Labs', domain: 'dunefold.example' })
  await repQ.saveRatings(u.id, company.id, [
    { site: 'glassdoor', rating: 4.2, summary: 'Supportive leads', url: null, recordedAt: '2026-09-30T00:00:00Z' },
  ])
  const src = await makeSource(u.id)
  const disc = await makeDiscovery(u.id, src.id, {
    status: 'new',
    matchScore: 80,
    createdAt: NOW,
    normalized: {
      kind: 'job',
      title: 'Senior Backend Engineer',
      companyName: 'Dunefold Labs',
      companyDomain: 'dunefold.example',
      location: 'Dubai, UAE',
      remoteType: 'onsite',
      employmentType: 'fulltime',
      descriptionMd: GCC_POSTING,
      applyUrl: 'https://dunefold.example/jobs/1',
      techStack: ['Go', 'Kafka'],
    },
  })
  const job = await makeJob(u.id, null, {
    title: 'Backend Developer',
    location: 'Bengaluru, India',
    remoteType: 'remote',
    descriptionMd: 'Laravel APIs for a payments product. Health insurance included.',
    salaryMin: 2_400_000,
    salaryMax: 2_400_000,
    salaryCurrency: 'INR',
  })
  const app = await makeApplication(u.id, job.id)
  return { u, company, disc, app }
}

describe('current job settings', () => {
  it('saves and loads the private current job and assumptions', async () => {
    const { u } = await seeded()
    const s = await loadSettings(u.id)
    expect(s.current).toMatchObject({ employer: EMPLOYER, monthlyGross: SECRET_PAY, place: 'IN' })
    expect(s.assumptions.fx).toMatchObject({ rates: { INR: 83 }, updatedAt: '2026-10-08' })
    expect(s.factorShortlist).toBe(false)
  })

  it('rejects invalid input with a field message', async () => {
    const u = await makeUser()
    await expect(saveCurrentJob(u.id, { ...CURRENT, wantMore: ['pay', 'growth', 'benefits', 'location'] })).rejects.toBeInstanceOf(CompareError)
    await expect(saveCurrentJob(u.id, { ...CURRENT, monthlyGross: Number.NaN })).rejects.toThrow(/monthlyGross/)
  })

  it('prefills employer and title from the master profile’s current work item', async () => {
    const u = await makeUser()
    await profileQ.upsert(u.id, {
      resume: {
        work: [
          { id: 'w-old', name: 'Old Synthetic Co', position: 'Intern', startDate: '2019', endDate: '2020' },
          { id: 'w-now', name: 'Now Synthetic Co', position: 'Backend Engineer', startDate: '2021' },
        ],
      },
    })
    expect(await prefillFromProfile(u.id)).toEqual({ employer: 'Now Synthetic Co', title: 'Backend Engineer' })
  })
})

describe('comparison for a discovery with reputation data', () => {
  it('converts pay, reads GCC benefits and uses the confirmed reputation', async () => {
    const { u, company, disc } = await seeded()
    const card = await loadComparisonCard(u.id, opportunityKey('discovery', disc.id), NOW)
    const c = card.comparison!
    expect(card.hasCurrent).toBe(true)
    expect(c.place).toEqual({ job: 'AE', remote: false, abroad: true })
    expect(c.pay.monthly?.min).toBeCloseTo((20_000 / 3.6725) * 83, 4)
    expect(c.pay.basis).toBe('net')
    expect(c.pay.deltaPct).toBe(Math.round((((22_000 / 3.6725) * 83) / (SECRET_PAY * 0.85) - 1) * 100))
    expect(c.checklist.find((r) => r.key === 'family_health')?.verdict).toBe('better')
    expect(c.checklist.find((r) => r.key === 'visa')?.verdict).toBe('same')
    expect(c.job.scores.environment).toBe(80)
    expect(c.job.criteria.environment.evidence[0]?.source).toMatchObject({ kind: 'your_rating', url: `/companies/${company.id}` })
    expect(c.job.scores.stability).toBeNull()
    expect(c.reviews.average).toBe(4.2)
    expect(c.questions.map((q) => q.topic)).toEqual(expect.arrayContaining(['bonus', 'stability']))
    expect(c.verdict).toMatch(/^Likely \+\d+% take-home/)
    expect(card.citations['pay:1']).toContain('AED 20,000')
  })

  it('without a current job the card asks for one', async () => {
    const u = await makeUser()
    const src = await makeSource(u.id)
    const d = await makeDiscovery(u.id, src.id, { normalized: { kind: 'job', title: 'Engineer', companyName: 'X', descriptionMd: GCC_POSTING } })
    const card = await loadComparisonCard(u.id, opportunityKey('discovery', d.id), NOW)
    expect(card.hasCurrent).toBe(false)
    expect(card.comparison?.current).toBeNull()
  })
})

describe('paste the JD', () => {
  it('a posting with no description is unknown until the user pastes the JD; only the owner can paste', async () => {
    const { u } = await seeded()
    const src = await makeSource(u.id)
    const d = await makeDiscovery(u.id, src.id, {
      normalized: { kind: 'job', title: 'Staff Engineer', companyName: 'Thin Synthetic Co', location: 'Dubai, UAE', descriptionMd: 'Apply now.' },
    })
    const key = opportunityKey('discovery', d.id)
    const before = (await loadComparisonCard(u.id, key, NOW)).comparison!
    expect(before.jd).toEqual({ status: 'thin', pasted: false, canPaste: true })
    expect(before.job.scores.growth).toBeNull()

    const other = await makeUser()
    await expect(savePastedJd(other.id, d.id, GCC_POSTING.repeat(2))).rejects.toThrow('not found')
    await expect(savePastedJd(u.id, d.id, 'too short')).rejects.toBeInstanceOf(CompareError)
    await savePastedJd(u.id, d.id, `${GCC_POSTING}\nYou will lead a small team and mentor junior engineers.`)

    const after = (await loadComparisonCard(u.id, key, NOW)).comparison!
    expect(after.jd).toEqual({ status: 'ok', pasted: true, canPaste: true })
    expect(after.job.scores.growth).not.toBeNull()
    expect(after.pay.postedText).toBe('AED 20,000/mo – AED 24,000/mo')
    expect(after.checklist.find((r) => r.key === 'flights')?.source?.quote).toContain('annual air ticket')
  })
})

describe('side-by-side page data', () => {
  it('compares a discovery and an application with the current job; foreign ids are skipped', async () => {
    const { u, disc, app } = await seeded()
    const other = await makeUser()
    const keys = [opportunityKey('discovery', disc.id), opportunityKey('application', app.id), opportunityKey('application', '00000000-0000-4000-8000-000000000000')]
    const data = await compareKeys(u.id, keys, NOW)
    expect(data.comparisons.map((c) => c.key)).toEqual(keys.slice(0, 2))
    expect(data.current?.scores.growth).toBe(38)
    expect(data.current?.total.score).not.toBeNull()
    const remote = data.comparisons[1]!
    expect(remote.place).toEqual({ job: 'IN', remote: true, abroad: false })
    expect(remote.pay.deltaPct).toBe(Math.round((200_000 / SECRET_PAY - 1) * 100))
    expect((await compareKeys(other.id, keys, NOW)).comparisons).toEqual([])
  })

  it('chips summarise the comparison for the shortlist and Prepare', async () => {
    const { u, disc } = await seeded()
    const chips = await comparisonChips(u.id, [opportunityKey('discovery', disc.id)], NOW)
    expect(chips.get(opportunityKey('discovery', disc.id))).toMatch(/^vs current: pay ↑ \d+% est\. · growth ↑ · benefits/)
  })
})

describe('shortlist factor (off by default)', () => {
  it('adds a "vs current job" reason only when the user turns it on', async () => {
    const { u } = await seeded()
    await buildShortlistForUser(u.id, NOW)
    const off = (await readShortlist(u.id, NOW)).entries[0]!
    expect(off.reasons.some((r) => r.kind === 'comparison')).toBe(false)

    await setFactorShortlist(u.id, true)
    await buildShortlistForUser(u.id, NOW)
    const on = (await readShortlist(u.id, NOW)).entries[0]!
    const reason = on.reasons.find((r) => r.kind === 'comparison')
    expect(reason?.label).toMatch(/^vs current job: [+-]\d+ weighted$/)
    expect(Math.abs(reason!.points)).toBeLessThanOrEqual(8)
  })
})

describe('AI narrative', () => {
  it('drops uncited claims and invented figures; saves only what the user confirms', async () => {
    const { u, disc } = await seeded()
    const key = opportunityKey('discovery', disc.id)
    const ai = new FixtureAIProvider({
      narrateComparison: (input) => ({
        summary: [
          { text: 'Pay is stated as AED 20,000 to 24,000 a month.', cites: ['pay:1'] },
          { text: 'You would earn 999,999 more.', cites: ['pay:1'] },
          { text: 'Great culture.', cites: ['made-up'] },
        ],
        questions: [{ text: 'Is there a bonus?', cites: [input.unknowns.find((q) => q.id === 'q-bonus')!.id] }],
      }),
    })
    const spy = vi.spyOn(ai, 'narrateComparison')
    const draft = await draftNarrative(u.id, key, ai, NOW)
    expect(draft.summary.map((c) => c.text)).toEqual(['Pay is stated as AED 20,000 to 24,000 a month.'])
    expect(draft.questions).toHaveLength(1)
    const sent = JSON.stringify(spy.mock.calls[0]![0])
    expect(sent).not.toContain(String(SECRET_PAY))
    expect(sent).not.toContain('1,73,219')
    expect(sent).not.toContain(EMPLOYER)
    expect(sent).not.toContain('vs your')
    expect(sent).not.toMatch(/[+-]\d+% take-home/)

    await expect(confirmNarrative(u.id, key, { summary: [{ text: 'x', cites: ['ghost'] }], questions: [] }, NOW)).rejects.toThrow(
      'valid source',
    )
    await confirmNarrative(u.id, key, draft, NOW)
    expect(savedNarrative((await loadSettings(u.id)).narratives, key)?.summary).toEqual(draft.summary)
  })

  it('is signal-gated: no current job, no call', async () => {
    const u = await makeUser()
    const src = await makeSource(u.id)
    const d = await makeDiscovery(u.id, src.id, { normalized: { kind: 'job', title: 'Engineer', companyName: 'X', descriptionMd: GCC_POSTING } })
    const ai = new FixtureAIProvider()
    const spy = vi.spyOn(ai, 'narrateComparison')
    await expect(draftNarrative(u.id, opportunityKey('discovery', d.id), ai, NOW)).rejects.toBeInstanceOf(AISkippedError)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('privacy', () => {
  it('the portfolio document never includes the current job', async () => {
    const { u } = await seeded()
    await profileQ.upsert(u.id, {
      resume: { basics: { name: 'Test Person' }, work: [{ id: 'w1', name: 'Public Synthetic Co', position: 'Engineer', startDate: '2022' }] },
    })
    const { json } = await previewPublish(u.id, NOW)
    expect(json).toContain('Public Synthetic Co')
    expect(json).not.toContain(EMPLOYER)
    expect(json).not.toContain(String(SECRET_PAY))
    expect(json).not.toContain('40 minutes each way')
    expect(json).not.toMatch(/current_?job|monthlyGross|wantMore/i)
  })

  it('logs never include the salary, employer or ratings', async () => {
    const lines: string[] = []
    setLogSink((level, event, fields) => lines.push(JSON.stringify({ level, event, fields })))
    const consoleLines: string[] = []
    for (const m of ['log', 'warn', 'error'] as const) {
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => void consoleLines.push(args.map(String).join(' ')))
    }
    const { u, disc, app } = await seeded()
    await compareKeys(u.id, [opportunityKey('discovery', disc.id), opportunityKey('application', app.id)], NOW)
    await setFactorShortlist(u.id, true)
    await buildShortlistForUser(u.id, NOW)
    const key = opportunityKey('discovery', disc.id)
    const draft = await draftNarrative(u.id, key, new FixtureAIProvider(), NOW)
    await confirmNarrative(u.id, key, draft, NOW)
    await expect(saveCurrentJob(u.id, { ...CURRENT, monthlyGross: -5 })).rejects.toBeInstanceOf(CompareError)

    const all = [...lines, ...consoleLines].join('\n')
    expect(lines.some((l) => l.includes('current_job_saved'))).toBe(true)
    for (const secret of [String(SECRET_PAY), '173219', '1,73,219', '173,219', EMPLOYER, '40 minutes']) {
      expect(all).not.toContain(secret)
    }
  })
})
