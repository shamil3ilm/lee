import { errorText, requestJson } from '@/lib/reputation/http'
import { arxivIdOf, dateOrNull, dayOf, excerptOf, titleOf } from '../text'
import type { RadarItemInput } from '../types'
import { pastDeadline, type RadarFetchDeps, type RadarFetchResult } from './types'

/**
 * Hugging Face Hub (public API, no key; an optional token from Settings ›
 * AI only raises the limit): trending models, Spaces and datasets, and the
 * curated Daily Papers. Limit: 500 requests per 5 minutes per IP.
 */

export const HF_API = 'https://huggingface.co/api'
const HF = 'https://huggingface.co'
const LIMITS = { models: 20, spaces: 10, datasets: 10, papers: 30 } as const

interface HubRow {
  id?: string
  likes?: number
  downloads?: number
  createdAt?: string
  tags?: unknown
  pipeline_tag?: string
  library_name?: string
  sdk?: string
  description?: string
}

function rows(body: unknown): HubRow[] {
  return Array.isArray(body) ? (body as HubRow[]).filter((r) => typeof r?.id === 'string' && r.id.length > 0) : []
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function licenseOf(tags: unknown): string | null {
  const t = Array.isArray(tags) ? tags.find((x) => typeof x === 'string' && x.startsWith('license:')) : undefined
  return typeof t === 'string' ? t.slice('license:'.length) : null
}

function arxivOf(tags: unknown): string | undefined {
  const t = Array.isArray(tags) ? tags.find((x) => typeof x === 'string' && x.startsWith('arxiv:')) : undefined
  return typeof t === 'string' ? (arxivIdOf(t) ?? undefined) : undefined
}

export function toModelItems(body: unknown): RadarItemInput[] {
  return rows(body).map((r) => {
    const id = r.id as string
    const parts = [r.pipeline_tag, r.library_name, licenseOf(r.tags) ? `license ${licenseOf(r.tags)}` : null].filter(Boolean)
    return {
      source: 'hf',
      externalId: `model:${id}`,
      kind: 'model',
      title: titleOf(id),
      url: `${HF}/${id}`,
      publishedAt: dateOrNull(r.createdAt),
      excerpt: excerptOf(parts.join(' · ')),
      metrics: { likes: num(r.likes), downloads: num(r.downloads), createdAt: dayOf(r.createdAt), repoId: id, arxivId: arxivOf(r.tags) },
    }
  })
}

export function toSpaceItems(body: unknown): RadarItemInput[] {
  return rows(body).map((r) => {
    const id = r.id as string
    return {
      source: 'hf',
      externalId: `space:${id}`,
      kind: 'product',
      title: titleOf(id),
      url: `${HF}/spaces/${id}`,
      publishedAt: dateOrNull(r.createdAt),
      excerpt: excerptOf(r.sdk ? `Hugging Face Space (${r.sdk})` : 'Hugging Face Space'),
      metrics: { likes: num(r.likes), createdAt: dayOf(r.createdAt), repoId: id },
    }
  })
}

export function toDatasetItems(body: unknown): RadarItemInput[] {
  return rows(body).map((r) => {
    const id = r.id as string
    return {
      source: 'hf',
      externalId: `dataset:${id}`,
      kind: 'dataset',
      title: titleOf(id),
      url: `${HF}/datasets/${id}`,
      publishedAt: dateOrNull(r.createdAt),
      excerpt: excerptOf(r.description),
      metrics: { likes: num(r.likes), downloads: num(r.downloads), createdAt: dayOf(r.createdAt), repoId: id },
    }
  })
}

interface DailyPaper {
  paper?: {
    id?: string
    title?: string
    summary?: string
    publishedAt?: string
    upvotes?: number
    githubRepo?: string
    projectPage?: string
  }
  title?: string
  summary?: string
  publishedAt?: string
}

function httpsLinks(...urls: Array<string | undefined>): string[] {
  return urls.filter((u): u is string => typeof u === 'string' && /^https:\/\//i.test(u)).slice(0, 3)
}

export function toPaperItems(body: unknown): RadarItemInput[] {
  const list = Array.isArray(body) ? (body as DailyPaper[]) : []
  return list.flatMap((d): RadarItemInput[] => {
    const p = d.paper ?? {}
    const id = arxivIdOf(p.id ?? '')
    const title = titleOf(p.title ?? d.title)
    if (!id || !title) return []
    return [
      {
        source: 'hf_papers',
        externalId: id,
        kind: 'paper',
        title,
        url: `${HF}/papers/${id}`,
        publishedAt: dateOrNull(p.publishedAt ?? d.publishedAt),
        excerpt: excerptOf(p.summary ?? d.summary),
        metrics: { arxivId: id, upvotes: num(p.upvotes), links: httpsLinks(p.githubRepo, p.projectPage) },
      },
    ]
  })
}

function auth(deps: RadarFetchDeps): RequestInit {
  return deps.hfToken ? { headers: { authorization: `Bearer ${deps.hfToken}` } } : {}
}

const trending = (kind: string, limit: number): string =>
  `${HF_API}/${kind}?sort=trendingScore&direction=-1&limit=${limit}`

/** Trending models, Spaces and datasets; one failing list does not lose the others. */
export async function fetchHfHub(deps: RadarFetchDeps = {}): Promise<RadarFetchResult> {
  const lists = [
    { kind: 'models', parse: toModelItems, limit: LIMITS.models },
    { kind: 'spaces', parse: toSpaceItems, limit: LIMITS.spaces },
    { kind: 'datasets', parse: toDatasetItems, limit: LIMITS.datasets },
  ] as const
  const items: RadarItemInput[] = []
  const partialErrors: string[] = []
  for (const l of lists) {
    if (pastDeadline(deps)) break
    try {
      items.push(...l.parse(await requestJson(`hf ${l.kind}`, trending(l.kind, l.limit), deps, auth(deps))))
    } catch (e) {
      partialErrors.push(errorText(e))
    }
  }
  if (items.length === 0 && partialErrors.length > 0) throw new Error(partialErrors[0])
  return { items, partialErrors }
}

export async function fetchHfPapers(deps: RadarFetchDeps = {}): Promise<RadarFetchResult> {
  const body = await requestJson('hf papers', `${HF_API}/daily_papers?limit=${LIMITS.papers}`, deps, auth(deps))
  return { items: toPaperItems(body), partialErrors: [] }
}
