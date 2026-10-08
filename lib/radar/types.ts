/**
 * AI Radar vocabulary (docs/ai-radar.md). Client-safe: no I/O.
 */

/** Source groups: one queue job each per user per day. */
export const RADAR_SOURCES = ['hf', 'hf_papers', 'github', 'arxiv', 'hn', 'feeds', 'gdelt'] as const
export type RadarSource = (typeof RADAR_SOURCES)[number]

export const RADAR_SOURCE_LABELS: Readonly<Record<RadarSource, string>> = {
  hf: 'Hugging Face Hub',
  hf_papers: 'HF Daily Papers',
  github: 'GitHub',
  arxiv: 'arXiv',
  hn: 'Hacker News',
  feeds: 'Official blogs',
  gdelt: 'News (GDELT)',
}

/** Sources that search for the user's watch terms (the rest are general feeds). */
export const TERM_SOURCES: ReadonlySet<RadarSource> = new Set(['hn', 'gdelt', 'github'])

export const RADAR_KINDS = ['model', 'product', 'paper', 'repo', 'dataset', 'news'] as const
export type RadarKind = (typeof RADAR_KINDS)[number]

export const RADAR_KIND_LABELS: Readonly<Record<RadarKind, string>> = {
  model: 'Model',
  product: 'Product',
  paper: 'Paper',
  repo: 'Repo',
  dataset: 'Dataset',
  news: 'News',
}

export function isRadarSource(v: unknown): v is RadarSource {
  return typeof v === 'string' && (RADAR_SOURCES as readonly string[]).includes(v)
}

export function isRadarKind(v: unknown): v is RadarKind {
  return typeof v === 'string' && (RADAR_KINDS as readonly string[]).includes(v)
}

/** Small numbers and dates kept with an item (≤ 1 KB as JSON). */
export interface RadarMetrics {
  stars?: number
  likes?: number
  downloads?: number
  points?: number
  comments?: number
  upvotes?: number
  /** Repo / model / Space creation date (yyyy-mm-dd), from the source's metadata. */
  createdAt?: string
  /** arXiv id of a paper (also on HF Daily Papers). */
  arxivId?: string
  /** Official feed id (lib/radar/feeds-catalog.ts) for blog posts. */
  feedId?: string
  /** Up to three related links (a story's target URL, a paper's repo). */
  links?: string[]
  /** Hugging Face repo id ("org/name") or GitHub full name. */
  repoId?: string
}

/** One parsed item, before storage. */
export interface RadarItemInput {
  source: RadarSource
  externalId: string
  kind: RadarKind
  title: string
  url: string
  publishedAt: Date | null
  excerpt: string
  metrics: RadarMetrics
}

/** What one source run did (stored in the job's run summary). */
export interface RadarSourceRun {
  source: RadarSource
  fetched: number
  new: number
  matched: number
  /** Per-request failures that did not stop the run (e.g. one feed 404). */
  partialErrors: string[]
}
