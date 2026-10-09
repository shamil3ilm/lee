import * as cheerio from 'cheerio'
import { companyJson, type CompanyHttpDeps } from '../http'
import { industriesFromText } from '../industry'
import type { CompanyCandidate } from '../types'

/**
 * QSTP directory (Doha; audited 2026-10-09, docs/job-sources.md): robots.txt
 * allows the endpoint its own page calls and no terms forbid it.
 *
 *   qstp  GET qstp.qa/wp-json/wp/v2/directory?per_page=100 (the WordPress
 *         REST API of Qatar Science & Technology Park's directory)
 *
 * The Kerala parks live in ./technopark.ts and ./kerala-parks.ts; the list
 * of directories read automatically in ./registry.ts. Everything else is a
 * browse link (./browse.ts): its terms forbid automated reading, it sits
 * behind a bot wall, or it has no list.
 */

export { parseTechnoparkCompanies, fetchTechnoparkPage, TECHNOPARK_COMPANIES } from './technopark'

export const QSTP_DIRECTORY = 'https://qstp.qa/wp-json/wp/v2/directory'

interface WpDirectoryEntry {
  title?: { rendered?: unknown }
  content?: { rendered?: unknown }
  link?: unknown
  class_list?: unknown
}

function decode(html: string): string {
  return cheerio.load(`<p>${html}</p>`)('p').text().replace(/\s+/g, ' ').trim()
}

/** QSTP directory entries → candidates in Doha (website from the entry's "Website:" link). */
export function parseQstpDirectory(body: unknown): CompanyCandidate[] {
  const rows = (Array.isArray(body) ? body : []) as WpDirectoryEntry[]
  return rows.flatMap((r): CompanyCandidate[] => {
    const name = typeof r.title?.rendered === 'string' ? decode(r.title.rendered) : ''
    if (!name) return []
    const html = typeof r.content?.rendered === 'string' ? r.content.rendered : ''
    const $ = cheerio.load(html)
    let website: string | undefined
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') ?? ''
      const label = $(el).parent().text()
      if (!website && /^https?:\/\//.test(href) && /website/i.test(label)) website = href.split('?')[0]
    })
    const text = $.root().text().replace(/\s+/g, ' ').trim()
    const sector = /Sector:\s*([^\n]+?)(?:Get in touch|Website:|$)/i.exec(text)?.[1] ?? ''
    const tags = Array.isArray(r.class_list) ? r.class_list.filter((c): c is string => typeof c === 'string' && c.startsWith('tag-')).join(' ') : ''
    return [
      {
        name,
        website,
        regionIds: ['doha'],
        industries: industriesFromText(`${sector} ${tags.replace(/tag-|-/g, ' ')}`),
        sourceTags: ['directory:qstp'],
        evidence: {
          description: text.slice(0, 200),
          ...(typeof r.link === 'string' && r.link.startsWith('https://qstp.qa/') ? { listedAt: r.link } : {}),
        },
      },
    ]
  })
}

export async function fetchQstp(deps: CompanyHttpDeps = {}): Promise<CompanyCandidate[]> {
  return parseQstpDirectory(await companyJson('qstp-directory', `${QSTP_DIRECTORY}?per_page=100`, deps, { maxBytes: 4 * 1024 * 1024 }))
}
