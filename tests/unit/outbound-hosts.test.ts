// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { OUTBOUND_PARTIES, isListedHost } from '@/lib/net/outbound-hosts'
import PrivacyPage from '@/app/(public)/privacy/page'

/**
 * lib/net/outbound-hosts.ts is the one list of third parties lee talks to.
 * 1. The privacy page names every party and every host on it.
 * 2. Every host literal in code that makes network calls is on the list, so
 *    a new outbound host cannot ship without a privacy-page entry.
 */

const ROOT = path.resolve(__dirname, '../..')

/** URL literals in network code that are links or ids, never requested. */
const NOT_CONTACTED = new Set([
  'developers.google.com', // policy link
  'myaccount.google.com', // revoke-access link
  'console.cloud.google.com', // "get a key" links
  'github.com', // "get a token" / repo links
  'developer.adzuna.com',
  'www.firecrawl.dev',
  'neon.com',
  'localhost',
  'console.groq.com',
  'aistudio.google.com',
  'cloud.cerebras.ai',
  'jsonresume.org',
  'news.ycombinator.com', // item links shown to the user
  'www.w3.org', // XML namespaces
  'schema.org',
  'example.com',
  'jobs.lever.co', // posting links parsed, not fetched
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
  'jobs.ashbyhq.com',
  'www.linkedin.com',
  'docs.github.com',
  'help.openai.com',
  // Provider catalog "docs" links.
  'inference-docs.cerebras.ai',
  'ai.google.dev',
  'docs.ollama.com',
  'webllm.mlc.ai',
  // lib/reputation/deep-links.ts: one-click searches the user opens (never fetched).
  'duckduckgo.com',
  'www.glassdoor.com',
  'www.indeed.com',
  'www.reddit.com',
  'app.invest.dubai.ae',
  'u.ae',
  'my.gov.sa',
  'businessmap.moci.gov.qa',
  'en.wikipedia.org', // link shown on the reputation panel
  // Company "Listing" links the user opens (OpenStreetMap element, GLEIF record page); never fetched.
  'www.openstreetmap.org',
  'search.gleif.org',
  'react.dev', // code comment
])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

/** Files that make network calls (fetch, an SDK base URL, a CDN import). */
const NETWORK = /(?<![\w.$])(?:fetch|fetchWithTimeout|discoveryFetch|untrustedDiscoveryFetch|safeFetch|requestText|requestJson|companyJson|companyGet)\s*\(|baseUrl:|import\(\s*[`'"]https:/

function hostsIn(src: string): string[] {
  const out = new Set<string>()
  for (const m of src.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,}|localhost)(?=[/:'"`?\s$]|$)/gi)) {
    out.add((m[1] ?? '').toLowerCase())
  }
  return [...out]
}

describe('outbound hosts registry', () => {
  it('the privacy page names every third party and host', () => {
    const html = renderToStaticMarkup(PrivacyPage())
    const missing = OUTBOUND_PARTIES.flatMap((p) => [
      ...(html.includes(p.name.replace(/&/g, '&amp;')) ? [] : [`party: ${p.name}`]),
      ...p.hosts.filter((h) => !html.includes(h)).map((h) => `host: ${h}`),
    ])
    expect(missing).toEqual([])
  })

  it('every host contacted by network code is in the registry', () => {
    const files = ['lib', 'app', 'components'].flatMap((d) => walk(path.join(ROOT, d)))
    const unlisted = files.flatMap((full) => {
      const src = readFileSync(full, 'utf8')
      if (!NETWORK.test(src)) return []
      const rel = path.relative(ROOT, full).split(path.sep).join('/')
      return hostsIn(src)
        .filter((h) => !NOT_CONTACTED.has(h) && !isListedHost(h))
        .map((h) => `${rel}: ${h}`)
    })
    expect(unlisted, 'add these to lib/net/outbound-hosts.ts (and so the privacy page)').toEqual([])
  })

  it('the provider catalog base URLs are all listed', async () => {
    const { PROVIDERS } = await import('@/lib/lab/providers/catalog')
    const hosts = PROVIDERS.flatMap((p) => (p.baseUrl && p.runsIn === 'server' ? [new URL(p.baseUrl).hostname] : []))
    expect(hosts.filter((h) => !isListedHost(h))).toEqual([])
  })
})
