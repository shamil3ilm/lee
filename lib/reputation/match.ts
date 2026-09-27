import { createHash } from 'node:crypto'
import { hostOf, normalizeCompanyName, registrableDomain } from '@/lib/scam/domains'

/**
 * Relevance guards for search results: common company names return noise,
 * so an automatic signal must name the company (word-boundary match on the
 * normalised name) or link to the company's own domain.
 */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Normalised name used in queries and matching ("Acme Inc." → "acme"). */
export function companyQueryName(name: string): string {
  return normalizeCompanyName(name) || name.trim().toLowerCase()
}

export function mentionsCompany(text: string | null | undefined, name: string): boolean {
  if (!text) return false
  const needle = companyQueryName(name)
  if (needle.length < 2) return false
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(needle)}(?![\\p{L}\\p{N}])`, 'iu')
  return re.test(normalizeCompanyName(text))
}

/** True when `url` is on the company's registrable domain. */
export function onCompanyDomain(url: string | null | undefined, domain: string | null | undefined): boolean {
  if (!url || !domain) return false
  const a = hostOf(url)
  const b = hostOf(domain)
  if (!a || !b) return false
  return registrableDomain(a) === registrableDomain(b)
}

/** Stable short citation id for a signal. */
export function signalId(source: string, url: string): string {
  return `${source}-${createHash('sha1').update(`${source}|${url}`).digest('hex').slice(0, 10)}`
}

/** yyyy-mm-dd from an ISO string, epoch seconds or a Date; null when invalid. */
export function isoDay(value: string | number | Date | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

export function truncate(text: string, max = 200): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`
}
