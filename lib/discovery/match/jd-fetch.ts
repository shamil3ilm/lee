import { discoveryFetch } from '../adapters/http'

/**
 * Fetch a posting's full JD from an ATS's PUBLIC job API, for postings that
 * arrived without one (email alerts, watch links). Only documented public
 * endpoints the discovery adapters already use: Greenhouse's Job Board API
 * and Lever's Postings API. Anything else returns null and the card offers
 * "Paste the JD" instead. User-initiated, one request.
 */

export interface JdTarget {
  kind: 'greenhouse' | 'lever'
  api: string
}

const GREENHOUSE = /^https?:\/\/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/([a-z0-9_-]+)\/jobs\/(\d+)/i
const LEVER = /^https?:\/\/jobs\.(?:eu\.)?lever\.co\/([a-z0-9_.-]+)\/([0-9a-f-]{36})/i

export function jdTarget(applyUrl: string | null | undefined): JdTarget | null {
  if (!applyUrl) return null
  const gh = GREENHOUSE.exec(applyUrl)
  if (gh) return { kind: 'greenhouse', api: `https://boards-api.greenhouse.io/v1/boards/${gh[1]}/jobs/${gh[2]}` }
  const lv = LEVER.exec(applyUrl)
  // A slug of only dots ("..") would walk up api.lever.co's path.
  if (lv && !/^\.+$/.test(lv[1] ?? '')) return { kind: 'lever', api: `https://api.lever.co/v0/postings/${lv[1]}/${lv[2]}` }
  return null
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' }

/** Greenhouse/Lever HTML → readable text with bullets and headings kept as lines. */
export function htmlToText(html: string): string {
  const unescaped = html.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_m, e: string) => ENTITIES[e] ?? '')
  return unescaped
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<\s*h[1-6][^>]*>/gi, '\n## ')
    .replace(/<\s*(?:br|\/p|\/div|\/h[1-6]|\/ul|\/ol)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_m, e: string) => ENTITIES[e] ?? '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

interface LeverPosting {
  descriptionPlain?: string
  lists?: Array<{ text?: string; content?: string }>
  additionalPlain?: string
}

export async function fetchJd(target: JdTarget): Promise<string | null> {
  const res = await discoveryFetch(`jd ${target.kind}`, target.api, { headers: { accept: 'application/json' } })
  if (!res.ok) return null
  const body = (await res.json()) as unknown
  if (target.kind === 'greenhouse') {
    const content = (body as { content?: unknown }).content
    return typeof content === 'string' && content.trim() ? htmlToText(content) : null
  }
  const p = body as LeverPosting
  const lists = (p.lists ?? []).map((l) => `## ${l.text ?? ''}\n${htmlToText(l.content ?? '')}`)
  const text = [p.descriptionPlain ?? '', ...lists, p.additionalPlain ?? ''].filter((x) => x.trim()).join('\n')
  return text.trim() ? text : null
}
