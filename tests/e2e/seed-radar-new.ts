/**
 * "What's new" demo data for the e2e seed (synthetic names only): one
 * entry per category through the real shared store, an open model with a
 * folded variant, and a repo also posted as a Show HN (two sources).
 */
import { storeNewItems } from '@/lib/radar/new/store'
import type { NewItemInput } from '@/lib/radar/new/types'

export const WHATS_NEW_E2E_WATCH = 'quillfeather'

const DAY = 86_400_000

function base(now: number, over: Partial<NewItemInput> & Pick<NewItemInput, 'source' | 'externalId' | 'title' | 'url' | 'entityKey'>): NewItemInput {
  const created = new Date(now - 2 * DAY)
  return {
    kind: 'repo',
    publishedAt: created,
    excerpt: '',
    category: 'tool',
    openness: null,
    group: null,
    createdAt: created,
    tags: [],
    traction: 0.5,
    metrics: {},
    ...over,
  }
}

export async function seedWhatsNew(now: number): Promise<void> {
  const at = new Date(now - 60 * 60 * 1000)
  const day = (d: number): string => new Date(now - d * DAY).toISOString().slice(0, 10)
  await storeNewItems(
    'hf',
    [
      base(now, {
        source: 'hf',
        externalId: 'model:example-org/Glimmer-12B',
        kind: 'model',
        title: 'example-org/Glimmer-12B',
        url: 'https://huggingface.co/example-org/Glimmer-12B',
        entityKey: 'hf:model:example-org/glimmer-12b',
        category: 'model',
        openness: 'open',
        group: 'llm',
        excerpt: 'LLM · text-generation · 12.0B params · license apache-2.0',
        tags: ['llm', 'text-generation'],
        traction: 0.8,
        metrics: { likes: 240, repoId: 'example-org/Glimmer-12B', license: 'apache-2.0', params: 12_000_000_000, createdAt: day(2) },
      }),
      base(now, {
        source: 'hf',
        externalId: 'model:quant-folk/Glimmer-12B-GGUF',
        kind: 'model',
        title: 'quant-folk/Glimmer-12B-GGUF',
        url: 'https://huggingface.co/quant-folk/Glimmer-12B-GGUF',
        entityKey: 'hf:model:quant-folk/glimmer-12b-gguf',
        category: 'model',
        openness: 'open',
        group: 'llm',
        metrics: { likes: 30, repoId: 'quant-folk/Glimmer-12B-GGUF', baseModel: 'example-org/Glimmer-12B', baseRelation: 'quantized' },
      }),
    ],
    at,
  )
  await storeNewItems(
    'github',
    [
      base(now, {
        source: 'github',
        externalId: 'e2e-new-1',
        title: 'inkwell-labs/quillfeather',
        url: 'https://github.com/inkwell-labs/quillfeather',
        entityKey: 'gh:inkwell-labs/quillfeather',
        group: 'repo',
        openness: 'open',
        excerpt: 'Quillfeather turns Markdown notes into a searchable local wiki — Topics: notes, search — TypeScript',
        tags: ['notes', 'search', 'typescript'],
        metrics: { stars: 420, repoId: 'inkwell-labs/quillfeather', license: 'MIT', language: 'TypeScript', createdAt: day(2) },
      }),
    ],
    at,
  )
  await storeNewItems(
    'hn',
    [
      base(now, {
        source: 'hn',
        externalId: 'e2e-new-9002',
        kind: 'news',
        title: 'Show HN: Quillfeather – a local wiki from your notes',
        name: 'Quillfeather',
        url: 'https://news.ycombinator.com/item?id=9002',
        entityKey: 'hn:e2e-new-9002',
        category: 'news',
        group: 'show',
        excerpt: 'Show HN · 150 points · 40 comments',
        metrics: { points: 150, comments: 40, links: ['https://github.com/inkwell-labs/quillfeather'] },
      }),
      base(now, {
        source: 'hn',
        externalId: 'e2e-new-9003',
        kind: 'news',
        title: 'Launch HN: Tallyhop (YC F26) – Invoices that reconcile themselves',
        name: 'Tallyhop',
        url: 'https://news.ycombinator.com/item?id=9003',
        entityKey: 'hn:e2e-new-9003',
        category: 'news',
        group: 'launch',
        excerpt: 'Launch HN · 80 points · 22 comments',
        metrics: { points: 80, comments: 22, links: ['https://tallyhop.example.com/'] },
      }),
    ],
    at,
  )
  await storeNewItems(
    'releases',
    [
      base(now, {
        source: 'releases',
        externalId: 'eol:examplefw@5',
        kind: 'product',
        title: 'ExampleFW 5',
        url: 'https://endoflife.date/examplefw',
        entityKey: 'release:examplefw@5',
        category: 'release',
        group: 'release',
        excerpt: 'New ExampleFW release cycle · latest 5.0.2 · security support until Oct 1, 2028',
        metrics: { version: '5', latest: '5.0.2', eol: '2028-10-01', createdAt: day(5) },
      }),
    ],
    at,
  )
  await storeNewItems(
    'hf_papers',
    [
      base(now, {
        source: 'hf_papers',
        externalId: '2610.09999',
        kind: 'paper',
        title: 'Sparse notes make dense wikis',
        url: 'https://huggingface.co/papers/2610.09999',
        entityKey: 'arxiv:2610.09999',
        category: 'paper',
        excerpt: 'We study note-taking corpora.',
        metrics: { arxivId: '2610.09999', upvotes: 33 },
      }),
    ],
    at,
  )
}
