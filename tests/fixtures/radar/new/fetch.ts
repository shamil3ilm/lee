import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Route } from '../../reputation/fetch'

/** A JSON fixture in this folder (synthetic names only). */
export function newJson<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(path.join(__dirname, name), 'utf8')) as T
}

type Hf = { models: unknown; spaces: unknown; datasets: unknown }
type Releases = { eol: unknown; github: unknown }
type Hn = { show: unknown; arxiv: unknown }

/** Offline answers for every "what's new" source. */
export function newRoutes(): Route[] {
  const hf = newJson<Hf>('hf.json')
  const rel = newJson<Releases>('releases.json')
  const hn = newJson<Hn>('hn.json')
  return [
    { match: (u) => u.host === 'huggingface.co' && u.pathname === '/api/models', body: hf.models },
    { match: (u) => u.host === 'huggingface.co' && u.pathname === '/api/spaces', body: hf.spaces },
    { match: (u) => u.host === 'huggingface.co' && u.pathname === '/api/datasets', body: hf.datasets },
    {
      match: (u) => u.host === 'huggingface.co' && u.pathname === '/api/daily_papers',
      body: [
        { paper: { id: '2610.00001', title: 'Context Zorbs', summary: 'We study zorbs.', publishedAt: '2026-10-03T00:00:00Z', upvotes: 40, githubRepo: 'https://github.com/acme-lab/zorb' } },
        { paper: { id: '2610.00009', title: 'A quiet paper', summary: 'Few votes.', publishedAt: '2026-10-03T00:00:00Z', upvotes: 1 } },
      ],
    },
    { match: (u) => u.host === 'api.github.com' && u.pathname === '/search/repositories', body: newJson('github.json') },
    { match: (u) => u.host === 'api.github.com' && u.pathname.endsWith('/releases'), body: rel.github },
    { match: (u) => u.host === 'endoflife.date', body: rel.eol },
    { match: (u) => u.host === 'hn.algolia.com' && (u.searchParams.get('tags') ?? '').includes('show_hn'), body: hn.show },
    { match: (u) => u.host === 'hn.algolia.com' && u.searchParams.get('query') === 'arxiv.org', body: hn.arxiv },
  ]
}
