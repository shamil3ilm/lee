/**
 * Region taxonomy types (lib/regions). Client-safe: data and pure helpers
 * only, no server imports.
 *
 * A node is a group (GCC, Delhi NCR, Europe), a country, a state / emirate /
 * province, a city, or a remote scope. Parents form a small DAG: most nodes
 * have one parent; a few have two (Gurugram is in Delhi NCR and Haryana).
 * The FIRST parent is the primary one, used for the display chain and the
 * picker tree.
 */

export type RegionKind = 'group' | 'country' | 'state' | 'city' | 'remote'

/** A free zone, IT park or district that maps to its city ("DIFC" → Dubai). */
export interface RegionArea {
  name: string
  aliases: readonly string[]
}

export interface RegionNode {
  /** Stable id: lowercase ISO-2 for countries ("ae", "in"), a slug otherwise ("kochi", "delhi-ncr"). */
  id: string
  /** Display name ("Kochi", "United Arab Emirates"). */
  name: string
  /** Short name for chains and chips ("UAE"); defaults to `name`. */
  short?: string
  kind: RegionKind
  /** Parent ids, primary first; none for a top-level node. */
  parents: readonly string[]
  /** Lowercase spellings matched in text (the name is always included). */
  aliases: readonly string[]
  /** Upper-case codes trusted only in a location field, matched case-sensitively ("UAE", "ARE", "BLR"). */
  codes?: readonly string[]
  areas?: readonly RegionArea[]
  /**
   * The name is shared with a place elsewhere (Kochi, Japan; Hyderabad,
   * Pakistan; Medina, Ohio): dropped when the text names another country
   * and neither this node's country nor its state.
   */
  ambiguous?: boolean
}

export type NodeInput = Omit<RegionNode, 'parents' | 'aliases'> & {
  parents?: readonly string[]
  aliases?: readonly string[]
}

/** Builds a node with defaults (no parents, no extra aliases). */
export function node(input: NodeInput): RegionNode {
  return { ...input, parents: input.parents ?? [], aliases: input.aliases ?? [] }
}

/** A city under `parents` with extra aliases and optional areas. */
export function city(
  id: string,
  name: string,
  parents: readonly string[],
  aliases: readonly string[] = [],
  extra: Partial<Pick<RegionNode, 'areas' | 'codes' | 'ambiguous' | 'short'>> = {},
): RegionNode {
  return { id, name, kind: 'city', parents, aliases, ...extra }
}

/** A free zone / IT park / district of a city. */
export function area(name: string, ...aliases: string[]): RegionArea {
  return { name, aliases: [name.toLowerCase(), ...aliases] }
}
