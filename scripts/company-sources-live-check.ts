/**
 * Live check of the map and register sources (network, no database):
 * one Overpass query and one GLEIF page per region, through the same
 * parsers and SSRF-guarded client the weekly job uses. Prints counts and a
 * few sample names (public organisation data only). Keep it rare: the
 * public Overpass instance asks for light use.
 *
 * Usage: pnpm tsx scripts/company-sources-live-check.ts [region ...]
 * Default regions: kw dubai kochi.
 */
import { countRegionCandidates } from '@/lib/company-discovery/sources/map-register'
import { companyErrorText } from '@/lib/company-discovery/http'

async function main(): Promise<void> {
  const regions = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['kw', 'dubai', 'kochi']
  for (const region of regions) {
    try {
      const r = await countRegionCandidates(region)
      for (const o of r.osm) {
        process.stdout.write(`${region} · OpenStreetMap ${o.area}: ${o.candidates} employers (${o.withWebsite} with a website, ${o.likely} likely or possible data/IT employers) — ${o.sample.join(', ')}\n`)
      }
      for (const g of r.gleif) {
        process.stdout.write(`${region} · GLEIF ${g.area}: ${g.total} active entities in the search; first page kept ${g.firstPageKept} — ${g.sample.join(', ')}\n`)
      }
    } catch (e) {
      process.stdout.write(`${region}: failed — ${companyErrorText(e)}\n`)
    }
  }
}

main().catch((e) => {
  process.stderr.write(`${companyErrorText(e)}\n`)
  process.exit(1)
})
