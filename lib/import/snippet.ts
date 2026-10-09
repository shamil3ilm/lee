import type { ImportItem, JsonResumePath } from './types'

/**
 * Client-safe, pure. "Suggested additions for your portfolio": the ticked
 * public items as JSON Resume snippets, one per section, to paste into the
 * portfolio's profile.json (the source of truth for public facts while
 * profile editing in lee is off). Skills become one group with the ticked
 * names as keywords; headline and summary fill `basics`.
 */

export interface PortfolioSnippet {
  /** JSON Resume section ("basics", "skills", "work", …). */
  section: string
  label: string
  count: number
  /** Pretty-printed JSON, ready to copy. */
  json: string
}

const ORDER: readonly JsonResumePath[] = ['basics.label', 'basics.summary', 'basics.profiles', 'work', 'projects', 'skills', 'education', 'certificates', 'languages']

const LABELS: Readonly<Record<string, string>> = {
  basics: 'basics',
  work: 'work',
  projects: 'projects',
  skills: 'skills',
  education: 'education',
  certificates: 'certificates',
  languages: 'languages',
}

export function portfolioSnippets(picked: readonly ImportItem[], skillGroupName: string): PortfolioSnippet[] {
  const byPath = new Map<JsonResumePath, unknown[]>()
  for (const item of picked) {
    if (!item.isPublic || !item.json) continue
    byPath.set(item.json.path, [...(byPath.get(item.json.path) ?? []), item.json.value])
  }
  const out: PortfolioSnippet[] = []
  const basics: Record<string, unknown> = {}
  let basicsCount = 0
  for (const path of ORDER) {
    const values = byPath.get(path)
    if (!values || values.length === 0) continue
    if (path === 'basics.label' || path === 'basics.summary') {
      basics[path.slice('basics.'.length)] = values[values.length - 1]
      basicsCount += 1
      continue
    }
    if (path === 'basics.profiles') {
      basics.profiles = values
      basicsCount += values.length
      continue
    }
    const body = path === 'skills' ? [{ name: skillGroupName, keywords: values }] : values
    out.push({ section: path, label: LABELS[path] ?? path, count: values.length, json: JSON.stringify({ [path]: body }, null, 2) })
  }
  if (basicsCount > 0) out.unshift({ section: 'basics', label: 'basics', count: basicsCount, json: JSON.stringify({ basics }, null, 2) })
  return out
}

/** "https://github.com/<owner>/<repo>/blob/<branch>/<path>" when a portfolio repo is configured. */
export function profileJsonUrl(config: { repo: string; branch: string; path: string } | null): string | null {
  if (!config || !/^[\w.-]+\/[\w.-]+$/.test(config.repo)) return null
  const branch = encodeURIComponent(config.branch || 'main')
  const path = (config.path || 'profile.json').split('/').map(encodeURIComponent).join('/')
  return `https://github.com/${config.repo}/blob/${branch}/${path}`
}
