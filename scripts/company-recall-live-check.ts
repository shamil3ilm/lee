/**
 * One-off live check of company recall and growth (network; never in tests).
 *
 * For each priority region it runs the real weekly pipeline against a
 * throwaway PGlite database (one synthetic user per region), then a bounded
 * enrichment and the growth refresh, and prints:
 *   - "before": what the previous pipeline would have stored on a first run
 *     (Technopark 3 rotating pages, GitHub first page of 20, no other parks,
 *     no seed, no employers from jobs; caps wikidata 60 · github 40 ·
 *     directory 40 · yc 40), emulated with the same parsers;
 *   - "after": the rows stored now, by source;
 *   - whether well-known names are present (and from which source);
 *   - ten lesser-known companies (no seed, no Wikidata) with fit and growth.
 *
 * Usage:
 *   DATABASE_URL=pglite:./.e2e/live-check pnpm db:migrate
 *   DATABASE_URL=pglite:./.e2e/live-check pnpm tsx scripts/company-recall-live-check.ts [region…]
 * Optional GITHUB_TOKEN raises the GitHub search limit (10 → 30 a minute).
 */
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { companyDiscoveries } from '@/lib/db/schema'
import * as profileQ from '@/lib/db/queries/profile'
import { makeUser } from '@/tests/factories'
import { runCompanyDiscovery, fitContextFrom } from '@/lib/company-discovery/service'
import { enrichPending } from '@/lib/company-discovery/enrich'
import { refreshGrowth } from '@/lib/company-discovery/growth/refresh'
import { companyErrorText } from '@/lib/company-discovery/http'
import { normalizeCandidates } from '@/lib/company-discovery/normalize'
import { weeklySlice, wikidataGroups } from '@/lib/company-discovery/plan'
import { fetchWikidataCompanies } from '@/lib/company-discovery/sources/wikidata'
import { searchOrgs } from '@/lib/company-discovery/sources/github'
import { fetchYcCompanies } from '@/lib/company-discovery/sources/yc'
import { fetchTechnoparkPage } from '@/lib/company-discovery/sources/technopark'
import { fetchQstp } from '@/lib/company-discovery/sources/directories'
import { githubTermsForRun } from '@/lib/company-discovery/collect'
import { targetPlaces } from '@/lib/company-discovery/targets'
import { companyFit } from '@/lib/company-discovery/fit'
import { searchPrefsFromProfile } from '@/lib/discovery/relevance/prefs'
import type { CompanyCandidate, CompanyEvidence } from '@/lib/company-discovery/types'

interface RegionCheck {
  id: string
  label: string
  regions: string[]
  famous: string[]
}

const CHECKS: readonly RegionCheck[] = [
  { id: 'kerala', label: 'Kerala', regions: ['kerala'], famous: ['CareStack', 'QBurst', 'UST', 'IBS Software', 'Experion', 'SunTec', 'Tata Elxsi', 'Envestnet', 'Guidehouse', 'Nest Digital', 'Quest Global', 'Litmus7'] },
  { id: 'ae', label: 'UAE', regions: ['ae'], famous: ['Careem', 'Tabby', 'Kitopi', 'talabat', 'noon', 'Anghami', 'Ziina', 'Sarwa', 'YAP', 'Property Finder', 'Dubizzle', 'Bayzat'] },
  { id: 'kw', label: 'Kuwait', regions: ['kw'], famous: ['Tap Payments', 'talabat', 'Boubyan', 'MyFatoorah', 'Ottu', 'UPayments', 'KNET', 'Zain', 'Kuwait Finance House', 'National Bank of Kuwait', 'Cofe'] },
  { id: 'sa', label: 'KSA', regions: ['sa'], famous: ['Tamara', 'Lean', 'Foodics', 'Salla', 'Unifonic', 'HyperPay', 'Moyasar', 'Rewaa', 'Zid', 'Mrsool', 'Jahez', 'Lucidya'] },
  { id: 'qa', label: 'Qatar', regions: ['qa'], famous: ['Snoonu', 'SkipCash', 'Dibsy', 'Fatora', 'Ooredoo'] },
]

const OLD_CAPS: Readonly<Record<string, number>> = { wikidata: 60, github: 40, yc: 40, directory: 40 }

/** The previous pipeline's first run, emulated with today's parsers (no DB). */
async function before(regions: string[], token: string | null, now: Date): Promise<number> {
  const places = targetPlaces(regions, [])
  const out: CompanyCandidate[] = []
  for (const g of wikidataGroups(places).slice(0, 8)) out.push(...(await fetchWikidataCompanies(g).catch(() => [])))
  for (const t of githubTermsForRun(places, [], now)) out.push(...(await searchOrgs(t.term, t.regionId, { githubToken: token }, 20).catch(() => [])))
  out.push(...(await fetchYcCompanies().catch(() => [])))
  const ids = new Set(places.map((p) => p.id))
  if (ids.has('kerala') || ids.has('thiruvananthapuram')) {
    for (const p of weeklySlice(Array.from({ length: 25 }, (_, i) => i + 1), 3, now)) out.push(...(await fetchTechnoparkPage(p).then((r) => r.companies).catch(() => [])))
  }
  if (ids.has('qa') || ids.has('doha')) out.push(...(await fetchQstp().catch(() => [])))
  const merged = [...normalizeCandidates(out).values()]
  const used = new Map<string, number>()
  let kept = 0
  for (const c of merged) {
    const tag = (c.sourceTags[0] ?? 'paste').split(':')[0]!
    const n = used.get(tag) ?? 0
    if (n >= (OLD_CAPS[tag] ?? 40) || kept >= 800) continue
    used.set(tag, n + 1)
    kept += 1
  }
  return kept
}

const nameOf = (r: { normalized: unknown }): string => String((r.normalized as { name?: unknown }).name ?? '')

function sourceCounts(rows: ReadonlyArray<{ sourceTags: string[] }>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) for (const t of r.sourceTags) out[t] = (out[t] ?? 0) + 1
  return out
}

async function checkRegion(check: RegionCheck, token: string | null): Promise<void> {
  const now = new Date()
  console.log(`\n=== ${check.label} ===`)
  const beforeCount = await before(check.regions, token, now).catch((e: unknown) => {
    console.log(`before: failed (${companyErrorText(e)})`)
    return -1
  })
  const u = await makeUser()
  await profileQ.upsert(u.id, { targetRegions: check.regions, roleTypes: ['backend', 'payments', 'fullstack'], readySkills: ['php', 'laravel', 'typescript', 'python'], searchPrefsSavedAt: now } as never)
  const run = await runCompanyDiscovery(u.id, { githubToken: token, now, deadline: Date.now() + 15 * 60_000 })
  for (const s of run.sources) console.log(`  source ${s.source}: ${s.fetched} fetched${s.pages !== undefined ? `, ${s.pages} pages` : ''}${s.error ? `, error: ${s.error}` : ''}`)
  const enriched = await enrichPending(u.id, { limit: 40, deadline: Date.now() + 6 * 60_000 })
  const growth = await refreshGrowth(u.id, { githubToken: token, now, deadline: Date.now() + 6 * 60_000 })
  const rows = await db.select().from(companyDiscoveries).where(eq(companyDiscoveries.userId, u.id))
  console.log(`before (previous pipeline, first run): ${beforeCount} · after: ${rows.length} (new ${run.new}, capped ${run.capped})`)
  console.log(`by source: ${JSON.stringify(sourceCounts(rows))}`)
  console.log(`enriched ${enriched.checked} (boards ${enriched.boards}) · growth scored ${growth.scored}/${growth.companies}, role counts ${growth.roleCounts}, github ${growth.github}, news ${growth.news}, gems ${growth.gems}`)
  const lower = rows.map((r) => ({ r, n: nameOf(r).toLowerCase() }))
  for (const f of check.famous) {
    const hit = lower.find((x) => x.n.includes(f.toLowerCase()))
    console.log(`  ${hit ? 'FOUND  ' : 'MISSING'} ${f}${hit ? ` — ${nameOf(hit.r)} via ${hit.r.sourceTags.join(', ')}; fit ${hit.r.fitScore}; growth ${hit.r.growthScore ?? 'unknown'}${hit.r.growthConfidence && hit.r.growthScore !== null ? ` (${hit.r.growthConfidence})` : ''}` : ''}`)
  }
  const ctx = fitContextFrom(searchPrefsFromProfile(await profileQ.get(u.id)))
  const lesser = rows
    .filter((r) => !r.sourceTags.includes('seed') && !r.sourceTags.includes('wikidata') && !(r.evidence as CompanyEvidence).wikidataId)
    .sort((a, b) => (b.growthScore ?? -1) - (a.growthScore ?? -1) || (b.fitScore ?? 0) - (a.fitScore ?? 0))
    .slice(0, 10)
  console.log('  lesser-known (no seed, no Wikidata), best growth then fit:')
  for (const r of lesser) {
    const chips = companyFit({ name: nameOf(r), regionIds: r.regionIds, industry: r.industry, stage: r.stage, atsKind: r.atsKind, careersUrl: r.careersUrl, evidence: r.evidence as CompanyEvidence, growth: { score: r.growthScore, confidence: r.growthConfidence } }, ctx)
      .chips.map((c) => c.label)
      .slice(0, 5)
      .join(' | ')
    console.log(`   - ${nameOf(r)} [${r.sourceTags.join(', ')}] fit ${r.fitScore} · growth ${r.growthScore ?? 'unknown'}${r.hiddenGem ? ' · under the radar' : ''} · ${chips}`)
  }
}

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN || null
  const wanted = process.argv.slice(2)
  for (const c of CHECKS.filter((x) => wanted.length === 0 || wanted.includes(x.id))) {
    try {
      await checkRegion(c, token)
    } catch (e) {
      console.log(`${c.label}: failed (${companyErrorText(e)})`)
    }
  }
}

main().then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(companyErrorText(e))
    process.exit(1)
  },
)
