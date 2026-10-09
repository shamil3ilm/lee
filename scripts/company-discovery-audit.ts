/**
 * One-off live audit of company discovery's automatic sources (network):
 * Wikidata SPARQL per country and GitHub org search per city, through the
 * same parsers and the same SSRF-guarded client the weekly job uses.
 * Prints counts and a few sample names (public company data only).
 *
 * Usage: pnpm tsx scripts/company-discovery-audit.ts
 * Optional: GITHUB_TOKEN for 30 searches a minute instead of 10.
 */
import { fetchWikidataCompanies } from '@/lib/company-discovery/sources/wikidata'
import { searchOrgs } from '@/lib/company-discovery/sources/github'
import { TARGET_PLACES } from '@/lib/company-discovery/targets'
import { wikidataGroups } from '@/lib/company-discovery/plan'
import { companyErrorText } from '@/lib/company-discovery/http'

const WIKIDATA_COUNTRIES = ['ae', 'sa', 'qa', 'kw', 'kerala']
const GITHUB_TERMS: Array<[string, string]> = [
  ['Dubai', 'dubai'],
  ['Abu Dhabi', 'abu-dhabi'],
  ['Riyadh', 'riyadh'],
  ['Doha', 'doha'],
  ['Kuwait', 'kw'],
  ['Kochi', 'kochi'],
  ['Trivandrum', 'thiruvananthapuram'],
  ['Kozhikode', 'kozhikode'],
]

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN ?? null
  const groups = wikidataGroups(TARGET_PLACES)
  for (const id of WIKIDATA_COUNTRIES) {
    const group = groups.find((g) => g.some((p) => p.id === id))
    if (!group) continue
    try {
      const found = await fetchWikidataCompanies(group)
      const byPlace = new Map<string, number>()
      for (const c of found) for (const r of c.regionIds) byPlace.set(r, (byPlace.get(r) ?? 0) + 1)
      const sample = found.filter((c) => c.industries.some((i) => ['payments', 'fintech', 'software', 'saas', 'erp', 'it_services'].includes(i))).slice(0, 6).map((c) => c.name)
      console.log(`wikidata ${id}: ${found.length} companies; by place ${JSON.stringify(Object.fromEntries(byPlace))}; e.g. ${sample.join(', ')}`)
    } catch (e) {
      console.log(`wikidata ${id}: failed (${companyErrorText(e)})`)
    }
  }
  for (const [term, regionId] of GITHUB_TERMS) {
    try {
      const orgs = await searchOrgs(term, regionId, { githubToken: token }, 20)
      console.log(`github "${term}": ${orgs.length} orgs (first page of 20); e.g. ${orgs.slice(0, 6).map((o) => o.name).join(', ')}`)
    } catch (e) {
      console.log(`github "${term}": failed (${companyErrorText(e)})`)
    }
  }
}

main().catch((e: unknown) => {
  console.error(companyErrorText(e))
  process.exit(1)
})
