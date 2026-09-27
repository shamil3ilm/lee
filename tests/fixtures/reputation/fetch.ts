import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Load a JSON fixture from this folder. */
export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(__dirname, name), 'utf8'))
}

export interface Route {
  match: (url: URL, init?: RequestInit) => boolean
  status?: number
  body: unknown
}

/**
 * A fetch that answers from fixtures — no network. Unmatched URLs fail the
 * test loudly. `calls` records every URL requested, in order.
 */
export function fixtureFetch(routes: readonly Route[]): typeof fetch & { calls: string[]; agents: string[] } {
  const calls: string[] = []
  const agents: string[] = []
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push(href)
    agents.push(new Headers(init?.headers).get('user-agent') ?? '')
    const url = new URL(href)
    const route = routes.find((r) => r.match(url, init))
    if (!route) throw new Error(`unexpected request in test: ${href}`)
    const text = typeof route.body === 'string' ? route.body : JSON.stringify(route.body)
    return new Response(text, { status: route.status ?? 200, headers: { 'content-type': 'application/json' } })
  }
  return Object.assign(impl as typeof fetch, { calls, agents })
}

/** Routes for every automatic source, answering with the Acme fixtures. */
export function allSourceRoutes(): Route[] {
  return [
    { match: (u) => u.host === 'hn.algolia.com' && u.pathname.endsWith('/search'), body: fixture('hn-stories.json') },
    {
      match: (u) => u.host === 'hn.algolia.com' && u.pathname.endsWith('/search_by_date'),
      body: fixture('hn-comments.json'),
    },
    { match: (u) => u.host === 'api.gdeltproject.org', body: fixture('gdelt.json') },
    {
      match: (u) => u.host === 'www.wikidata.org' && u.searchParams.get('action') === 'wbsearchentities',
      body: fixture('wikidata-search.json'),
    },
    {
      match: (u) => u.host === 'www.wikidata.org' && u.searchParams.get('props') === 'labels',
      body: fixture('wikidata-labels.json'),
    },
    {
      match: (u) => u.host === 'www.wikidata.org' && u.searchParams.get('action') === 'wbgetentities',
      body: fixture('wikidata-entities.json'),
    },
  ]
}
