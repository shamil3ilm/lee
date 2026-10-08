import { feedById } from '../feeds-catalog'
import type { RadarMetrics } from '../types'
import type { TimelineEvent } from './types'

/**
 * The brief's timeline, computed ONLY from source metadata (repo creation,
 * model card date, arXiv submission, announcement and first-seen dates),
 * never from model output — so "which came first" is never a guess. One
 * event per kind of fact (the earliest), oldest first. Pure.
 */

export interface TimelineItem {
  source: string
  kind: string
  url: string
  publishedAt: Date | null
  fetchedAt: Date
  metrics: RadarMetrics
}

function day(d: Date | null | undefined): string | null {
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null
}

const HF_LABEL: Readonly<Record<string, string>> = {
  model: 'Hugging Face model created',
  product: 'Hugging Face Space created',
  dataset: 'Hugging Face dataset created',
}

function eventOf(item: TimelineItem): TimelineEvent | null {
  const published = day(item.publishedAt)
  const created = item.metrics.createdAt && /^\d{4}-\d{2}-\d{2}$/.test(item.metrics.createdAt) ? item.metrics.createdAt : null
  switch (item.source) {
    case 'github':
      return created ? { date: created, label: `Repository created${item.metrics.repoId ? ` (${item.metrics.repoId})` : ''}`, url: item.url } : null
    case 'hf':
      return created ? { date: created, label: HF_LABEL[item.kind] ?? 'Hugging Face repo created', url: item.url } : null
    case 'arxiv':
      return published ? { date: published, label: 'Paper submitted to arXiv', url: item.url } : null
    case 'hf_papers':
      return published ? { date: published, label: 'Paper on Hugging Face Daily Papers', url: item.url } : null
    case 'feeds': {
      const feed = feedById(item.metrics.feedId)
      return published ? { date: published, label: `Announced on ${feed?.label ?? 'an official blog'}`, url: item.url } : null
    }
    case 'releases':
      return published ? { date: published, label: `Released${item.metrics.version ? ` (${item.metrics.version})` : ''}`, url: item.url } : null
    case 'hn':
      return { date: published ?? (day(item.fetchedAt) as string), label: 'First Hacker News story', url: item.url }
    case 'gdelt':
      return { date: published ?? (day(item.fetchedAt) as string), label: 'First news report', url: item.url }
    default:
      return null
  }
}

export function computeTimeline(items: readonly TimelineItem[]): TimelineEvent[] {
  const earliest = new Map<string, TimelineEvent>()
  for (const item of items) {
    const e = eventOf(item)
    if (!e) continue
    const prev = earliest.get(e.label)
    if (!prev || e.date < prev.date) earliest.set(e.label, e)
  }
  return [...earliest.values()].sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label))
}
