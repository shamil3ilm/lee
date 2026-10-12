import { z } from 'zod'
import { XMLParser } from 'fast-xml-parser'
import type { AdapterContext, DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'
import { untrustedDiscoveryFetch } from './http'
import { fetchBambooJob } from './bamboohr'
import { boardSource, isReadableBoard, sameBoard, type BoardRef } from '@/lib/companies/board-links'
import { extractPost, type NewsPostFacts, type WpPost } from '@/lib/discovery/job-news/extract'
import { enrichCandidates } from '@/lib/discovery/manual-import/enrich'
import { placeName } from '@/lib/regions/display'
import { domainEvidence } from '@/lib/discovery/relevance/domains'
import { classifyRole } from '@/lib/discovery/relevance/roles'
import { logger } from '@/lib/logger'

/**
 * Job-news roundups on WordPress sites (Malayalam Gulf news: Pravasi News
 * Daily, Pravasi Varthakal). Each post names an employer and links to its
 * own job pages. Read through the site's public WP REST API (falling back
 * to the category RSS feed), at most once a day, only posts of the last
 * LOOKBACK_DAYS:
 *
 *   GET {site}/wp-json/wp/v2/posts?categories={ids}&after={iso}&per_page=50&_fields=id,date,link,title,content,categories
 *
 * Every post is reduced to extracted facts (lib/discovery/job-news/extract.ts);
 * the article is never stored. The facts are used three ways:
 *
 *   (a) a link to ONE job on a readable ATS (BambooHR /careers/479,
 *       Greenhouse /jobs/123, Lever, Ashby, Workable, Workday) is read
 *       through that ATS's adapter and ingested as a normal discovery,
 *       unless the user already reads that board (the board has it) or the
 *       same link is already stored;
 *   (b) the employer and its board / website become a company lead
 *       (Companies tab, country-tagged; see `leadsOf`), so lee keeps
 *       reading the employer directly afterwards;
 *   (c) a post with no usable job link (walk-ins, email-to-apply) gives a
 *       low-confidence title-only discovery per listed role, linking to
 *       the post, with the walk-in date and venue; Scam Shield checks it
 *       like any other discovery.
 */

export const LOOKBACK_DAYS = 3
export const FIRST_LOOKBACK_DAYS = 7
export const MAX_POSTS = 100
const PAGE_SIZE = 50
/** One-job ATS reads per run. */
export const MAX_DIRECT_JOBS = 20

const configSchema = z.object({
  /** The site's home URL ("https://www.pravasinewsdaily.com"). */
  url: z.string().url().max(300),
  /** WordPress category ids of job posts; detected from the site when absent. */
  jobCategories: z.array(z.number().int().positive()).max(5).optional(),
  /** Category id → ISO-2 country ("47": "KW"). */
  countryCategories: z.record(z.string(), z.string().regex(/^[A-Z]{2}$/)).optional(),
  siteName: z.string().max(80).optional(),
  /** Short id used in tags ("pravasinewsdaily"). */
  siteKey: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
  lookbackDays: z.number().int().min(1).max(30).optional(),
})
export type WpJobNewsConfig = z.infer<typeof configSchema>

export interface JobNewsDeps {
  getText?: (url: string) => Promise<{ ok: boolean; status: number; text: string; type: string }>
  now?: Date
  /** One opening on a readable board (tests stub it). */
  fetchJob?: (board: BoardRef, facts: NewsPostFacts, ctx?: AdapterContext) => Promise<DiscoveryItem | null>
  /** Sources the user already has (dedupe with a directly read board). */
  sources?: (userId: string) => Promise<Array<{ kind: string; config: unknown }>>
  /** Links already stored in any source (dedupe). */
  storedUrls?: (userId: string, urls: readonly string[]) => Promise<ReadonlySet<string>>
}

export interface JobNewsRun {
  posts: NewsPostFacts[]
  items: DiscoveryItem[]
  stats: { posts: number; direct: number; titleOnly: number; dedupedWithBoard: number; dedupedStored: number }
}

function siteBase(url: string): URL {
  const u = new URL(url)
  return new URL(`${u.protocol}//${u.host}`)
}

export function siteKeyOf(cfg: Pick<WpJobNewsConfig, 'url' | 'siteKey'>): string {
  return cfg.siteKey ?? siteBase(cfg.url).hostname.replace(/^www\./, '').split('.')[0]!.toLowerCase().replace(/[^a-z0-9-]/g, '')
}

async function defaultGetText(url: string): Promise<{ ok: boolean; status: number; text: string; type: string }> {
  const res = await untrustedDiscoveryFetch('wp_job_news', url, { headers: { accept: 'application/json, application/rss+xml;q=0.9, */*;q=0.5' } })
  return { ok: res.ok, status: res.status, text: await res.text(), type: res.headers.get('content-type') ?? '' }
}

interface WpCategory {
  id: number
  name: string
  slug: string
  count?: number
}

/** "Jobs" / "JOB" / "Careers" / "Vacancies" categories of a WordPress site, biggest first. */
export async function detectJobCategories(url: string, deps: JobNewsDeps = {}): Promise<{ siteName: string | null; categories: WpCategory[] }> {
  const get = deps.getText ?? defaultGetText
  const base = siteBase(url)
  const cats = await get(new URL('/wp-json/wp/v2/categories?per_page=100&_fields=id,name,slug,count', base).toString())
  if (!cats.ok) return { siteName: null, categories: [] }
  let list: WpCategory[] = []
  try {
    const parsed = JSON.parse(cats.text) as unknown
    list = Array.isArray(parsed) ? (parsed as WpCategory[]) : []
  } catch {
    return { siteName: null, categories: [] }
  }
  const jobs = list
    .filter((c) => /\b(?:jobs?|careers?|vacanc(?:y|ies)|recruitment|employment|gulf jobs)\b|ജോലി|തൊഴിൽ/i.test(`${c.name} ${c.slug}`))
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
  let siteName: string | null = null
  try {
    const root = await get(new URL('/wp-json/?_fields=name', base).toString())
    siteName = root.ok ? ((JSON.parse(root.text) as { name?: string }).name ?? null) : null
  } catch {
    siteName = null
  }
  return { siteName, categories: jobs }
}

function parseRss(xml: string): WpPost[] {
  const doc = new XMLParser({ ignoreAttributes: true, processEntities: true }).parse(xml) as {
    rss?: { channel?: { item?: unknown } }
  }
  const raw = doc.rss?.channel?.item
  const items = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Array<Record<string, unknown>>
  return items.map((it, i) => {
    const guid = String((it.guid as string | undefined) ?? it.link ?? i)
    const idMatch = /[?&]p=(\d+)/.exec(guid)
    return {
      id: idMatch ? Number(idMatch[1]) : Math.abs([...guid].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7)),
      date: new Date(String(it.pubDate ?? '')).toISOString(),
      link: String(it.link ?? ''),
      title: String(it.title ?? ''),
      content: String(it['content:encoded'] ?? it.description ?? ''),
      categories: [],
    }
  })
}

/** Posts of the job categories since `after`: WP REST, else the category RSS feed. */
async function loadPosts(cfg: WpJobNewsConfig, categories: number[], after: Date, deps: JobNewsDeps): Promise<WpPost[]> {
  const get = deps.getText ?? defaultGetText
  const base = siteBase(cfg.url)
  const api = new URL('/wp-json/wp/v2/posts', base)
  api.searchParams.set('categories', categories.join(','))
  api.searchParams.set('after', after.toISOString())
  api.searchParams.set('per_page', String(PAGE_SIZE))
  api.searchParams.set('_fields', 'id,date,link,title,content,categories')
  const res = await get(api.toString())
  if (res.ok) {
    try {
      const first = JSON.parse(res.text) as unknown
      if (Array.isArray(first)) {
        const posts = [...(first as WpPost[])]
        // A busy week fills more than a page: read on (newest first), up to MAX_POSTS.
        for (let page = 2; posts.length < MAX_POSTS && posts.length === (page - 1) * PAGE_SIZE; page++) {
          api.searchParams.set('page', String(page))
          const more = await get(api.toString())
          const list = more.ok ? (JSON.parse(more.text) as unknown) : null
          if (!Array.isArray(list) || list.length === 0) break
          posts.push(...(list as WpPost[]))
        }
        return posts
      }
    } catch {
      // fall through to the feed
    }
  }
  const feed = await get(new URL(`/?cat=${categories[0]}&feed=rss2`, base).toString())
  if (!feed.ok) throw new Error(`wp_job_news ${res.status}`)
  return parseRss(feed.text).filter((p) => new Date(p.date) >= after)
}

/** One opening through its ATS: BambooHR's detail endpoint, else the board read once and matched. */
async function defaultFetchJob(board: BoardRef, facts: NewsPostFacts, ctx?: AdapterContext): Promise<DiscoveryItem | null> {
  const employer = facts.employer ?? board.slug
  if (board.kind === 'bamboohr' && board.jobId) return fetchBambooJob(board.slug, board.jobId, employer)
  // Lazy: the registry imports this adapter.
  const { getAdapter } = await import('./index')
  const [hit] = await enrichCandidates([{ url: board.url, title: '', employer, location: '', snippet: '', postedDate: '' }], {
    getAdapter,
    ...(ctx ? { ctx } : {}),
  })
  return hit?.enrichedFrom ? hit.item : null
}

function roleKey(role: string): string {
  return role.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

/**
 * A title-only role carries no job description, so the gate's JD evidence
 * rule can't judge it: only roles whose TITLE reads as software, data or IT
 * work become discoveries (any user's tech field; the user's own role
 * preferences still apply in the gate). The rest of the post — a bus
 * monitor walk-in, a butchery assistant — stays out of New; the employer
 * still becomes a lead.
 */
export function techTitle(role: string): boolean {
  return domainEvidence(role, '').techTitle || classifyRole({ title: role }).families.length > 0
}

/** (c) Title-only discoveries for a post without a usable job link. */
export function titleOnlyItems(f: NewsPostFacts, siteName: string, siteKey: string): DiscoveryItem[] {
  const where = f.regionIds[0] ? placeName(f.regionIds[0]) : undefined
  const walkIn = f.walkIn ? `Walk-in interview: ${[f.walkIn.dates, f.walkIn.time, f.walkIn.venue].filter(Boolean).join(' · ')}` : null
  const description = [
    f.snippet,
    walkIn,
    f.emails.length > 0 ? `Apply by email: ${f.emails.join(', ')}` : null,
    ...f.risk,
    `Seen on ${siteName}: ${f.postUrl}`,
  ]
    .filter(Boolean)
    .join('\n')
  return f.roles.filter(techTitle).map((role) => {
    const raw = { via: 'job_news', site: siteKey, postId: f.postId, postUrl: f.postUrl, role, employer: f.employer, walkIn: f.walkIn }
    const normalized: NormalizedJob = {
      kind: 'job',
      title: role,
      companyName: f.employer ?? 'Employer not named',
      ...(f.employerWebsite ? { companyWebsite: f.employerWebsite } : {}),
      location: where,
      remoteType: 'onsite',
      employmentType: 'unknown',
      descriptionMd: description,
      applyUrl: f.postUrl,
      postedAt: f.postedAt,
      techStack: [],
      subSource: siteKey,
      tags: ['via:job_news', `news:${siteKey}`, 'confidence:title-only', ...(f.walkIn ? ['walk-in'] : []), ...(f.country ? [`country:${f.country.toLowerCase()}`] : [])],
      raw,
    }
    return { sourceItemId: `post:${f.postId}:${roleKey(role)}`, raw, normalized }
  })
}

function readableJobLinks(f: NewsPostFacts): BoardRef[] {
  const seen = new Set<string>()
  return f.links.flatMap((l) => {
    const b = l.board
    if (!b || !b.jobId || !isReadableBoard(b.kind)) return []
    const k = `${b.kind}:${b.slug}:${b.jobId}`.toLowerCase()
    if (seen.has(k)) return []
    seen.add(k)
    return [b]
  })
}

async function defaultSources(userId: string): Promise<Array<{ kind: string; config: unknown }>> {
  const sourcesQ = await import('@/lib/db/queries/sources')
  return (await sourcesQ.list(userId)).filter((s) => s.enabled)
}

async function defaultStoredUrls(userId: string, urls: readonly string[]): Promise<ReadonlySet<string>> {
  const { findPossibleDuplicates } = await import('@/lib/db/queries/discoveryDedupe')
  const rows = await findPossibleDuplicates(userId, { urls, titles: [] })
  return new Set(rows.flatMap((r) => (r.applyUrl ? [r.applyUrl] : [])))
}

/** Read the posts and route them: (a) direct ATS jobs, (c) title-only roles. Leads (b) come from `posts`. */
export async function readJobNews(config: unknown, ctx?: AdapterContext, deps: JobNewsDeps = {}): Promise<JobNewsRun> {
  const cfg = configSchema.parse(config)
  const siteHost = siteBase(cfg.url).hostname
  const siteKey = siteKeyOf(cfg)
  const siteName = cfg.siteName ?? siteHost.replace(/^www\./, '')
  const now = deps.now ?? new Date()
  const categories = cfg.jobCategories ?? (await detectJobCategories(cfg.url, deps)).categories.slice(0, 1).map((c) => c.id)
  if (categories.length === 0) throw new Error('wp_job_news: no job category found on this site')
  const after = new Date(now.getTime() - (cfg.lookbackDays ?? LOOKBACK_DAYS) * 86_400_000)
  const raw = await loadPosts(cfg, categories, after, deps)
  const posts = raw.slice(0, MAX_POSTS).map((p) => extractPost(p, { siteHost, countryCategories: cfg.countryCategories }))
  const stats = { posts: posts.length, direct: 0, titleOnly: 0, dedupedWithBoard: 0, dedupedStored: 0 }
  const userSources = ctx?.userId ? await (deps.sources ?? defaultSources)(ctx.userId).catch(() => []) : []
  const items: DiscoveryItem[] = []
  let directBudget = MAX_DIRECT_JOBS
  for (const f of posts) {
    const jobs = readableJobLinks(f)
    let routed = 0
    for (const b of jobs) {
      const src = boardSource(b, f.employer ?? undefined)
      if (src && userSources.some((s) => sameBoard(src, s.kind, (s.config ?? {}) as Record<string, unknown>))) {
        stats.dedupedWithBoard += 1
        routed += 1
        continue
      }
      const id = `${b.kind}:${b.slug}:${b.jobId}`.toLowerCase()
      if (ctx?.seenItemIds && (await ctx.seenItemIds([id]).catch(() => new Set<string>())).has(id)) {
        routed += 1
        continue
      }
      if (directBudget <= 0) continue
      directBudget -= 1
      const hit = await (deps.fetchJob ?? defaultFetchJob)(b, f, ctx).catch(() => null)
      if (!hit) continue
      routed += 1
      const job = hit.normalized as NormalizedJob
      items.push({
        sourceItemId: id,
        raw: hit.raw,
        normalized: {
          ...job,
          companyName: f.employer ?? job.companyName,
          ...(f.employerWebsite && !job.companyWebsite ? { companyWebsite: f.employerWebsite } : {}),
          subSource: siteKey,
          tags: [...new Set([...(job.tags ?? []), 'via:job_news', `news:${siteKey}`])],
        },
      })
      stats.direct += 1
    }
    if (jobs.length === 0 || routed === 0) {
      const titleOnly = titleOnlyItems(f, siteName, siteKey)
      items.push(...titleOnly)
      stats.titleOnly += titleOnly.length
    }
  }
  // Same link already stored under another source (the board itself, an import): skip it.
  const stored = ctx?.userId
    ? await (deps.storedUrls ?? defaultStoredUrls)(
        ctx.userId,
        items.filter((i) => !i.sourceItemId.startsWith('post:')).map((i) => (i.normalized as NormalizedJob).applyUrl),
      ).catch(() => new Set<string>())
    : new Set<string>()
  const kept = items.filter((i) => i.sourceItemId.startsWith('post:') || !stored.has((i.normalized as NormalizedJob).applyUrl))
  stats.dedupedStored = items.length - kept.length
  return { posts, items: kept, stats }
}

export class WpJobNewsAdapter implements DiscoveryAdapter {
  readonly kind = 'wp_job_news'

  constructor(private readonly deps: JobNewsDeps = {}) {}

  async fetch(config: unknown, ctx?: AdapterContext): Promise<DiscoveryItem[]> {
    const run = await readJobNews(config, ctx, this.deps)
    if (ctx?.userId) {
      // (b) Employer leads for the Companies tab; best effort, never fails the poll.
      try {
        const { storeNewsLeads } = await import('@/lib/discovery/job-news/leads')
        await storeNewsLeads(ctx.userId, run.posts, configSchema.parse(config))
      } catch (e) {
        logger.warn('job_news_leads_failed', { userId: ctx.userId, err: e instanceof Error ? e.message : String(e) })
      }
    }
    return run.items
  }
}
