/**
 * Real-Postgres smoke test (CI job `postgres-smoke`).
 *
 * Unit/integration tests run on PGlite, which is more permissive than the
 * production driver (postgres-js on Neon): e.g. PGlite accepts a JS Date bound
 * in raw sql`` while drizzle's postgres-js setup did not, which broke
 * /analytics and the nightly retention cron in production with every test
 * green. This script exercises the raw-SQL-heavy paths against a real Postgres.
 *
 * Usage: DATABASE_URL=postgres://… pnpm db:migrate && pnpm tsx scripts/pg-smoke.ts
 */
import { makeApplication, makeCompany, makeJob, makeUser } from '@/tests/factories'
import * as analytics from '@/lib/analytics/service'
import { aiUsageBreakdown } from '@/lib/analytics/ai-usage-breakdown'
import { quotaMeters } from '@/lib/ai/quota'
import { runRetention } from '@/lib/db/retention'
import { scheduleDailyJobs } from '@/lib/queue/scheduler'
import { drain } from '@/lib/queue/drain'
import { recordDueReminders } from '@/lib/reminders/service'
import { takeUsageSnapshot } from '@/lib/usage/snapshot'
import { pruneRadarWhatsNew } from '@/lib/db/retention/radar-new'
import * as newQ from '@/lib/db/queries/radarNew'
import { adoptWhatsNew } from '@/lib/radar/new/adopt'
import { runWhatsNewSource } from '@/lib/radar/new/run'
import { scheduleWhatsNew } from '@/lib/radar/new/schedule'
import { NEW_SOURCES } from '@/lib/radar/new/types'
import { loadWhatsNew, rankedSince } from '@/lib/radar/new/view'
import { NO_WAIT } from '@/lib/reputation/rate-limit'
import { fixtureFetch } from '@/tests/fixtures/reputation/fetch'
import { newRoutes } from '@/tests/fixtures/radar/new/fetch'
import { makeDiscovery, makeSource } from '@/tests/factories'
import { tailorProfile, TAILOR_JD } from '@/tests/fixtures/resume/tailor'
import * as profileQ from '@/lib/db/queries/profile'
import * as appsQ from '@/lib/db/queries/applications'
import * as matchQ from '@/lib/db/queries/discoveryMatch'
import * as discQ from '@/lib/db/queries/discoveries'
import { enqueueRelevanceJob } from '@/lib/discovery/relevance/enqueue'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { saveResumeProfile } from '@/lib/resume/service'
import { createStarterVariants } from '@/lib/variants/service'
import { confirmVariant, startPrepare } from '@/lib/apply/prepare'
import { bestCvForApplication, bestCvStale, ensureBestCv, rescoreBestCv } from '@/lib/cv-fit/service'
import { loadMatrix } from '@/lib/cv-fit/matrix'
import { saveTailoredCopy } from '@/lib/cv-fit/tailor/save'
import { loadTailorView } from '@/lib/cv-fit/tailor/service'
import { coverTailoringFor } from '@/lib/cv-fit/tailor/cover'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { encryptPlaintextAccountTokens } from '@/lib/auth/account-tokens'
import { decryptToken, isEncrypted } from '@/lib/crypto/token-vault'
import { refreshFits, runCompanyDiscovery } from '@/lib/company-discovery/service'
import { enrichPending } from '@/lib/company-discovery/enrich'
import * as localCompaniesQ from '@/lib/db/queries/localCompanies'
import * as linkedinQ from '@/lib/db/queries/linkedin'
import * as employersQ from '@/lib/db/queries/companyEmployers'
import * as growthQ from '@/lib/db/queries/companyGrowth'
import { refreshGrowth } from '@/lib/company-discovery/growth/refresh'
import { copyGrowthToPostings } from '@/lib/company-discovery/growth/postings'
import { foldDuplicates } from '@/lib/company-discovery/fold'
import {
  GITHUB_ORGS_KUWAIT,
  HOME_WITH_BOARD,
  QSTP_DIRECTORY,
  ROBOTS_ALLOW_ALL,
  TECHNOPARK_PAGE,
  WIKIDATA_KW,
  YC_ALL,
  fakeFetch,
} from '@/tests/fixtures/company-discovery'

type Check = readonly [name: string, run: () => Promise<unknown>]

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause instanceof Error ? ` (cause: ${error.cause.message})` : ''
  return `${error.message.split('\n')[0]}${cause}`
}

async function main(): Promise<void> {
  if (process.env.DATABASE_URL?.startsWith('pglite:') !== false) {
    throw new Error('pg-smoke needs DATABASE_URL pointing at a real Postgres')
  }
  const user = await makeUser()
  const company = await makeCompany(user.id)
  const job = await makeJob(user.id, company.id)
  await makeApplication(user.id, job.id, { status: 'applied' })
  const id = user.id
  const now = new Date()
  // The What's new fixtures are dated around this day.
  const fixtureNow = new Date('2026-10-08T09:00:00Z')

  // Best CV per job and Tailor to this JD (lib/cv-fit): raw-SQL batch writes,
  // jsonb reads and the cv_tailorings table.
  await profileQ.upsert(id, { roleTypes: ['payments'] })
  await saveResumeProfile(id, tailorProfile())
  await createStarterVariants(id, [
    { roleId: 'payments-backend', region: 'gcc' },
    { roleId: 'payments-backend', region: 'remote' },
  ])
  const source = await makeSource(id, { kind: 'greenhouse' })
  const posting = await makeDiscovery(id, source.id, {
    status: 'new',
    normalized: { kind: 'job', title: TAILOR_JD.title, companyName: 'Payco Gulf', location: TAILOR_JD.location, descriptionMd: TAILOR_JD.descriptionMd, applyUrl: 'https://boards.greenhouse.io/paycogulf/jobs/7' },
  })

  const checks: readonly Check[] = [
    [
      'bestCv.rescore',
      async () => {
        const r = await rescoreBestCv(id)
        if (r.computed < 1) throw new Error('no best CV computed')
      },
    ],
    ['bestCv.stale', () => bestCvStale(id)],
    [
      'bestCv.jdReset',
      async () => {
        await matchQ.setDescription(id, posting.id, `${TAILOR_JD.descriptionMd}\n- Terraform is a plus.`, 'pasted')
        if ((await ensureBestCv(id, [posting.id])).size !== 1) throw new Error('a new JD did not reset the best CV')
      },
    ],
    ['bestCv.matrix', () => loadMatrix(id, now)],
    [
      'tailor.saveAndCover',
      async () => {
        const { applicationId } = await startPrepare(id, { discoveryId: posting.id })
        const app = await appsQ.getById(id, applicationId)
        const best = app ? await bestCvForApplication(id, app) : null
        if (!best) throw new Error('no best CV for the application')
        await confirmVariant(id, applicationId, best.best.variantId)
        const view = await loadTailorView(id, applicationId)
        await saveTailoredCopy(id, applicationId, { accepted: view.suggestions.map((s) => s.id), gaps: [] })
        if (!(await coverTailoringFor(id, applicationId))) throw new Error('the cover letter cannot read the tailoring')
      },
    ],
    // Region hierarchy (lib/regions): the relevance backfill writes region_ids
    // in one raw-SQL batch; the filter is an array overlap on the GIN index;
    // "Group by region" counts over unnest().
    [
      'regions.backfill',
      async () => {
        await enqueueRelevanceJob(id)
        await drain({ userId: id, types: [JOB_TYPES.discoveryRelevance], budgetMs: 20_000, maxJobs: 2, concurrency: 1 })
        const tagged = await discQ.list(id, { status: 'all', region: ['gcc'] })
        if (!tagged.some((r) => r.id === posting.id)) throw new Error('the backfill did not tag the Gulf posting')
      },
    ],
    [
      'regions.filter',
      async () => {
        await discQ.list(id, { status: 'all', region: ['kerala', 'dubai', 'remote'], sort: 'combined', limit: 25 })
        await discQ.countList(id, { status: 'new', region: ['in'] })
        await discQ.countByStatus(id, undefined, { region: ['gcc'] })
      },
    ],
    [
      'regions.groupCounts',
      async () => {
        const counts = await discQ.countByRegion(id, { status: 'all', quarantine: 'exclude' })
        if ((counts.get('gcc') ?? 0) < 1) throw new Error('no GCC count')
      },
    ],
    // OAuth token encryption (lib/auth/account-tokens.ts): the one-time
    // migration's raw-SQL filter and compare-and-set update, run twice.
    [
      'accounts.encryptTokens',
      async () => {
        await db.insert(accounts).values({
          userId: id,
          type: 'oidc',
          provider: 'google',
          providerAccountId: `smoke-${id}`,
          access_token: 'ya29.smoke-plain',
          refresh_token: '1//smoke-plain',
          id_token: null,
        })
        const first = await encryptPlaintextAccountTokens()
        if (first.updated < 1) throw new Error(`expected a row to encrypt, got ${JSON.stringify(first)}`)
        const second = await encryptPlaintextAccountTokens()
        if (second.updated !== 0) throw new Error(`second run changed ${second.updated} rows`)
        const row = await db.query.accounts.findFirst({ where: and(eq(accounts.userId, id), eq(accounts.provider, 'google')) })
        if (!row || !isEncrypted(row.refresh_token) || decryptToken(row.refresh_token) !== '1//smoke-plain' || row.id_token !== null) {
          throw new Error('tokens not encrypted as expected')
        }
      },
    ],
    // Company discovery (lib/company-discovery): the array-union upsert, the
    // overlap / jsonb filters, the facet arrays, the fit backfill and the
    // enrichment writes, all offline (fixture transport).
    [
      'companies.run',
      async () => {
        await profileQ.upsert(id, { targetRegions: ['kw', 'qa', 'kerala'], discoveryPrefs: { preferredRegions: [{ id: 'kw', level: 'top' }] } as never })
        await linkedinQ.upsertConnections(id, [{ name: 'Smoke Sample', company: 'Dinar Pay', companyKey: 'dinar pay', position: 'Engineer', connectedOn: null, email: null }])
        const fetchImpl = fakeFetch([
          { match: (u) => u.host === 'query.wikidata.org', body: WIKIDATA_KW },
          { match: (u) => u.host === 'api.github.com', body: GITHUB_ORGS_KUWAIT },
          { match: (u) => u.host === 'yc-oss.github.io', body: YC_ALL },
          { match: (u) => u.host === 'technopark.in', body: TECHNOPARK_PAGE },
          { match: (u) => u.host === 'qstp.qa', body: QSTP_DIRECTORY },
        ])
        const r = await runCompanyDiscovery(id, { fetchImpl, limiter: NO_WAIT, githubToken: null, now })
        if (r.new < 3) throw new Error(`expected companies, got ${JSON.stringify(r)}`)
        const again = await runCompanyDiscovery(id, { fetchImpl, limiter: NO_WAIT, githubToken: null, now })
        if (again.new !== 0 || again.updated < 1) throw new Error(`re-run inserted or missed rows: ${JSON.stringify(again)}`)
      },
    ],
    [
      'companies.list',
      async () => {
        const opts = { status: 'new' as const, regionIds: ['kw'], industry: 'payments', hiring: false, warm: true, sourceTag: 'wikidata' }
        const rows = await localCompaniesQ.listCompanies(id, { ...opts, limit: 25 })
        await localCompaniesQ.countCompanies(id, { ...opts, stage: 'startup', hiring: true })
        const f = await localCompaniesQ.facets(id)
        if (rows.length < 1 || !f.sources.includes('wikidata')) throw new Error('filters or facets returned nothing')
      },
    ],
    ['companies.refreshFits', () => refreshFits(id)],
    // Recall and growth (lib/company-discovery/{collect,fold,growth}): the
    // employer reads, the duplicate fold, the growth refresh and its sort /
    // filters, the postings copy and the Fit nudge in the job ranking.
    [
      'companies.employers',
      async () => {
        await employersQ.recentPostingEmployers(id, new Date(now.getTime() - 120 * 86_400_000))
        await employersQ.trackedEmployers(id)
      },
    ],
    [
      'companies.fold',
      async () => {
        const src = (await localCompaniesQ.inPlay(id))[0]?.sourceId
        if (src) await foldDuplicates(id, src)
      },
    ],
    [
      'companies.growth',
      async () => {
        const fetchImpl = fakeFetch([
          { match: (u) => u.host === 'api.github.com' && u.pathname.endsWith('/repos'), body: [] },
          { match: (u) => u.host === 'query.wikidata.org', body: { results: { bindings: [] } } },
          { match: (u) => u.host === 'api.gdeltproject.org', body: '' },
          { match: (u) => u.host === 'hn.algolia.com', body: { hits: [] } },
        ])
        await refreshGrowth(id, { fetchImpl, limiter: NO_WAIT, now, countOpenRoles: async () => 4 })
        await localCompaniesQ.listCompanies(id, { status: 'new', sort: 'growth', minGrowth: 40, gems: false, limit: 25 })
        await localCompaniesQ.countCompanies(id, { status: 'new', minGrowth: 40, gems: true })
        await growthQ.recentLaunches(new Date(now.getTime() - 90 * 86_400_000))
        await growthQ.reputationNewsByDomain(id, ['dinarpay.example'])
        await copyGrowthToPostings(id, now)
        await discQ.list(id, { status: 'new', sort: 'match', growthInFit: true, limit: 5 })
        await discQ.list(id, { status: 'new', sort: 'combined', growthInFit: true, limit: 5 })
      },
    ],
    [
      'companies.enrich',
      async () => {
        const fetchImpl = fakeFetch([
          { match: (u) => u.pathname === '/robots.txt', body: ROBOTS_ALLOW_ALL, type: 'text/plain' },
          { match: (u) => u.pathname === '/', body: HOME_WITH_BOARD },
          { match: (u) => u.host === 'api.github.com', body: {} },
        ])
        await enrichPending(id, { fetchImpl, limiter: NO_WAIT, limit: 10, countOpenRoles: async () => 2 })
      },
    ],
    ['analytics.sourceFunnel', () => analytics.sourceFunnel(id)],
    ['analytics.responseTimeDistribution', () => analytics.responseTimeDistribution(id)],
    ['analytics.timeToOutcome', () => analytics.timeToOutcome(id)],
    ['analytics.discoveryCalibration', () => analytics.discoveryCalibration(id)],
    ['analytics.weeklyActivity', () => analytics.weeklyActivity(id, 12)],
    ['analytics.statusDistribution', () => analytics.statusDistribution(id)],
    ['analytics.aiUsageStats', () => analytics.aiUsageStats(id, 30)],
    ['analytics.monthlyExpenses', () => analytics.monthlyExpenses(id, 6)],
    ['analytics.budgetVsActual', () => analytics.budgetVsActual(id)],
    ['analytics.expenseCategoryTrend', () => analytics.expenseCategoryTrend(id, 6)],
    ['analytics.topVendors', () => analytics.topVendors(id, 3)],
    ['analytics.budgetAdherenceHistory', () => analytics.budgetAdherenceHistory(id, 6)],
    ['aiUsageBreakdown', () => aiUsageBreakdown(id, 30)],
    ['quotaMeters', () => quotaMeters(id, now)],
    ['runRetention', () => runRetention(now, { budgetMs: 20_000 })],
    ['scheduleDailyJobs', () => scheduleDailyJobs(now)],
    ['recordDueReminders', () => recordDueReminders(now)],
    ['drain', () => drain({ budgetMs: 20_000 })],
    ['takeUsageSnapshot', () => takeUsageSnapshot(now)],
    ['radarNew.schedule', () => scheduleWhatsNew(now)],
    // What's new: the shared fetch + store (offline fixtures), per-user ranking, digest, adoption and retention.
    ...NEW_SOURCES.filter((s) => s !== 'feeds').map(
      (source): Check => [
        `radarNew.run.${source}`,
        async () => {
          const r = await runWhatsNewSource(source, { fetchImpl: fixtureFetch(newRoutes()), limiter: NO_WAIT, now: fixtureNow, projects: ['laravel', 'nextjs'] })
          if (r.status !== 'polled') throw new Error(r.error ?? 'not polled')
        },
      ],
    ),
    ['radarNew.loadWhatsNew', () => loadWhatsNew(id, { category: null, group: null, openOnly: false, relevantOnly: false, period: 'month' }, 0, fixtureNow)],
    ['radarNew.loadWhatsNew.category', () => loadWhatsNew(id, { category: 'model', group: 'llm', openOnly: true, relevantOnly: true, period: 'week' }, 0, fixtureNow)],
    // The digest's read (whatsNewSectionsFor swallows errors, so call what it calls).
    ['radarNew.digest', () => rankedSince(id, new Date(fixtureNow.getTime() - 7 * 86_400_000), fixtureNow)],
    [
      'radarNew.adopt',
      async () => {
        const [entry] = await newQ.listCandidates({ sinceDays: 30 }, fixtureNow)
        if (!entry) throw new Error('no shared entries stored')
        await adoptWhatsNew(id, entry.id, { save: true, now: fixtureNow })
      },
    ],
    ['radarNew.retention', () => pruneRadarWhatsNew(new Date(fixtureNow.getTime() + 90 * 86_400_000))],
  ]

  const failures: string[] = []
  for (const [name, run] of checks) {
    try {
      await run()
      process.stdout.write(`ok   ${name}\n`)
    } catch (error: unknown) {
      failures.push(name)
      process.stdout.write(`FAIL ${name}: ${describeError(error)}\n`)
    }
  }
  if (failures.length > 0) {
    process.stdout.write(`\n${failures.length} of ${checks.length} checks failed on real Postgres\n`)
    process.exit(1)
  }
  process.stdout.write(`\nall ${checks.length} checks passed on real Postgres\n`)
  process.exit(0)
}

main().catch((error: unknown) => {
  process.stdout.write(`pg-smoke crashed: ${describeError(error)}\n`)
  process.exit(1)
})
