import { resolveLocation } from '@/lib/regions/normalize'
import { industriesFromText } from '../industry'
import { domainOf } from '../normalize'
import type { CompanyCandidate } from '../types'

/**
 * "Add companies from text": the user pastes an AI Mode answer, a list or
 * links; each line with a company name and/or its website becomes a
 * candidate. Nothing is fetched here (enrichment reads the site later, after
 * a robots.txt check). Google redirect wrappers are unwrapped offline.
 * Pure, client-safe.
 */

export const MAX_PASTE_CHARS = 20_000
export const MAX_PASTE_COMPANIES = 40

const URL_RE = /\bhttps?:\/\/[^\s<>()"'\]]+|\b(?:www\.)[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s<>()"'\]]*/gi
const BULLET = /^\s*(?:[-*•·]|\d{1,3}[.)])\s*/
const SPLIT = /\s+[-–—:|]\s+|:\s/

function unwrapGoogle(url: string): string {
  try {
    const u = new URL(url)
    if (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname === '/url') return u.searchParams.get('q') ?? u.searchParams.get('url') ?? url
  } catch {
    // keep as written
  }
  return url
}

function cleanName(s: string): string {
  return s
    .replace(/\*\*|__|`/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:]+$/, '')
}

/** A name-ish head: 2–60 chars, not a sentence. */
function plausibleName(s: string): boolean {
  return s.length >= 2 && s.length <= 60 && s.split(' ').length <= 6 && !/^(https?:|www\.)/i.test(s)
}

export function parsePastedCompanies(text: string): CompanyCandidate[] {
  const lines = text.slice(0, MAX_PASTE_CHARS).split(/\r?\n/)
  const out: CompanyCandidate[] = []
  for (const line of lines) {
    const body = line.replace(BULLET, '').trim()
    if (!body) continue
    const urls = [...body.matchAll(URL_RE)].map((m) => unwrapGoogle(m[0].replace(/[.,;:]+$/, '')))
    const site = urls.map((u) => ({ u, d: domainOf(u) })).find((x) => x.d)
    const withoutUrls = body.replace(URL_RE, ' ').trim()
    const [head = '', ...rest] = withoutUrls.split(SPLIT)
    let name = cleanName(head)
    if (!plausibleName(name)) name = site?.d ? site.d.split('.')[0]! : ''
    if (!name || (!site && rest.length === 0 && !/[A-Z]/.test(name))) continue
    const tail = rest.join(' ')
    out.push({
      name: name.length <= 3 && site?.d ? site.d.split('.')[0]! : name,
      website: site ? `https://${site.d}` : undefined,
      regionIds: resolveLocation(tail || body).places.map((p) => p.id),
      industries: industriesFromText(tail),
      sourceTags: ['paste'],
      evidence: tail ? { description: cleanName(tail).slice(0, 200) } : {},
    })
    if (out.length >= MAX_PASTE_COMPANIES) break
  }
  return out
}
