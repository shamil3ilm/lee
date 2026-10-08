/**
 * A small robots.txt reader (RFC 9309): the group for our product token
 * ("lee") if present, else "*"; the longest matching Allow/Disallow wins,
 * Allow on ties; `*` and `$` wildcards. Pure.
 */

export const ROBOTS_TOKEN = 'lee'

interface Rule {
  allow: boolean
  pattern: string
}

interface Group {
  agents: string[]
  rules: Rule[]
}

function parseGroups(txt: string): Group[] {
  const groups: Group[] = []
  let current: Group | null = null
  let lastWasAgent = false
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line)
    if (!m) continue
    const key = (m[1] as string).toLowerCase()
    const value = (m[2] as string).trim()
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (!current) continue
    if (key === 'allow' || key === 'disallow') {
      // An empty Disallow allows everything: no rule.
      if (value) current.rules = [...current.rules, { allow: key === 'allow', pattern: value }]
    }
  }
  return groups
}

function toRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$')
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${body}${anchored ? '$' : ''}`)
}

/** May `pathWithQuery` be fetched under this robots.txt? */
export function robotsAllows(txt: string, pathWithQuery: string, token = ROBOTS_TOKEN): boolean {
  const groups = parseGroups(txt)
  const mine = groups.filter((g) => g.agents.some((a) => a === token.toLowerCase()))
  const rules = (mine.length > 0 ? mine : groups.filter((g) => g.agents.includes('*'))).flatMap((g) => g.rules)
  let best: Rule | null = null
  for (const r of rules) {
    if (!toRegExp(r.pattern).test(pathWithQuery)) continue
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r
  }
  return best ? best.allow : true
}
