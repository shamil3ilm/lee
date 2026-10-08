import { errorText, requestJson } from '@/lib/reputation/http'
import { pastDeadline, type RadarFetchDeps } from '../sources/types'
import { arxivIdOf, dateOrNull, dayOf, excerptOf, titleOf } from '../text'
import { ageDays, tractionScore } from './novelty'
import { isSpam } from './spam'
import type { ModelGroup, NewFetchResult, NewItemInput } from './types'

/**
 * New on the Hugging Face Hub (public API, no key; 500 requests per 5
 * minutes per IP). The trending lists (one request each for models,
 * Spaces and datasets) filtered to repos CREATED in the last
 * HF_WINDOW_DAYS, with early traction: likes per day since creation.
 * Licence, parameter count and base model come from the listing's own
 * metadata (tags and safetensors), never from the model card text.
 */

export const HF_API = 'https://huggingface.co/api'
const HF = 'https://huggingface.co'
export const HF_WINDOW_DAYS = 14
const LIST = { models: 100, spaces: 50, datasets: 50 } as const
export const HF_MIN_LIKES = { model: 20, space: 20, dataset: 10 } as const

interface HubRow {
  id?: string
  likes?: number
  downloads?: number
  trendingScore?: number
  createdAt?: string
  tags?: unknown
  pipeline_tag?: string
  library_name?: string
  sdk?: string
  safetensors?: { total?: number }
}

function rows(body: unknown): HubRow[] {
  return Array.isArray(body) ? (body as HubRow[]).filter((r) => typeof r?.id === 'string' && /^[\w.-]+\/[\w.-]+$/.test(r.id)) : []
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function tagList(tags: unknown): string[] {
  return Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : []
}

function prefixed(tags: readonly string[], prefix: string): string | undefined {
  return tags.find((t) => t.startsWith(prefix))?.slice(prefix.length)
}

/** `base_model:<relation>:<org/name>` — the first one with a relation. */
export function baseModelOf(tags: readonly string[]): { id: string; relation: string } | null {
  for (const t of tags) {
    const m = /^base_model:(adapter|finetune|quantized|merge):([\w.-]+\/[\w.-]+)$/.exec(t)
    if (m) return { relation: m[1] as string, id: m[2] as string }
  }
  return null
}

const GROUP_BY_PIPELINE: ReadonlyArray<[ModelGroup, readonly string[]]> = [
  ['llm', ['text-generation', 'text2text-generation', 'question-answering', 'conversational', 'summarization', 'translation']],
  ['multimodal', ['image-text-to-text', 'any-to-any', 'visual-question-answering', 'video-text-to-text', 'audio-text-to-text', 'image-text-to-image', 'document-question-answering']],
  ['vision', ['text-to-image', 'image-to-image', 'image-to-video', 'text-to-video', 'video-to-video', 'image-classification', 'object-detection', 'image-segmentation', 'mask-generation', 'image-to-text', 'image-feature-extraction', 'depth-estimation', 'unconditional-image-generation', 'image-to-3d', 'text-to-3d', 'zero-shot-image-classification', 'keypoint-detection']],
  ['speech', ['automatic-speech-recognition', 'text-to-speech', 'text-to-audio', 'audio-to-audio', 'voice-activity-detection', 'audio-classification']],
  ['embedding', ['feature-extraction', 'sentence-similarity', 'text-ranking']],
]

export function modelGroup(pipeline: string | undefined, id: string, tags: readonly string[]): ModelGroup {
  const isCode = /(?:^|[-_/])(?:code|coder|codegen|starcoder)(?:[-_.]|\d|$)/i.test(id) || tags.includes('code')
  const group = GROUP_BY_PIPELINE.find(([, list]) => pipeline && list.includes(pipeline))?.[0] ?? 'other'
  return isCode && (group === 'llm' || group === 'other') ? 'code' : group
}

/** 27_781_427_952 → "27.8B". */
export function formatParams(n: number | undefined): string | null {
  if (!n || n <= 0) return null
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${Math.round(n / 1e6)}M`
  return `${Math.round(n / 1e3)}K`
}

const GROUP_WORD: Readonly<Record<ModelGroup, string>> = {
  llm: 'LLM',
  multimodal: 'Multimodal model',
  vision: 'Vision model',
  speech: 'Speech model',
  embedding: 'Embedding model',
  code: 'Code model',
  other: 'Model',
}

function recent(created: Date | null, now: Date): boolean {
  return created !== null && ageDays(created, now) <= HF_WINDOW_DAYS && created.getTime() <= now.getTime() + 86_400_000
}

export function toNewModelItems(body: unknown, now: Date): NewItemInput[] {
  return rows(body).flatMap((r): NewItemInput[] => {
    const id = r.id as string
    const tags = tagList(r.tags)
    const created = dateOrNull(r.createdAt)
    const likes = num(r.likes) ?? 0
    if (!recent(created, now) || likes < HF_MIN_LIKES.model || isSpam(id, tags)) return []
    const group = modelGroup(r.pipeline_tag, id, tags)
    const license = prefixed(tags, 'license:')
    const params = num(r.safetensors?.total)
    const base = baseModelOf(tags)
    const parts = [
      GROUP_WORD[group],
      r.pipeline_tag,
      formatParams(params) ? `${formatParams(params)} params` : null,
      license ? `license ${license}` : null,
      base ? `${base.relation} of ${base.id}` : null,
    ].filter(Boolean)
    const arxiv = prefixed(tags, 'arxiv:')
    return [
      {
        source: 'hf',
        externalId: `model:${id}`,
        kind: 'model',
        title: titleOf(id),
        url: `${HF}/${id}`,
        publishedAt: created,
        excerpt: excerptOf(parts.join(' · ')),
        category: 'model',
        openness: 'open',
        group,
        entityKey: `hf:model:${id.toLowerCase()}`,
        createdAt: created,
        tags: [group, r.pipeline_tag, r.library_name].filter((t): t is string => !!t).map((t) => t.toLowerCase()),
        traction: tractionScore('hf', likes, created, now),
        metrics: {
          likes,
          downloads: num(r.downloads),
          trending: num(r.trendingScore),
          createdAt: dayOf(r.createdAt),
          repoId: id,
          arxivId: arxiv ? (arxivIdOf(`arxiv:${arxiv}`) ?? undefined) : undefined,
          license,
          params,
          baseModel: base?.id,
          baseRelation: base?.relation,
        },
      },
    ]
  })
}

export function toNewSpaceItems(body: unknown, now: Date): NewItemInput[] {
  return rows(body).flatMap((r): NewItemInput[] => {
    const id = r.id as string
    const tags = tagList(r.tags)
    const created = dateOrNull(r.createdAt)
    const likes = num(r.likes) ?? 0
    if (!recent(created, now) || likes < HF_MIN_LIKES.space || isSpam(id, tags)) return []
    const topics = tags.filter((t) => !t.includes(':') && t !== r.sdk).slice(0, 5)
    return [
      {
        source: 'hf',
        externalId: `space:${id}`,
        kind: 'product',
        title: titleOf(id),
        url: `${HF}/spaces/${id}`,
        publishedAt: created,
        excerpt: excerptOf([`Hugging Face Space${r.sdk ? ` (${r.sdk})` : ''}`, topics.join(', ')].filter(Boolean).join(' · ')),
        category: 'tool',
        openness: 'open',
        group: 'space',
        entityKey: `hf:space:${id.toLowerCase()}`,
        createdAt: created,
        tags: topics.map((t) => t.toLowerCase()),
        traction: tractionScore('hf', likes, created, now) * 0.8,
        metrics: { likes, trending: num(r.trendingScore), createdAt: dayOf(r.createdAt), repoId: id },
      },
    ]
  })
}

export function toNewDatasetItems(body: unknown, now: Date): NewItemInput[] {
  return rows(body).flatMap((r): NewItemInput[] => {
    const id = r.id as string
    const tags = tagList(r.tags)
    const created = dateOrNull(r.createdAt)
    const likes = num(r.likes) ?? 0
    if (!recent(created, now) || likes < HF_MIN_LIKES.dataset || isSpam(id, tags)) return []
    const license = prefixed(tags, 'license:')
    const modality = tags.filter((t) => t.startsWith('modality:')).map((t) => t.slice(9))
    const size = prefixed(tags, 'size_categories:')
    // The dataset card's free text can carry contact details: only metadata tags are kept.
    const parts = ['Hugging Face dataset', modality.join('/'), size ? `size ${size}` : null, license ? `license ${license}` : null].filter(Boolean)
    return [
      {
        source: 'hf',
        externalId: `dataset:${id}`,
        kind: 'dataset',
        title: titleOf(id),
        url: `${HF}/datasets/${id}`,
        publishedAt: created,
        excerpt: excerptOf(parts.join(' · ')),
        category: 'tool',
        openness: 'open',
        group: 'dataset',
        entityKey: `hf:dataset:${id.toLowerCase()}`,
        createdAt: created,
        tags: modality,
        traction: tractionScore('hf', likes, created, now) * 0.6,
        metrics: { likes, downloads: num(r.downloads), trending: num(r.trendingScore), createdAt: dayOf(r.createdAt), repoId: id, license },
      },
    ]
  })
}

const EXPAND: Readonly<Record<'models' | 'spaces' | 'datasets', readonly string[]>> = {
  models: ['createdAt', 'likes', 'downloads', 'pipeline_tag', 'library_name', 'tags', 'trendingScore', 'safetensors'],
  spaces: ['createdAt', 'likes', 'sdk', 'tags', 'trendingScore'],
  datasets: ['createdAt', 'likes', 'downloads', 'tags', 'trendingScore'],
}

export function hfListUrl(kind: 'models' | 'spaces' | 'datasets'): string {
  const params = new URLSearchParams({ sort: 'trendingScore', direction: '-1', limit: String(LIST[kind]) })
  for (const e of EXPAND[kind]) params.append('expand[]', e)
  return `${HF_API}/${kind}?${params.toString()}`
}

export async function fetchHfNew(deps: RadarFetchDeps = {}): Promise<NewFetchResult> {
  const now = deps.now ?? new Date()
  const init: RequestInit = deps.hfToken ? { headers: { authorization: `Bearer ${deps.hfToken}` } } : {}
  const lists = [
    { kind: 'models', parse: toNewModelItems },
    { kind: 'spaces', parse: toNewSpaceItems },
    { kind: 'datasets', parse: toNewDatasetItems },
  ] as const
  const items: NewItemInput[] = []
  const partialErrors: string[] = []
  for (const l of lists) {
    if (pastDeadline(deps)) break
    try {
      items.push(...l.parse(await requestJson(`hf ${l.kind}`, hfListUrl(l.kind), deps, init), now))
    } catch (e) {
      partialErrors.push(errorText(e))
    }
  }
  if (items.length === 0 && partialErrors.length > 0) throw new Error(partialErrors[0])
  return { items, partialErrors }
}
