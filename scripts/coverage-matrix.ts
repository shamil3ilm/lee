/**
 * Coverage matrix generator (no network, no database).
 *
 * Builds the per-region matrix from the same data the app ships (starter
 * catalog, employer watch list, playbooks, company directories, seed) and
 * measures what each region's synthetic fixture postings would keep through
 * the relevance gate (tests/fixtures/regions/places.ts: one on-site posting
 * per place spelling, plus the e2e region seeds). Prints the table, or with
 * --write replaces the block between the coverage-matrix markers in
 * docs/job-sources.md.
 *
 * Usage: pnpm tsx scripts/coverage-matrix.ts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { coverageMatrix, matrixMarkdown, type MatrixRow } from '@/lib/coverage/matrix'
import { PLAYBOOKS } from '@/lib/coverage/playbooks'
import { evaluateRelevance } from '@/lib/discovery/relevance/gate'
import { EMPTY_PREFS, type SearchPrefs } from '@/lib/discovery/relevance/prefs'
import { REGION_CODES } from '@/lib/discovery/relevance/places'
import { isWithin } from '@/lib/regions/tree'
import { PLACES } from '@/tests/fixtures/regions/places'
import { REGION_SEEDS } from '@/tests/e2e/seed-data'

const START = '<!-- coverage-matrix:start -->'
const END = '<!-- coverage-matrix:end -->'

/** Every target region, remote worldwide, relocation to the abroad playbooks. */
const PREFS: SearchPrefs = {
  ...EMPTY_PREFS,
  active: true,
  roleFamilies: ['backend', 'fullstack', 'data_analyst', 'business_analyst', 'erp', 'payments'],
  seniority: ['junior', 'mid'],
  regionIds: ['gcc', 'in'],
  regions: [...REGION_CODES],
  otherCountries: ['GB', 'US', 'CA', 'AU', 'SG', 'MY', 'DE'],
  remoteScope: 'worldwide',
}

const JD = 'Build REST APIs in PHP / Laravel with MySQL; SQL reporting. 2+ years of experience.'

/** Extra synthetic places for regions the shared fixture leaves out. */
const EXTRA: Readonly<Record<string, readonly string[]>> = {
  remote: ['Remote', 'Remote - EMEA', 'Remote (GCC)', 'Anywhere', 'Remote, India'],
  europe: ['Berlin, Germany', 'Amsterdam, Netherlands'],
  gb: ['London, UK'],
  us: ['New York, NY'],
  ca: ['Toronto, Canada'],
  au: ['Sydney, Australia'],
  sg: ['Singapore'],
  my: ['Kuala Lumpur, Malaysia'],
}

function fixtureKept(row: MatrixRow, covers: readonly string[]): string {
  const places = [...(PLACES[row.id] ?? []), ...(EXTRA[row.id] ?? []), ...REGION_SEEDS.map(([, loc]) => loc)]
  let total = 0
  let kept = 0
  for (const location of places) {
    const remote = row.id === 'remote'
    const r = evaluateRelevance(
      { title: 'Backend Developer', location, remoteType: remote ? 'remote' : 'onsite', descriptionMd: JD, techStack: [] },
      PREFS,
    )
    if (!r.regionIds.some((id) => covers.some((c) => isWithin(id, c)))) continue
    total++
    if (r.pass) kept++
  }
  return total === 0 ? '—' : `${kept} / ${total}`
}

function main(): void {
  const rows = coverageMatrix().map((r) => ({ ...r, fixtureKept: fixtureKept(r, PLAYBOOKS.find((p) => p.id === r.id)!.covers) }))
  const table = matrixMarkdown(rows)
  if (!process.argv.includes('--write')) {
    console.log(table)
    return
  }
  const path = join(process.cwd(), 'docs', 'job-sources.md')
  const doc = readFileSync(path, 'utf8')
  const a = doc.indexOf(START)
  const b = doc.indexOf(END)
  if (a < 0 || b < a) throw new Error(`markers ${START} … ${END} not found in docs/job-sources.md`)
  writeFileSync(path, `${doc.slice(0, a + START.length)}\n${table}\n${doc.slice(b)}`)
  console.log(`docs/job-sources.md: coverage matrix updated (${rows.length} regions)`)
}

main()
