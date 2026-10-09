/**
 * One-off live check of the company seed catalog (network). For every entry:
 * the website answers (through the same SSRF-guarded client and robots.txt
 * rules as enrichment), and the careers page / job board found where
 * robots.txt allows. Prints one line per company and a summary; a failing
 * entry is fixed or removed by hand, then its `checkedOn` bumped.
 *
 * Usage: pnpm tsx scripts/company-seed-verify.ts [domain-filter]
 */
import { SEED_COMPANIES } from '@/lib/company-discovery/seed'
import { findCareers } from '@/lib/company-discovery/careers'
import { companyErrorText, companyGet } from '@/lib/company-discovery/http'

async function main(): Promise<void> {
  const filter = process.argv[2] ?? ''
  let ok = 0
  let failed = 0
  for (const s of SEED_COMPANIES.filter((x) => x.website.includes(filter))) {
    try {
      const home = await companyGet('seed-verify', s.website, { timeoutMs: 20_000 }, { accept: 'text/html', maxRedirects: 5 })
      void home.body?.cancel().catch(() => undefined)
      const reachable = home.status < 500
      const r = await findCareers(s.website, { timeoutMs: 20_000 })
      const where = r.board ? `${r.board.kind}:${r.board.slug}` : (r.careersUrl ?? '-')
      console.log(`${reachable ? 'OK  ' : 'FAIL'} ${s.name.padEnd(32)} ${s.website.padEnd(40)} ${String(home.status).padEnd(4)} ${r.status.padEnd(8)} ${where}${r.note ? ` (${r.note})` : ''}`)
      if (reachable) ok += 1
      else failed += 1
    } catch (e) {
      failed += 1
      console.log(`FAIL ${s.name.padEnd(32)} ${s.website.padEnd(40)} ${companyErrorText(e)}`)
    }
  }
  console.log(`\n${ok} reachable · ${failed} failed`)
}

main().catch((e: unknown) => {
  console.error(companyErrorText(e))
  process.exit(1)
})
