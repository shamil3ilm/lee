import { normalizeForMatch, repairMojibake } from '@/lib/discovery/relevance/text'
import { aliasHits, codeHits, type Hit } from './matcher'
import { ancestorsOf, countriesOf, getNode, withAncestors } from './tree'

/**
 * The one location normaliser: any posting location string → the DEEPEST
 * known nodes it names (plus their ancestors), e.g.
 *   "Technopark, Trivandrum"           → thiruvananthapuram (area Technopark) → kerala → in
 *   "AE - Dubai, United Arab Emirates" → dubai → ae → gcc
 *   "Bangalore / Hyderabad / Remote"   → bengaluru, hyderabad
 *   "Kochi, Japan"                     → jp (an ambiguous name yields to the country named next to it)
 * Case-insensitive and punctuation-tolerant, with aliases, Arabic,
 * double-encoded UTF-8, "City, Country" / "City - Country" forms, IT parks
 * and free zones; ISO-2 / ISO-3 and airport codes only when `trustCodes`
 * (a location field, where "US" or "IN" are not ordinary words).
 * Pure, client-safe and memoised.
 */

export interface ResolvedPlace {
  id: string
  /** The free zone / IT park named, e.g. "Infopark", "DIFC". */
  area: string | null
}

export interface ResolvedLocation {
  /** Deepest nodes named, in the order the text names them. */
  places: readonly ResolvedPlace[]
  /** The places and every ancestor (what `discoveries.region_ids` stores). */
  ids: readonly string[]
}

export interface ResolveOptions {
  /** Trust upper-case codes ("UAE", "SA", "ARE", "BLR"): location fields only. */
  trustCodes?: boolean
}

const EMPTY: ResolvedLocation = { places: [], ids: [] }

/** Separators between the locations of a multi-location posting. */
const SEGMENT_SEP = /\s*(?:\/|\||;|·|•|\n|\bor\b|\band\b|\+)\s*/gi

/** Segment index of each offset: commas chain "City, State, Country"; slashes and "or" separate places. */
function segmentOf(text: string): (at: number) => number {
  const cuts: number[] = []
  SEGMENT_SEP.lastIndex = 0
  for (const m of text.matchAll(SEGMENT_SEP)) cuts.push(m.index ?? 0)
  return (at) => cuts.filter((c) => c < at).length
}

interface Located extends Hit {
  segment: number
}

function locate(raw: string, text: string, trustCodes: boolean): Located[] {
  const textSeg = segmentOf(text)
  const rawSeg = segmentOf(raw)
  const fromText = aliasHits(text).map((h) => ({ ...h, segment: textSeg(h.at) }))
  const fromCodes = trustCodes ? codeHits(raw).map((h) => ({ ...h, segment: rawSeg(h.at) })) : []
  return [...fromText, ...fromCodes].sort((a, b) => a.segment - b.segment || a.at - b.at)
}

/**
 * An ambiguous name (Kochi, Hyderabad, Medina…) is dropped when its segment
 * names another country and neither its own country nor one of its states.
 */
function dropAmbiguous(hits: readonly Located[]): Located[] {
  return hits.filter((h) => {
    if (!getNode(h.id)?.ambiguous) return true
    const same = hits.filter((o) => o.segment === h.segment && o.id !== h.id)
    const named = same.filter((o) => getNode(o.id)?.kind === 'country').map((o) => o.id)
    if (named.length === 0) return true
    const own = new Set([...countriesOf(h.id), ...ancestorsOf(h.id)])
    return same.some((o) => own.has(o.id))
  })
}

/** "Jeddah, Makkah Province": a province named after a city yields to the city named. */
function dropAdminNames(hits: readonly Located[]): Located[] {
  const strongCity = hits.some((h) => !h.admin && getNode(h.id)?.kind === 'city')
  return strongCity ? hits.filter((h) => !h.admin || getNode(h.id)?.kind !== 'city') : [...hits]
}

/** Keep only the deepest: drop a node when another hit lies below it. */
function deepest(hits: readonly Located[]): Located[] {
  const ids = new Set(hits.map((h) => h.id))
  const covered = new Set<string>()
  for (const id of ids) for (const a of ancestorsOf(id)) if (ids.has(a)) covered.add(a)
  return hits.filter((h) => !covered.has(h.id))
}

function toPlaces(hits: readonly Located[]): ResolvedPlace[] {
  const out: ResolvedPlace[] = []
  for (const h of hits) {
    const prior = out.findIndex((p) => p.id === h.id)
    if (prior < 0) out.push({ id: h.id, area: h.area })
    else if (!out[prior]!.area && h.area) out[prior] = { id: h.id, area: h.area }
  }
  return out
}

function compute(raw: string, trustCodes: boolean): ResolvedLocation {
  const repaired = repairMojibake(raw)
  const text = normalizeForMatch(repaired)
  if (!text) return EMPTY
  const hits = deepest(dropAdminNames(dropAmbiguous(locate(repaired, text, trustCodes))))
  const places = toPlaces(hits)
  return places.length === 0 ? EMPTY : { places, ids: withAncestors(places.map((p) => p.id)) }
}

const MEMO_MAX = 2_000
const memo = new Map<string, ResolvedLocation>()

export function resolveLocation(raw: string | null | undefined, opts: ResolveOptions = {}): ResolvedLocation {
  if (!raw || !raw.trim()) return EMPTY
  const trustCodes = opts.trustCodes === true
  const key = `${trustCodes ? 1 : 0}${raw}`
  const hit = memo.get(key)
  if (hit) return hit
  const result = compute(raw.slice(0, 2_000), trustCodes)
  if (memo.size >= MEMO_MAX) memo.clear()
  memo.set(key, result)
  return result
}
