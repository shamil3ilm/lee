import { GCC_NODES } from './data-gcc'
import { INDIA_NODES } from './data-india'
import { WORLD_NODES } from './data-world'
import type { RegionNode } from './types'

/**
 * The region taxonomy: one versioned list of nodes (GCC → countries →
 * emirates / provinces → cities; India → states → cities; Remote → scopes;
 * other countries at country level). Client-safe data.
 *
 * Bump TAXONOMY_VERSION whenever a node, alias or parent changes in a way
 * that should re-tag stored postings (it is hashed into the relevance key,
 * so the existing re-evaluation backfill re-writes `discoveries.region_ids`).
 * Never rename or remove an id: ids are stored in preferences and URLs.
 */

// t2 — 2026-10-09: Kuwait governorates and districts, GCC business districts, Indian tech areas, Malayalam / Hindi / Kannada / Tamil / Telugu names.
export const TAXONOMY_VERSION = 't2'

export const REGION_NODES: readonly RegionNode[] = [...GCC_NODES, ...INDIA_NODES, ...WORLD_NODES]

/** Top-level nodes of the picker, in display order. */
export const ROOT_ORDER: readonly string[] = ['gcc', 'in', 'remote', 'europe', 'us', 'ca', 'au', 'nz', 'sg', 'my', 'jp', 'pk', 'lk', 'bd', 'np', 'eg', 'jo', 'tr']

/** The six GCC countries, in display order. */
export const GCC_COUNTRY_IDS: readonly string[] = ['ae', 'sa', 'qa', 'kw', 'bh', 'om']

/** Countries whose subtrees the Settings picker offers as target regions. */
export const TARGET_COUNTRY_IDS: readonly string[] = [...GCC_COUNTRY_IDS, 'in']

/** Region filter tree: the target regions and Remote first, other countries collapsed. */
export const FILTER_ROOTS: readonly string[] = ['gcc', 'in', 'remote']
export const FILTER_OTHER_ROOTS: readonly string[] = ROOT_ORDER.filter((id) => !FILTER_ROOTS.includes(id))

/** Settings › Search target regions: the GCC and India subtrees. */
export const SETTINGS_ROOTS: readonly string[] = ['gcc', 'in']

/** Quick picks of the region filter. */
export const QUICK_PICKS: readonly string[] = ['gcc', 'ae', 'in', 'kerala', 'bengaluru', 'remote']
