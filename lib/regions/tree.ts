import { REGION_NODES } from './taxonomy'
import type { RegionNode } from './types'

/**
 * Lookup maps over the taxonomy, built once on first use (memoised): nodes
 * by id, primary children, all ancestors, all descendants. Pure and
 * client-safe.
 */

interface Index {
  byId: ReadonlyMap<string, RegionNode>
  /** Children by PRIMARY parent (the picker tree). */
  children: ReadonlyMap<string, readonly string[]>
  /** Every ancestor through any parent, nearest first. */
  ancestors: ReadonlyMap<string, readonly string[]>
  /** Every descendant through any parent. */
  descendants: ReadonlyMap<string, ReadonlySet<string>>
}

let cached: Index | null = null

function collectAncestors(id: string, byId: ReadonlyMap<string, RegionNode>): string[] {
  const out: string[] = []
  const queue = [...(byId.get(id)?.parents ?? [])]
  while (queue.length > 0) {
    const next = queue.shift()!
    if (out.includes(next)) continue
    out.push(next)
    queue.push(...(byId.get(next)?.parents ?? []))
  }
  return out
}

function build(): Index {
  const byId = new Map(REGION_NODES.map((n) => [n.id, n] as const))
  const children = new Map<string, string[]>()
  const ancestors = new Map<string, readonly string[]>()
  const descendants = new Map<string, Set<string>>()
  for (const n of REGION_NODES) {
    const primary = n.parents[0]
    if (primary) children.set(primary, [...(children.get(primary) ?? []), n.id])
    const up = collectAncestors(n.id, byId)
    ancestors.set(n.id, up)
    for (const a of up) descendants.set(a, new Set([...(descendants.get(a) ?? []), n.id]))
  }
  return { byId, children, ancestors, descendants }
}

function index(): Index {
  cached ??= build()
  return cached
}

export function getNode(id: string): RegionNode | undefined {
  return index().byId.get(id)
}

export function isRegionId(v: unknown): v is string {
  return typeof v === 'string' && index().byId.has(v)
}

export function allNodes(): readonly RegionNode[] {
  return REGION_NODES
}

export function childrenOf(id: string): readonly string[] {
  return index().children.get(id) ?? []
}

export function ancestorsOf(id: string): readonly string[] {
  return index().ancestors.get(id) ?? []
}

export function descendantsOf(id: string): ReadonlySet<string> {
  return index().descendants.get(id) ?? new Set()
}

/** True when `id` is `ancestor` or below it (through any parent). */
export function isWithin(id: string, ancestor: string): boolean {
  return id === ancestor || ancestorsOf(id).includes(ancestor)
}

/** True when any of `ids` is within `ancestor`. */
export function anyWithin(ids: Iterable<string>, ancestor: string): boolean {
  for (const id of ids) if (isWithin(id, ancestor)) return true
  return false
}

/** `id` and its ancestors, deduplicated. */
export function withAncestors(ids: Iterable<string>): string[] {
  const out = new Set<string>()
  for (const id of ids) {
    if (!index().byId.has(id)) continue
    out.add(id)
    for (const a of ancestorsOf(id)) out.add(a)
  }
  return [...out]
}

/** The primary chain from `id` up to its root: ["kochi", "kerala", "in"]. */
export function primaryChain(id: string): string[] {
  const out: string[] = []
  let current = getNode(id)
  while (current && !out.includes(current.id)) {
    out.push(current.id)
    const parent = current.parents[0]
    current = parent ? getNode(parent) : undefined
  }
  return out
}

/** The country a node belongs to (itself when a country), or null. */
export function countryOf(id: string): string | null {
  if (getNode(id)?.kind === 'country') return id
  return ancestorsOf(id).find((a) => getNode(a)?.kind === 'country') ?? null
}

/** All countries a node belongs to (through any parent). */
export function countriesOf(id: string): string[] {
  return [id, ...ancestorsOf(id)].filter((a) => getNode(a)?.kind === 'country')
}

/** Short display name ("UAE", "Trivandrum"), else the name; the id when unknown. */
export function shortName(id: string): string {
  const n = getNode(id)
  return n ? (n.short ?? n.name) : id
}

/** Display name; the id when unknown. */
export function nodeName(id: string): string {
  return getNode(id)?.name ?? id
}
