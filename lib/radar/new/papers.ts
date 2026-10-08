import { requestJson } from '@/lib/reputation/http'
import type { RadarFetchDeps } from '../sources/types'
import { HF_API, toPaperItems } from '../sources/hf'
import { tractionScore } from './novelty'
import type { NewFetchResult, NewItemInput } from './types'

/**
 * Papers for "What's new": Hugging Face Daily Papers (public API, curated
 * by the community) ranked by upvotes, at least PAPER_MIN_UPVOTES, the top
 * PAPER_TOP. arXiv submissions are not listed one by one; arXiv papers
 * discussed on Hacker News come from lib/radar/new/hn.ts and cluster with
 * these by arXiv id.
 */

export const PAPER_MIN_UPVOTES = 5
export const PAPER_TOP = 20

export function toNewPaperItems(body: unknown, now: Date): NewItemInput[] {
  return toPaperItems(body)
    .filter((p) => (p.metrics.upvotes ?? 0) >= PAPER_MIN_UPVOTES)
    .sort((a, b) => (b.metrics.upvotes ?? 0) - (a.metrics.upvotes ?? 0))
    .slice(0, PAPER_TOP)
    .map((p) => ({
      ...p,
      source: 'hf_papers' as const,
      category: 'paper' as const,
      openness: null,
      group: null,
      entityKey: `arxiv:${p.metrics.arxivId}`,
      createdAt: p.publishedAt,
      tags: [],
      traction: tractionScore('hf_papers', p.metrics.upvotes, p.publishedAt, now),
    }))
}

export async function fetchPapersNew(deps: RadarFetchDeps = {}): Promise<NewFetchResult> {
  const now = deps.now ?? new Date()
  const init: RequestInit = deps.hfToken ? { headers: { authorization: `Bearer ${deps.hfToken}` } } : {}
  const body = await requestJson('hf papers', `${HF_API}/daily_papers?limit=50`, deps, init)
  return { items: toNewPaperItems(body, now), partialErrors: [] }
}
