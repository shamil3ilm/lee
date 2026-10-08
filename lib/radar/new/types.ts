import type { RadarItemInput, RadarKind, RadarMetrics } from '../types'

/**
 * "What's new" vocabulary (docs/ai-radar.md › What's new). Discovery
 * without watch terms: one shared fetch per source per day for every
 * account, stored once (no user id), ranked per user at read time.
 * Client-safe: no I/O.
 */

/** Shared sources: one global queue job each per day. */
export const NEW_SOURCES = ['hf', 'hf_papers', 'github', 'releases', 'hn', 'feeds'] as const
export type NewSource = (typeof NEW_SOURCES)[number]

export const NEW_SOURCE_LABELS: Readonly<Record<NewSource, string>> = {
  hf: 'Hugging Face Hub',
  hf_papers: 'HF Daily Papers',
  github: 'GitHub',
  releases: 'Releases',
  hn: 'Hacker News',
  feeds: 'Official blogs',
}

export function isNewSource(v: unknown): v is NewSource {
  return typeof v === 'string' && (NEW_SOURCES as readonly string[]).includes(v)
}

export const NEW_CATEGORIES = ['model', 'tool', 'release', 'paper', 'news'] as const
export type NewCategory = (typeof NEW_CATEGORIES)[number]

export const NEW_CATEGORY_LABELS: Readonly<Record<NewCategory, string>> = {
  model: 'Models',
  tool: 'Tools & repos',
  release: 'Releases',
  paper: 'Papers',
  news: 'News',
}

export function isNewCategory(v: unknown): v is NewCategory {
  return typeof v === 'string' && (NEW_CATEGORIES as readonly string[]).includes(v)
}

/** Which category wins when items of several categories cluster into one entry. */
export const CATEGORY_RANK: Readonly<Record<NewCategory, number>> = { model: 0, release: 1, paper: 2, tool: 3, news: 4 }

export type Openness = 'open' | 'proprietary'

/** Model groups (from the Hub's pipeline tag) and tool groups. */
export const MODEL_GROUPS = ['llm', 'multimodal', 'vision', 'speech', 'embedding', 'code', 'other'] as const
export type ModelGroup = (typeof MODEL_GROUPS)[number]

export const GROUP_LABELS: Readonly<Record<string, string>> = {
  llm: 'LLM',
  multimodal: 'Multimodal',
  vision: 'Vision',
  speech: 'Speech',
  embedding: 'Embedding',
  code: 'Code',
  other: 'Other model',
  repo: 'Repo',
  space: 'Space',
  dataset: 'Dataset',
  product: 'Product',
  launch: 'Launch',
  show: 'Show HN',
}

export function isModelGroup(v: unknown): v is ModelGroup {
  return typeof v === 'string' && (MODEL_GROUPS as readonly string[]).includes(v)
}

/** Extra facts a "what's new" item carries (stored in metrics, ≤ 1 KB). */
export interface NewMetrics extends RadarMetrics {
  /** Hub trending score. */
  trending?: number
  license?: string
  /** Parameter count (from the safetensors metadata). */
  params?: number
  /** Base model id ("org/name") and how this one derives from it. */
  baseModel?: string
  baseRelation?: string
  /** Release version ("13", "16.4") and end-of-life facts (yyyy-mm-dd). */
  version?: string
  latest?: string
  eol?: string
  /** Programming language (GitHub). */
  language?: string
}

/** A parsed "what's new" item, before the shared store. */
export interface NewItemInput extends Omit<RadarItemInput, 'source' | 'metrics'> {
  source: NewSource
  metrics: NewMetrics
  /** Display name of the entry it starts (default: the repo/model name or the title). */
  name?: string
  category: NewCategory
  openness: Openness | null
  /** Model group, or the tool/news kind (repo, space, dataset, product, launch, show). */
  group: string | null
  /** Novelty identity: the same entity seen again is never "new" again. */
  entityKey: string
  /** When the thing itself was created (repo/model creation, release, paper, post); null when unknown. */
  createdAt: Date | null
  /** Lower-case topic tokens for personal relevance (topics, pipeline, language, project). */
  tags: string[]
  /** 0..1 within its source, for the per-source daily cap (higher first). */
  traction: number
}

export interface NewFetchResult {
  items: NewItemInput[]
  partialErrors: string[]
}

export const KIND_OF_CATEGORY: Readonly<Record<NewCategory, RadarKind>> = {
  model: 'model',
  tool: 'repo',
  release: 'product',
  paper: 'paper',
  news: 'news',
}
