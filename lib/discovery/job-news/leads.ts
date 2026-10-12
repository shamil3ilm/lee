import type { CompanyCandidate } from '@/lib/company-discovery/types'
import type { BoardRef } from '@/lib/companies/board-links'
import type { NewsPostFacts } from './extract'

/**
 * (b) Employer leads from job-news posts: the employer, country-tagged,
 * with its job board (any recognised ATS) or its own website, so lee keeps
 * reading the employer directly afterwards — a readable board is turned on
 * for starred regions (lib/company-discovery/boards.ts) and suggested
 * elsewhere; a website goes through the weekly board auto-detect.
 */

export const MAX_LEADS_PER_RUN = 30

/** The board's own page (no job id): "https://aiu.bamboohr.com/careers". */
function boardHome(b: BoardRef): string {
  try {
    const u = new URL(b.url)
    if (b.kind === 'bamboohr') return `${u.protocol}//${u.host}/careers`
    if (b.kind === 'workday' || b.kind === 'teamtailor') return b.slug.replace(/\/jobs\.rss$/, '/jobs')
    if (b.kind === 'oracle_orc') {
      const [host, site] = b.slug.split('/')
      return site ? `https://${host}/hcmUI/CandidateExperience/en/sites/${site}` : b.url
    }
    const first = u.pathname.split('/').filter(Boolean)[0]
    return first && !u.hostname.startsWith(`${b.slug}.`) ? `${u.protocol}//${u.host}/${first}` : `${u.protocol}//${u.host}/`
  } catch {
    return b.url
  }
}

/** Lead candidates (pure): one per employer with a board or a website and a country. */
export function leadsOf(posts: readonly NewsPostFacts[], siteName: string, siteKey: string, now: Date): CompanyCandidate[] {
  const out = new Map<string, CompanyCandidate>()
  for (const f of posts) {
    if (!f.employer || f.regionIds.length === 0) continue
    const board = f.links.find((l) => l.board)?.board ?? null
    if (!board && !f.employerWebsite) continue
    const key = f.employer.toLowerCase()
    if (out.has(key)) continue
    out.set(key, {
      name: f.employer,
      ...(f.employerWebsite ? { website: f.employerWebsite } : {}),
      regionIds: f.regionIds,
      industries: [],
      sourceTags: [`news:${siteKey}`],
      evidence: {
        listedAt: f.postUrl,
        seenOn: [siteName],
        ...(board ? { boardFound: { at: now.toISOString(), via: 'news' as const } } : {}),
      },
      ...(board ? { board: { kind: board.kind, slug: board.slug, url: boardHome(board) } } : {}),
    })
    if (out.size >= MAX_LEADS_PER_RUN) break
  }
  return [...out.values()]
}

/** Store the leads and turn on readable boards found in starred regions. */
export async function storeNewsLeads(
  userId: string,
  posts: readonly NewsPostFacts[],
  cfg: { url: string; siteName?: string; siteKey?: string },
  now: Date = new Date(),
): Promise<{ leads: number; new: number; enabled: number }> {
  const { siteKeyOf } = await import('@/lib/discovery/adapters/wp-job-news')
  const siteKey = siteKeyOf(cfg)
  const leads = leadsOf(posts, cfg.siteName ?? new URL(cfg.url).hostname.replace(/^www\./, ''), siteKey, now)
  if (leads.length === 0) return { leads: 0, new: 0, enabled: 0 }
  const { storeCandidates } = await import('@/lib/company-discovery/service')
  const { enableFoundBoardsInStarred } = await import('@/lib/company-discovery/boards')
  const r = await storeCandidates(userId, leads)
  const enabled = await enableFoundBoardsInStarred(userId, new Date(now.getTime() - 60_000))
  return { leads: leads.length, new: r.new, enabled }
}
