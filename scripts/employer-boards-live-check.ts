/**
 * Live check (public endpoints only, no database): what lee would do with
 * the employers it knows in Kuwait and the UAE.
 *
 *   1. The AIU BambooHR board through the adapter and the relevance gate for
 *      the owner's preferences: which roles land in New, Filtered (and why).
 *   2. The weekly board auto-detect over the seed list for Kuwait and the
 *      UAE (robots.txt first, the same page cap and host spacing as the
 *      job): boards found per ATS.
 *   3. The Pravasi News Daily job category over the last N days: posts read,
 *      employers found, direct ATS jobs (by country) and how many pass the
 *      gate, title-only roles, and employer leads.
 *
 * Usage: pnpm tsx scripts/employer-boards-live-check.ts [aiu|news [days]|detect [name filter]]
 * (with the CI dummy env, e.g. DATABASE_URL=pglite:memory://; nothing is written).
 */
import { BambooHrAdapter } from '@/lib/discovery/adapters/bamboohr'
import { readJobNews } from '@/lib/discovery/adapters/wp-job-news'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'
import { evaluateRelevance, formatReasons } from '@/lib/discovery/relevance/gate'
import { EMPTY_PREFS, type SearchPrefs } from '@/lib/discovery/relevance/prefs'
import { REGION_CODES } from '@/lib/discovery/relevance/places'
import { SEED_COMPANIES } from '@/lib/company-discovery/seed'
import { findCareers } from '@/lib/company-discovery/careers'
import { companyErrorText } from '@/lib/company-discovery/http'
import { leadsOf } from '@/lib/discovery/job-news/leads'
import { DEFAULT_SOURCES } from '@/lib/defaults/catalog'
import { countryOf } from '@/lib/regions/tree'

/** The owner's preferences (backend / web, data analysis; junior to mid; the GCC and Kerala). */
const OWNER: SearchPrefs = {
  ...EMPTY_PREFS,
  active: true,
  roleFamilies: ['backend', 'fullstack', 'data_analyst'],
  seniority: ['junior', 'mid'],
  regionIds: ['gcc', 'kerala'],
  regions: [...REGION_CODES],
  remoteScope: 'worldwide',
}

function gate(j: NormalizedJob): { pass: boolean; why: string } {
  const r = evaluateRelevance({ title: j.title, location: j.location, remoteType: j.remoteType, descriptionMd: j.descriptionMd, techStack: j.techStack }, OWNER)
  return { pass: r.pass, why: r.pass ? [...r.penalties, ...r.infos].join(' · ') : (formatReasons(r.reasons) ?? '') }
}

async function aiu(): Promise<void> {
  console.log('\n== AIU (aiu.bamboohr.com) through the adapter and the gate ==')
  const items = await new BambooHrAdapter().fetch({ company: 'aiu', displayName: 'American International University' })
  let kept = 0
  for (const i of items) {
    const j = i.normalized as NormalizedJob
    const g = gate(j)
    if (g.pass) kept += 1
    console.log(`${g.pass ? 'NEW     ' : 'FILTERED'} ${i.sourceItemId.padEnd(4)} ${j.title.slice(0, 70).padEnd(70)} ${j.localHire ? '[Local hire] ' : ''}${g.why}`)
  }
  console.log(`${items.length} openings: ${kept} in New, ${items.length - kept} filtered (none dismissed: Dismissed is the user's choice).`)
}

async function detect(): Promise<void> {
  console.log('\n== Board auto-detect over the Kuwait and UAE seed ==')
  const filter = (process.argv[3] ?? '').toLowerCase()
  const seeds = SEED_COMPANIES.filter((s) => s.regionIds.some((r) => ['kw', 'ae'].includes(countryOf(r) ?? '')) && s.name.toLowerCase().includes(filter))
  const byKind = new Map<string, number>()
  let blocked = 0
  for (const s of seeds) {
    try {
      const r = await findCareers(s.website, { timeoutMs: 20_000 })
      if (r.status === 'blocked') blocked += 1
      const kind = r.board?.kind ?? (r.status === 'found' ? 'careers page only' : r.status)
      byKind.set(kind, (byKind.get(kind) ?? 0) + 1)
      console.log(`${s.name.slice(0, 40).padEnd(40)} ${r.status.padEnd(8)} ${r.board ? `${r.board.kind}:${r.board.slug}` : (r.careersUrl ?? '-')}${r.note ? ` (${r.note})` : ''}`)
    } catch (e) {
      byKind.set('error', (byKind.get('error') ?? 0) + 1)
      console.log(`${s.name.slice(0, 40).padEnd(40)} error    ${companyErrorText(e)}`)
    }
  }
  console.log(`${seeds.length} companies; robots blocked ${blocked}.`)
  console.log([...byKind.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n}`).join(' · '))
}

async function news(days: number): Promise<void> {
  console.log(`\n== Pravasi News Daily, last ${days} days ==`)
  const preset = DEFAULT_SOURCES.find((s) => s.key === 'wp_job_news:pravasinewsdaily')!
  const run = await readJobNews({ ...preset.config, lookbackDays: days })
  const employers = new Set(run.posts.flatMap((p) => (p.employer ? [p.employer] : [])))
  console.log(`${run.stats.posts} posts read; ${employers.size} employers named.`)
  const direct = run.items.filter((i) => !i.sourceItemId.startsWith('post:'))
  const byCountry = new Map<string, { n: number; pass: number }>()
  for (const i of direct) {
    const j = i.normalized as NormalizedJob
    const g = gate(j)
    const post = run.posts.find((p) => p.employer === j.companyName)
    const c = post?.country ?? '?'
    const cur = byCountry.get(c) ?? { n: 0, pass: 0 }
    byCountry.set(c, { n: cur.n + 1, pass: cur.pass + (g.pass ? 1 : 0) })
    console.log(`DIRECT ${g.pass ? 'NEW     ' : 'FILTERED'} ${c} ${j.companyName.slice(0, 32).padEnd(32)} ${j.title.slice(0, 60).padEnd(60)} ${g.why}`)
  }
  const titleOnly = run.items.filter((i) => i.sourceItemId.startsWith('post:'))
  const titlePass = titleOnly.filter((i) => gate(i.normalized as NormalizedJob).pass).length
  const leads = leadsOf(run.posts, 'Pravasi News Daily', 'pravasinewsdaily', new Date())
  console.log(`Direct ATS jobs: ${direct.length} (${[...byCountry.entries()].map(([c, v]) => `${c}: ${v.n}, ${v.pass} pass the gate`).join('; ') || 'none'}).`)
  console.log(`Title-only roles: ${titleOnly.length} (${titlePass} pass the gate).`)
  console.log(`Leads: ${leads.length} employers (${leads.filter((l) => l.board).length} with a board: ${leads.filter((l) => l.board).map((l) => `${l.name} [${l.board!.kind}]`).join(', ')}).`)
  const aiuPost = run.posts.find((p) => /american international university/i.test(p.employer ?? ''))
  if (aiuPost) console.log(`AIU post: ${aiuPost.postUrl} → ${aiuPost.links.filter((l) => l.board?.jobId).length} BambooHR job links, roles: ${aiuPost.roles.join('; ')}`)
}

async function main(): Promise<void> {
  const what = process.argv[2] ?? 'all'
  const days = what === 'news' ? Number(process.argv[3] ?? 7) : 7
  if (what === 'all' || what === 'aiu') await aiu()
  if (what === 'all' || what === 'news') await news(days)
  if (what === 'all' || what === 'detect') await detect()
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
