import * as profileQ from '@/lib/db/queries/profile'
import * as newQ from '@/lib/db/queries/radarNew'
import * as termsQ from '@/lib/db/queries/radarTerms'
import { feedById } from '../feeds-catalog'
import { cleanTerm } from '../match'
import { periodDays, type WhatsNewFilters } from './filters'
import { formatParams } from './hf'
import { loadPersonalContext, type PersonalContext } from './personal'
import { rankEntry, type Chip } from './rank'
import { relevanceMatcher } from './relevance'
import { GROUP_LABELS, NEW_CATEGORIES, NEW_CATEGORY_LABELS, NEW_SOURCE_LABELS, isNewCategory, isNewSource, type NewCategory, type NewMetrics } from './types'

/**
 * Serializable views for Radar › What's new: the shared entries ranked for
 * one user (score, reason chips, "relevant to me"), with whether the user
 * already watches or opened each. Dates are `YYYY-MM-DD` (shown US style).
 */

export const SECTION_SIZE = 6
export const PAGE_SIZE = 24

export interface SourceLink {
  source: string
  label: string
  url: string
}

export interface NewEntryView {
  id: string
  name: string
  category: NewCategory
  openness: 'open' | 'proprietary' | null
  groupLabel: string | null
  url: string
  excerpt: string
  facts: string[]
  createdDay: string | null
  firstSeenDay: string
  variantCount: number
  score: number
  relevant: boolean
  chips: Chip[]
  sources: SourceLink[]
  watched: boolean
  /** The user's own Radar entry for it (after Save / Brief), if any. */
  entryId: string | null
}

export interface WhatsNewSection {
  category: NewCategory
  label: string
  total: number
  entries: NewEntryView[]
}

export interface WhatsNewPage {
  sections: WhatsNewSection[]
  total: number
  hasMore: boolean
  personal: Pick<PersonalContext, 'releaseProjects' | 'releaseProjectsDerived'> & { topics: number }
}

function day(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

const US_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/** Facts from the sources' own metadata. */
export function factsOf(m: NewMetrics): string[] {
  const out: string[] = []
  if (m.params) out.push(`${formatParams(m.params)} params`)
  if (m.license) out.push(`License ${m.license}`)
  if (m.baseModel) out.push(`${m.baseRelation === 'adapter' ? 'Adapter' : m.baseRelation === 'merge' ? 'Merge' : 'Fine-tune'} of ${m.baseModel}`)
  if (m.latest && m.version && m.latest !== m.version) out.push(`Latest ${m.latest}`)
  if (m.eol) out.push(`Security support until ${US_DAY.format(new Date(`${m.eol}T00:00:00Z`))}`)
  if (m.language) out.push(m.language)
  return out.slice(0, 4)
}

function sourceLabel(source: string, metrics: NewMetrics): string {
  if (source === 'feeds') return feedById(metrics.feedId)?.label ?? NEW_SOURCE_LABELS.feeds
  return isNewSource(source) ? NEW_SOURCE_LABELS[source] : source
}

interface Ranked {
  row: newQ.NewEntryRow
  score: number
  relevance: number
  chips: Chip[]
}

function rankAll(rows: readonly newQ.NewEntryRow[], ctx: PersonalContext, sourcesOff: ReadonlySet<string>, now: Date): Ranked[] {
  const match = relevanceMatcher(ctx.topics)
  return rows
    .filter((r) => r.sources.some((s) => !sourcesOff.has(s)))
    .map((row) => {
      const rel = match({ category: row.category, name: row.name, excerpt: row.excerpt, tags: row.tags })
      const r = rankEntry({ sources: row.sources, group: row.grp, metrics: row.metrics as NewMetrics, createdAt: row.createdAt, firstSeenAt: row.firstSeenAt }, rel, now)
      return { row, ...r }
    })
    .sort((a, b) => b.score - a.score || b.row.firstSeenAt.getTime() - a.row.firstSeenAt.getTime())
}

async function toViews(userId: string, ranked: readonly Ranked[]): Promise<NewEntryView[]> {
  const ids = ranked.map((r) => r.row.id)
  const [items, terms, adopted] = await Promise.all([newQ.itemsOf(ids), termsQ.list(userId), newQ.userEntriesForNew(userId, ids)])
  const watched = new Set(terms.map((t) => cleanTerm(t.term).toLowerCase()))
  return ranked.map(({ row, score, relevance, chips }) => {
    const own = items.filter((i) => i.entryId === row.id)
    const links = new Map<string, SourceLink>()
    for (const i of own) {
      const label = sourceLabel(i.source, i.metrics as NewMetrics)
      if (!links.has(label)) links.set(label, { source: i.source, label, url: i.url })
    }
    return {
      id: row.id,
      name: row.name,
      category: isNewCategory(row.category) ? row.category : 'news',
      openness: row.openness === 'open' || row.openness === 'proprietary' ? row.openness : null,
      groupLabel: row.grp ? (GROUP_LABELS[row.grp] ?? null) : null,
      url: row.url,
      excerpt: row.excerpt,
      facts: factsOf(row.metrics as NewMetrics),
      createdDay: day(row.createdAt),
      firstSeenDay: day(row.firstSeenAt) as string,
      variantCount: row.variantCount,
      score,
      relevant: relevance > 0,
      chips,
      sources: [...links.values()].slice(0, 4),
      watched: watched.has(cleanTerm(row.name).toLowerCase()),
      entryId: adopted.get(row.id) ?? null,
    }
  })
}

export async function loadWhatsNew(userId: string, filters: WhatsNewFilters, page = 0, now: Date = new Date()): Promise<WhatsNewPage> {
  const [ctx, profile, rows] = await Promise.all([
    loadPersonalContext(userId),
    profileQ.get(userId),
    newQ.listCandidates(
      {
        sinceDays: periodDays(filters.period),
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.group ? { group: filters.group } : {}),
        openOnly: filters.openOnly,
      },
      now,
    ),
  ])
  let ranked = rankAll(rows, ctx, new Set(profile?.radarSourcesOff ?? []), now)
  if (filters.relevantOnly) ranked = ranked.filter((r) => r.relevance > 0)
  const personal = { releaseProjects: ctx.releaseProjects, releaseProjectsDerived: ctx.releaseProjectsDerived, topics: ctx.topics.length }

  if (filters.category) {
    const slice = ranked.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    const entries = await toViews(userId, slice)
    const section = { category: filters.category, label: NEW_CATEGORY_LABELS[filters.category], total: ranked.length, entries }
    return { sections: [section], total: ranked.length, hasMore: ranked.length > (page + 1) * PAGE_SIZE, personal }
  }
  const groups = NEW_CATEGORIES.map((category) => ({ category, all: ranked.filter((r) => r.row.category === category) }))
  const views = await toViews(userId, groups.flatMap((g) => g.all.slice(0, SECTION_SIZE)))
  const sections = groups.map((g) => ({
    category: g.category,
    label: NEW_CATEGORY_LABELS[g.category],
    total: g.all.length,
    entries: views.filter((v) => v.category === g.category),
  }))
  return { sections, total: ranked.length, hasMore: false, personal }
}

/** The weekly digest's candidates for one user (ranked, with reason labels). */
export async function rankedSince(userId: string, since: Date, now: Date = new Date()) {
  const [ctx, profile, rows] = await Promise.all([loadPersonalContext(userId), profileQ.get(userId), newQ.firstSeenSince(since)])
  return rankAll(rows, ctx, new Set(profile?.radarSourcesOff ?? []), now).map((r) => ({
    id: r.row.id,
    name: r.row.name,
    category: isNewCategory(r.row.category) ? r.row.category : ('news' as const),
    url: r.row.url,
    score: r.score,
    reasons: r.chips.map((c) => c.label),
    firstSeenAt: r.row.firstSeenAt,
  }))
}
