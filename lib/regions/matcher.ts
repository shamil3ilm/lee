import { LEFT, normalizeForMatch, RIGHT, termSource } from '@/lib/discovery/relevance/text'
import { allNodes } from './tree'

/**
 * Compiled matchers over every alias and code of the taxonomy, built once
 * (memoised). One regex alternation (longest alias first, so "navi mumbai"
 * beats "mumbai" and "abu dhabi" beats "abu") finds every place in a
 * normalised string with its position; a second, case-sensitive one finds
 * codes ("UAE", "ARE", "BLR") in the raw location field.
 */

export interface AliasEntry {
  id: string
  /** The free zone / IT park name when the alias names one ("DIFC"). */
  area: string | null
}

export interface Hit extends AliasEntry {
  /** Character offset in the text the hit came from. */
  at: number
  /** Followed by "Province", "Governorate"…: a province named after its capital. */
  admin: boolean
  /** Came from an upper-case code. */
  code: boolean
}

interface Compiled {
  aliasRe: RegExp
  aliasMap: ReadonlyMap<string, readonly AliasEntry[]>
  codeRe: RegExp | null
  codeMap: ReadonlyMap<string, string>
}

let compiled: Compiled | null = null

/** Matching key: normalised, separators removed ("Abu-Dhabi" = "abu dhabi" = "abudhabi"). */
export function aliasKey(s: string): string {
  return normalizeForMatch(s).replace(/[\s\-_./]+/g, '')
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function addEntry(map: Map<string, AliasEntry[]>, alias: string, entry: AliasEntry): void {
  const key = aliasKey(alias)
  if (!key) return
  const list = map.get(key) ?? []
  if (!list.some((e) => e.id === entry.id && e.area === entry.area)) map.set(key, [...list, entry])
}

function compile(): Compiled {
  const aliasMap = new Map<string, AliasEntry[]>()
  const sources = new Set<string>()
  const codeMap = new Map<string, string>()
  const addSource = (alias: string): void => {
    const src = termSource(alias)
    if (src) sources.add(src)
  }
  // Remote scopes come from the posting's remote signals, never from a place name.
  for (const n of allNodes().filter((x) => x.kind !== 'remote')) {
    for (const alias of [n.name, ...n.aliases]) {
      addEntry(aliasMap, alias, { id: n.id, area: null })
      addSource(alias)
    }
    for (const a of n.areas ?? []) {
      for (const alias of a.aliases) {
        addEntry(aliasMap, alias, { id: n.id, area: a.name })
        addSource(alias)
      }
    }
    for (const c of n.codes ?? []) codeMap.set(c, n.id)
  }
  const ordered = [...sources].sort((a, b) => b.length - a.length)
  const aliasRe = new RegExp(`${LEFT}(?:${ordered.join('|')})${RIGHT}`, 'gu')
  const codes = [...codeMap.keys()].sort((a, b) => b.length - a.length).map(escapeRegex)
  const codeRe = codes.length > 0 ? new RegExp(`(?<![A-Za-z])(?:${codes.join('|')})\\.?(?![A-Za-z])`, 'g') : null
  return { aliasRe, aliasMap, codeRe, codeMap }
}

function get(): Compiled {
  compiled ??= compile()
  return compiled
}

const ADMIN_SUFFIX = /^\s*,?\s*(?:province|governorate|governate|region|emirate)\b/

/** Every alias hit in normalised `text`, in order. */
export function aliasHits(text: string): Hit[] {
  const { aliasRe, aliasMap } = get()
  const out: Hit[] = []
  aliasRe.lastIndex = 0
  for (const m of text.matchAll(aliasRe)) {
    const entries = aliasMap.get(aliasKey(m[0])) ?? []
    const at = m.index ?? 0
    const admin = ADMIN_SUFFIX.test(text.slice(at + m[0].length, at + m[0].length + 14))
    for (const e of entries) out.push({ ...e, at, admin, code: false })
  }
  return out
}

/** "SA" names South Africa as often as Saudi Arabia on some boards. */
const SOUTH_AFRICA = /south africa|johannesburg|cape town|durban|pretoria/

/** Upper-case code hits in the raw (mojibake-repaired) location text. */
export function codeHits(raw: string): Hit[] {
  const { codeRe, codeMap } = get()
  if (!codeRe) return []
  const southAfrica = SOUTH_AFRICA.test(normalizeForMatch(raw))
  const out: Hit[] = []
  codeRe.lastIndex = 0
  for (const m of raw.matchAll(codeRe)) {
    const code = m[0].replace(/\.$/, '')
    const id = codeMap.get(code) ?? codeMap.get(m[0])
    if (!id || (code === 'SA' && southAfrica)) continue
    out.push({ id, area: null, at: m.index ?? 0, admin: false, code: true })
  }
  return out
}

/** Alias keys that map to more than one node (for the taxonomy's own tests). */
export function sharedAliasKeys(): Array<[string, string[]]> {
  return [...get().aliasMap.entries()]
    .filter(([, entries]) => new Set(entries.map((e) => e.id)).size > 1)
    .map(([k, entries]) => [k, [...new Set(entries.map((e) => e.id))]])
}
