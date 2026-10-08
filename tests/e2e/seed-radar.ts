/**
 * AI Radar demo data for the e2e seed (synthetic names only): an entry
 * clustered from an official post, its repo and an HN story — enough
 * primary sources for a brief — plus unrelated entries, and two source
 * run records for Radar › Sources. No watch terms: the journey adds one.
 * Imported by tests/e2e/seed.ts after the database env is set.
 */
import { db } from '@/lib/db/client'
import * as s from '@/lib/db/schema'
import { ingestItems } from '@/lib/radar/ingest'
import type { RadarItemInput } from '@/lib/radar/types'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { seedWhatsNew } from './seed-radar-new'

export const RADAR_E2E_TERM = 'Zorblax'

const DAY = 86_400_000

function items(now: number): RadarItemInput[] {
  const at = (days: number): Date => new Date(now - days * DAY)
  return [
    {
      source: 'feeds',
      externalId: 'openai:e2e-zorblax',
      kind: 'product',
      title: 'Introducing Zorblax',
      url: 'https://openai.com/index/introducing-zorblax/',
      publishedAt: at(3),
      excerpt: 'Zorblax is a compact decision model that returns calibrated probabilities for structured choices.',
      metrics: { feedId: 'openai', links: ['https://github.com/acme-lab/zorblax'] },
    },
    {
      source: 'github',
      externalId: 'e2e-101',
      kind: 'repo',
      title: 'acme-lab/zorblax',
      url: 'https://github.com/acme-lab/zorblax',
      publishedAt: at(2),
      excerpt: 'Zorblax inference server that runs on a laptop and exposes one HTTP endpoint. — Topics: llm, inference',
      metrics: { stars: 321, createdAt: new Date(now - 2 * DAY).toISOString().slice(0, 10), repoId: 'acme-lab/zorblax' },
    },
    {
      source: 'hn',
      externalId: 'e2e-9001',
      kind: 'news',
      title: 'Show HN: Zorblax runs on a laptop',
      url: 'https://news.ycombinator.com/item?id=9001',
      publishedAt: at(1),
      excerpt: '',
      metrics: { points: 42, comments: 7, links: ['https://github.com/acme-lab/zorblax'] },
    },
    {
      source: 'arxiv',
      externalId: '2601.00002',
      kind: 'paper',
      title: 'Calibrated choices for small decision models',
      url: 'https://arxiv.org/abs/2601.00002',
      publishedAt: at(2),
      excerpt: 'We study calibration of compact models that pick one option from a list.',
      metrics: { arxivId: '2601.00002' },
    },
    {
      source: 'hf',
      externalId: 'model:example-org/Tiny-Classifier-1B',
      kind: 'model',
      title: 'example-org/Tiny-Classifier-1B',
      url: 'https://huggingface.co/example-org/Tiny-Classifier-1B',
      publishedAt: at(4),
      excerpt: 'text-classification · transformers · license apache-2.0',
      metrics: { likes: 120, downloads: 4500, createdAt: new Date(now - 4 * DAY).toISOString().slice(0, 10), repoId: 'example-org/Tiny-Classifier-1B' },
    },
  ]
}

export async function seedRadar(userId: string, now: number): Promise<void> {
  await ingestItems(userId, items(now), [], new Date(now - 60 * 60 * 1000))
  const run = (source: string, fetched: number, created: number) => ({
    userId,
    type: JOB_TYPES.radarSource,
    status: 'done',
    payload: { source, trigger: 'daily' },
    finishedAt: new Date(now - 60 * 60 * 1000),
    result: { summary: { kind: 'radar-source', source, status: 'polled', fetched, new: created, matched: 0 } },
  })
  await db.insert(s.queueJobs).values([run('hf', 40, 12), run('feeds', 31, 9)])
  await seedWhatsNew(now)
}
