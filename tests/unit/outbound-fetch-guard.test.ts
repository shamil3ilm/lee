import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Every outbound HTTP call is either to a FIXED host (an API whose host is a
 * constant in code: Google, GitHub, an AI provider, a job board's public
 * API) or to a VARIABLE host (a URL or host from a user or a third party).
 * Variable-host calls must go through the SSRF guard (lib/net/safe-fetch.ts:
 * `safeFetch`, or the wrappers built on it: `untrustedDiscoveryFetch`,
 * `fetchPage`).
 *
 * This test fails when:
 *  1. a known variable-host module calls a raw fetch helper, or
 *  2. any server file under lib/ or app/ calls a raw fetch helper and is not
 *     in the reviewed FIXED_HOST list below. Adding a new outbound call means
 *     classifying it here: fixed host → add it with the host; variable host →
 *     use safeFetch instead.
 */

const ROOT = path.resolve(__dirname, '../..')

/** Raw helpers that do NOT check the target. */
const RAW_CALL = /(?<![\w.$])(fetch|fetchWithTimeout|discoveryFetch|requestText|requestJson|fetchOnceWithNetworkRetry)\s*\(/g

/** Modules whose URLs come from users or third parties: guarded fetch only. */
const VARIABLE_HOST_MODULES = [
  'lib/discovery/adapters/rss.ts', // user-entered feed URL
  'lib/discovery/adapters/jsonld.ts', // user-entered careers page URLs
  'lib/discovery/adapters/workday.ts', // user-entered Workday URL
  'lib/discovery/adapters/enterprise.ts', // user-entered ORC / SuccessFactors / Phenom hosts
  'lib/ingest/fetch.ts', // URL import, profile import, Google Alerts feed
  'lib/radar/brief/fetch-source.ts', // links found inside third-party feeds
  'lib/scam/net.ts', // rdap.org redirects to per-TLD registries
  'lib/decisions/laya-http.ts', // user-configurable Laya endpoint
]

/** Reviewed fixed-host callers (host in code, never from input). */
const FIXED_HOST: Record<string, string> = {
  'app/api/voice/transcribe/route.ts': 'api.groq.com',
  'lib/ai/groq.ts': 'api.groq.com',
  'lib/decisions/groq.ts': 'api.groq.com',
  'lib/calendar/adapter.ts': 'www.googleapis.com',
  'lib/drive/client.ts': 'www.googleapis.com (upload location prefix-checked)',
  'lib/gmail/adapter.ts': 'gmail.googleapis.com',
  'lib/gmail/send.ts': 'gmail.googleapis.com',
  'lib/google/tokens.ts': 'oauth2.googleapis.com',
  'lib/companies/ats-detect.ts': 'greenhouse / lever / ashby / workable APIs (slug validated)',
  'lib/compare/fx-fetch.ts': 'api.frankfurter.dev',
  'lib/discovery/adapters/http.ts': 'defines discoveryFetch (fixed-host adapters only)',
  'lib/discovery/adapters/adzuna.ts': 'api.adzuna.com',
  'lib/discovery/adapters/ashby.ts': 'api.ashbyhq.com',
  'lib/discovery/adapters/greenhouse.ts': 'boards-api.greenhouse.io',
  'lib/discovery/adapters/himalayas.ts': 'himalayas.app',
  'lib/discovery/adapters/hn-whoishiring.ts': 'hn.algolia.com, hacker-news.firebaseio.com',
  'lib/discovery/adapters/jobicy.ts': 'jobicy.com',
  'lib/discovery/adapters/kerala-parks.ts': 'Kerala IT park sites (constant)',
  'lib/discovery/adapters/lever.ts': 'api.lever.co',
  'lib/discovery/adapters/pinpoint.ts': '<one-label slug>.pinpointhq.com',
  'lib/discovery/adapters/recruitee.ts': '<one-label slug>.recruitee.com',
  'lib/discovery/adapters/remoteok.ts': 'remoteok.com',
  'lib/discovery/adapters/remotive.ts': 'remotive.com',
  'lib/discovery/adapters/weworkremotely.ts': 'weworkremotely.com',
  'lib/discovery/adapters/workable.ts': 'www.workable.com, apply.workable.com',
  'lib/discovery/adapters/workingnomads.ts': 'www.workingnomads.com',
  'lib/discovery/adapters/yc-directory.ts': 'www.ycombinator.com',
  'lib/discovery/match/jd-fetch.ts': 'boards-api.greenhouse.io, api.lever.co',
  'lib/github/adapter.ts': 'api.github.com',
  'lib/ingest/firecrawl.ts': 'api.firecrawl.dev (the user URL goes in the body)',
  'lib/lab/providers/openai-compatible.ts': 'catalog base URLs (constant)',
  'lib/latex/services/latexonline.ts': 'latexonline.cc',
  'lib/latex/services/ytotech.ts': 'latex.ytotech.com',
  'lib/net/timeout.ts': 'defines fetchWithTimeout',
  'lib/net/safe-fetch.ts': 'defines safeFetch',
  'lib/portfolio/github.ts': 'api.github.com (or GITHUB_API_URL env)',
  'lib/radar/new/github.ts': 'api.github.com',
  'lib/radar/new/hf.ts': 'huggingface.co',
  'lib/radar/new/hn.ts': 'hn.algolia.com',
  'lib/radar/new/papers.ts': 'huggingface.co',
  'lib/radar/new/releases.ts': 'endoflife.date, api.github.com',
  'lib/radar/sources/arxiv.ts': 'export.arxiv.org',
  'lib/radar/sources/feeds.ts': 'official lab feeds (constant catalog)',
  'lib/radar/sources/gdelt.ts': 'api.gdeltproject.org',
  'lib/radar/sources/github.ts': 'api.github.com',
  'lib/radar/sources/hf.ts': 'huggingface.co',
  'lib/radar/sources/hn.ts': 'hn.algolia.com',
  'lib/reputation/http.ts': 'defines requestText/requestJson (fixed-host callers only)',
  'lib/reputation/places.ts': 'places.googleapis.com',
  'lib/reputation/sources/gdelt.ts': 'api.gdeltproject.org',
  'lib/reputation/sources/hn.ts': 'hn.algolia.com',
  'lib/reputation/sources/wikidata.ts': 'www.wikidata.org',
  'lib/settings/secrets.ts': 'key checks: fixed provider hosts; Laya endpoint via safeFetch',
  'lib/usage/neon-api.ts': 'console.neon.tech',
  // Browser code calling this app's own /api routes.
  'lib/errors/client-report.ts': 'same-origin /api',
  'lib/ui/implicit-signals.ts': 'same-origin /api',
  'lib/vitals/client.ts': 'same-origin /api',
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

/** Comments mention "fetch (" in prose; drop them (but not `https://` in strings). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')
}

/** Raw calls, ignoring method declarations like `async fetch(config…)`. */
function rawCalls(raw: string): string[] {
  const src = stripComments(raw)
  const hits: string[] = []
  for (const m of src.matchAll(RAW_CALL)) {
    const before = src.slice(Math.max(0, (m.index ?? 0) - 9), m.index)
    const after = src.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 8)
    if (/(?:async|function)\s+$/.test(before)) continue // declaration
    if (/^\s*(?:config|_config|cfg)\b/.test(after)) continue // adapter `fetch(config` signature
    hits.push(m[1] ?? '')
  }
  return hits
}

const isClient = (src: string) => /^\s*['"]use client['"]/.test(src)

describe('outbound fetch guard', () => {
  it('variable-host modules only use the SSRF-guarded fetch', () => {
    const offenders = VARIABLE_HOST_MODULES.flatMap((rel) => {
      const calls = rawCalls(readFileSync(path.join(ROOT, rel), 'utf8'))
      return calls.length ? [`${rel}: ${calls.join(', ')}`] : []
    })
    expect(offenders).toEqual([])
  })

  it('every server-side raw fetch is a reviewed fixed-host caller', () => {
    const files = [...walk(path.join(ROOT, 'lib')), ...walk(path.join(ROOT, 'app'))]
    const unclassified = files.flatMap((full) => {
      const rel = path.relative(ROOT, full).split(path.sep).join('/')
      const src = readFileSync(full, 'utf8')
      if (isClient(src) || rel in FIXED_HOST || VARIABLE_HOST_MODULES.includes(rel)) return []
      return rawCalls(src).length ? [rel] : []
    })
    expect(unclassified, 'classify these: fixed host → FIXED_HOST, variable host → safeFetch').toEqual([])
  })

  it('the allow-list has no stale entries', () => {
    const stale = Object.keys(FIXED_HOST).filter((rel) => {
      try {
        return rawCalls(readFileSync(path.join(ROOT, rel), 'utf8')).length === 0
      } catch {
        return true
      }
    })
    expect(stale.filter((s) => s !== 'lib/net/safe-fetch.ts')).toEqual([])
  })
})
