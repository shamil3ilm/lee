import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Route } from '../reputation/fetch'

/** Raw text of a fixture in this folder. */
export function radarText(name: string): string {
  return readFileSync(path.join(__dirname, name), 'utf8')
}

/** A JSON fixture in this folder. */
export function radarJson<T = unknown>(name: string): T {
  return JSON.parse(radarText(name)) as T
}

const misc = (): { spaces: unknown; datasets: unknown; papers: unknown } => radarJson('hf-misc.json')
const news = (): { hn: unknown; gdelt: unknown } => radarJson('news.json')

/** Offline answers for every radar source (synthetic data only). */
export function radarRoutes(): Route[] {
  return [
    { match: (u) => u.host === 'huggingface.co' && u.pathname === '/api/models', body: radarJson('hf-models.json') },
    { match: (u) => u.host === 'huggingface.co' && u.pathname === '/api/spaces', body: misc().spaces },
    { match: (u) => u.host === 'huggingface.co' && u.pathname === '/api/datasets', body: misc().datasets },
    { match: (u) => u.host === 'huggingface.co' && u.pathname === '/api/daily_papers', body: misc().papers },
    { match: (u) => u.host === 'api.github.com', body: radarJson('github-search.json') },
    { match: (u) => u.host === 'export.arxiv.org', body: radarText('arxiv.xml') },
    { match: (u) => u.host === 'hn.algolia.com', body: news().hn },
    { match: (u) => u.host === 'api.gdeltproject.org', body: news().gdelt },
  ]
}

export interface TextRoute {
  match: (url: URL) => boolean
  status?: number
  body: string
  contentType?: string
}

/** A fetch answering text pages (HTML, Markdown, robots.txt) — no network. */
export function textFetch(routes: readonly TextRoute[]): typeof fetch & { calls: string[] } {
  const calls: string[] = []
  const impl = async (input: string | URL | Request): Promise<Response> => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push(href)
    const route = routes.find((r) => r.match(new URL(href)))
    if (!route) throw new Error(`unexpected request in test: ${href}`)
    return new Response(route.body, { status: route.status ?? 200, headers: { 'content-type': route.contentType ?? 'text/plain' } })
  }
  return Object.assign(impl as typeof fetch, { calls })
}
