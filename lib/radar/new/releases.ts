import { errorText, MAX_FEED_BYTES, requestJson } from '@/lib/reputation/http'
import { pastDeadline, type RadarFetchDeps } from '../sources/types'
import { dateOrNull, dayOf, excerptOf, titleOf } from '../text'
import { NEW_WINDOW_DAYS } from './novelty'
import { releaseProject, type ReleaseProject } from './projects'
import type { NewFetchResult, NewItemInput } from './types'

/**
 * New releases of the projects users follow:
 *   - endoflife.date API v1 (free, no key, MIT-licensed data; robots.txt
 *     allows everything): a release CYCLE that started in the last 30 days
 *     ("Laravel 13", "PHP 8.5"), with its latest patch and end-of-life dates;
 *   - GitHub releases (REST API, 60 requests an hour without a token):
 *     non-prerelease x.y.0 releases published in the last 30 days.
 * One request per project per day. Patch releases are not "new".
 */

export const EOL_API = 'https://endoflife.date/api/v1/products'
export const GITHUB_API = 'https://api.github.com'
const DAY_MS = 86_400_000

const US_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

function usDay(v: string | null | undefined): string | null {
  const d = dateOrNull(v)
  return d ? US_DAY.format(d) : null
}

/** "16.0" → "16", "8.5" → "8.5": x.0 and x name the same release in both sources. */
export function normalizeVersion(v: string): string {
  return v.replace(/\.0$/, '')
}

function inWindow(d: Date | null, now: Date): boolean {
  if (!d) return false
  const age = (now.getTime() - d.getTime()) / DAY_MS
  return age >= -1 && age <= NEW_WINDOW_DAYS.releases
}

interface EolCycle {
  name?: string
  releaseDate?: string
  eoasFrom?: string | null
  eolFrom?: string | null
  isLts?: boolean
  latest?: { name?: string; date?: string; link?: string | null } | null
}

function releaseItem(p: ReleaseProject, version: string, fields: Omit<NewItemInput, 'source' | 'category' | 'openness' | 'group' | 'entityKey' | 'tags' | 'traction' | 'kind' | 'title'>): NewItemInput {
  return {
    ...fields,
    source: 'releases',
    kind: 'product',
    title: titleOf(`${p.label} ${version}`),
    category: 'release',
    openness: null,
    group: 'release',
    entityKey: `release:${p.id}@${version}`,
    tags: [...new Set([p.id, p.label.toLowerCase(), ...p.aliases])],
    traction: 0.5,
  }
}

export function toEolItems(body: unknown, p: ReleaseProject, now: Date): NewItemInput[] {
  const releases = (body as { result?: { releases?: unknown } } | null)?.result?.releases
  const cycles = Array.isArray(releases) ? (releases as EolCycle[]) : []
  return cycles.flatMap((c): NewItemInput[] => {
    const released = dateOrNull(c.releaseDate)
    if (!c.name || !/^[\w.-]{1,20}$/.test(c.name) || !inWindow(released, now)) return []
    const version = normalizeVersion(c.name)
    const facts = [
      `New ${p.label} release cycle, released ${usDay(c.releaseDate)}`,
      c.latest?.name ? `latest ${c.latest.name}` : null,
      c.isLts ? 'LTS' : null,
      c.eoasFrom ? `active support until ${usDay(c.eoasFrom)}` : null,
      c.eolFrom ? `security support until ${usDay(c.eolFrom)}` : null,
    ].filter(Boolean)
    const link = c.latest?.link && /^https:\/\//.test(c.latest.link) ? c.latest.link : null
    return [
      releaseItem(p, version, {
        externalId: `eol:${p.id}@${version}`,
        url: `https://endoflife.date/${p.eol}`,
        publishedAt: released,
        excerpt: excerptOf(facts.join(' · ')),
        createdAt: released,
        metrics: {
          version,
          latest: c.latest?.name ?? undefined,
          eol: dayOf(c.eolFrom),
          createdAt: dayOf(c.releaseDate),
          ...(link ? { links: [link] } : {}),
          ...(p.github ? { repoId: p.github } : {}),
        },
      }),
    ]
  })
}

interface GhRelease {
  id?: number
  tag_name?: string
  html_url?: string
  draft?: boolean
  prerelease?: boolean
  published_at?: string | null
}

const SEMVER = /^(?:v|[\w-]+@)?(\d+)\.(\d+)\.(\d+)$/

export function toGithubReleaseItems(body: unknown, p: ReleaseProject, now: Date): NewItemInput[] {
  const list = Array.isArray(body) ? (body as GhRelease[]) : []
  const seen = new Set<string>()
  return list.flatMap((r): NewItemInput[] => {
    const m = SEMVER.exec(r.tag_name ?? '')
    const published = dateOrNull(r.published_at)
    if (!m || r.draft || r.prerelease || m[3] !== '0' || !inWindow(published, now)) return []
    if (!r.html_url || !/^https:\/\/github\.com\//.test(r.html_url)) return []
    const version = normalizeVersion(`${m[1]}.${m[2]}`)
    if (seen.has(version)) return []
    seen.add(version)
    return [
      releaseItem(p, version, {
        externalId: `gh:${p.github}@${r.tag_name}`.toLowerCase(),
        url: r.html_url,
        publishedAt: published,
        excerpt: excerptOf(`${p.label} ${r.tag_name} released on GitHub (${p.github}), ${usDay(r.published_at)}`),
        createdAt: published,
        metrics: { version, latest: r.tag_name, createdAt: dayOf(r.published_at), repoId: p.github },
      }),
    ]
  })
}

export async function fetchReleases(deps: RadarFetchDeps & { projects?: readonly string[] } = {}): Promise<NewFetchResult> {
  const now = deps.now ?? new Date()
  const projects = (deps.projects ?? []).flatMap((id) => {
    const p = releaseProject(id)
    return p ? [p] : []
  })
  const ghInit: RequestInit = {
    headers: { 'x-github-api-version': '2022-11-28', ...(deps.githubToken ? { authorization: `Bearer ${deps.githubToken}` } : {}) },
  }
  const items: NewItemInput[] = []
  const partialErrors: string[] = []
  let githubLimited = false
  for (const p of projects) {
    if (pastDeadline(deps)) break
    if (p.eol) {
      try {
        items.push(...toEolItems(await requestJson(`endoflife ${p.id}`, `${EOL_API}/${p.eol}`, deps), p, now))
      } catch (e) {
        partialErrors.push(errorText(e))
      }
    }
    if (p.github && !githubLimited && !pastDeadline(deps)) {
      try {
        const body = await requestJson(`github releases ${p.id}`, `${GITHUB_API}/repos/${p.github}/releases?per_page=10`, deps, ghInit, {
          accept: 'application/vnd.github+json',
          // Release notes make this list large; only the tags and dates are read.
          maxBytes: MAX_FEED_BYTES,
        })
        items.push(...toGithubReleaseItems(body, p, now))
      } catch (e) {
        partialErrors.push(errorText(e))
        if (/429|403/.test(errorText(e))) githubLimited = true
      }
    }
  }
  if (items.length === 0 && projects.length > 0 && partialErrors.length >= projects.length) throw new Error(partialErrors[0])
  return { items, partialErrors }
}
