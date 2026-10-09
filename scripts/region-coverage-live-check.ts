/**
 * One-off live check of job coverage per region (network; public sources
 * only; never in tests or CI; no database rows are written).
 *
 * Reads every polled starter-catalog source once (one request per board;
 * paged feeds as their adapter pages them) and counts the postings each
 * region gets, tagged and gated exactly as ingest does:
 *   before   the sources switched on by default up to defaults v5
 *   after    the sources switched on by default in v6 (this change)
 *   one-click  after + every catalog board for the region (Coverage › Turn on)
 * Tagging uses the current region taxonomy for every column, so "before"
 * understates the old loss from unknown spellings (that is measured with
 * fixtures in tests/unit/region-survival.test.ts).
 *
 * Usage: DATABASE_URL=pglite:memory:// pnpm tsx scripts/region-coverage-live-check.ts [region…]
 */
// Placeholder env only (lib/env parses at import); never real secrets.
import '@/tests/env-setup'
import { getAdapter } from '@/lib/discovery/adapters'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'
import { DEFAULT_SOURCES, type DefaultSource } from '@/lib/defaults/catalog'
import { catalogBoardsFor } from '@/lib/coverage/compute'
import { PLAYBOOKS } from '@/lib/coverage/playbooks'
import { evaluateRelevance } from '@/lib/discovery/relevance/gate'
import { EMPTY_PREFS, type SearchPrefs } from '@/lib/discovery/relevance/prefs'
import { EMPTY_DISCOVERY_PREFS } from '@/lib/discovery/relevance/discovery-prefs'
import { REGION_CODES } from '@/lib/discovery/relevance/places'
import { isWithin } from '@/lib/regions/tree'

/** The owner's domains and levels (no personal data): software, data, analysis; junior–mid. */
const PREFS: SearchPrefs = {
  ...EMPTY_PREFS,
  active: true,
  roleFamilies: ['backend', 'fullstack', 'payments', 'einvoicing', 'erp', 'api_integration', 'data_analyst', 'business_analyst'],
  seniority: ['junior', 'mid'],
  regionIds: ['gcc', 'in'],
  regions: [...REGION_CODES],
  remoteScope: 'worldwide',
  extra: { ...EMPTY_DISCOVERY_PREFS, sponsorshipFor: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'], basedIn: 'IN' },
}

/** Kinds that need a key or are not job lists. */
const SKIP = new Set(['watch', 'adzuna', 'yc_directory', 'email_alert', 'google_alerts', 'linkedin_post', 'manual_import', 'local_companies'])

interface Tagged {
  regionIds: string[]
  pass: boolean
}

async function readSource(d: DefaultSource): Promise<Tagged[] | string> {
  const adapter = getAdapter(d.kind)
  if (!adapter) return 'no adapter'
  try {
    const items = await adapter.fetch(d.config)
    return items
      .filter((i) => i.normalized.kind === 'job')
      .map((i) => {
        const j = i.normalized as NormalizedJob
        const r = evaluateRelevance(
          { title: j.title, location: j.location, remoteType: j.remoteType, descriptionMd: j.descriptionMd, techStack: j.techStack, employmentType: j.employmentType },
          PREFS,
        )
        return { regionIds: r.regionIds, pass: r.pass }
      })
  } catch (err) {
    return err instanceof Error ? err.message.slice(0, 80) : 'error'
  }
}

async function pool<T, R>(items: readonly T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i]!)
      }
    }),
  )
  return out
}

function count(results: ReadonlyMap<string, Tagged[]>, keys: Iterable<string>, covers: readonly string[]): { tagged: number; kept: number } {
  let tagged = 0
  let kept = 0
  for (const k of new Set(keys)) {
    for (const t of results.get(k) ?? []) {
      if (!t.regionIds.some((id) => covers.some((c) => isWithin(id, c)))) continue
      tagged++
      if (t.pass) kept++
    }
  }
  return { tagged, kept }
}

async function main(): Promise<void> {
  const wanted = process.argv.slice(2)
  const playbooks = PLAYBOOKS.filter((p) => wanted.length === 0 || wanted.includes(p.id))
  const polled = DEFAULT_SOURCES.filter((d) => !SKIP.has(d.kind))
  console.log(`Reading ${polled.length} public sources once…`)
  const read = await pool(polled, 4, async (d) => [d.key, await readSource(d)] as const)
  const results = new Map<string, Tagged[]>()
  const failed: string[] = []
  for (const [key, r] of read) {
    if (typeof r === 'string') failed.push(`${key}: ${r}`)
    else results.set(key, r)
  }
  const before = polled.filter((d) => d.enabled && d.since <= 5).map((d) => d.key)
  const after = polled.filter((d) => d.enabled).map((d) => d.key)
  console.log('\nRegion | before (tagged / kept) | after | after + one-click boards')
  for (const p of playbooks) {
    const b = count(results, before, p.covers)
    const a = count(results, after, p.covers)
    const o = count(results, [...after, ...catalogBoardsFor(p).map((d) => d.key)], p.covers)
    console.log(`${p.label} | ${b.tagged} / ${b.kept} | ${a.tagged} / ${a.kept} | ${o.tagged} / ${o.kept}`)
  }
  if (failed.length > 0) console.log(`\nUnreadable today (${failed.length}):\n  ${failed.join('\n  ')}`)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
