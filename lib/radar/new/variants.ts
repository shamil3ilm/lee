import type { NewItemInput } from './types'

/**
 * Variant collapsing for new Hub models. A quantisation, fine-tune,
 * adapter or merge of a base model that is itself new (already in the
 * "what's new" set, or new in the same fetch) is folded under that base
 * as "+N variants", following chains to the root (a GGUF of a fine-tune of
 * a new base counts for the base). Quantisations of an OLDER base are a
 * repackaging, not something new, and are dropped; fine-tunes, adapters
 * and merges of an older base stand on their own (with the base named).
 * Pure.
 */

export interface Collapsed {
  primaries: NewItemInput[]
  /** Items folded under a base (rootKey = the base's entity key). */
  variants: Array<{ item: NewItemInput; rootKey: string }>
  dropped: number
}

export function baseKeyOf(item: NewItemInput): string | null {
  const base = item.metrics.baseModel
  return item.source === 'hf' && item.category === 'model' && base ? `hf:model:${base.toLowerCase()}` : null
}

/**
 * `known`: entity key of a model already in the shared set → the root
 * entry's entity key (itself for a primary), so a variant arriving days
 * after its base still collapses under it.
 */
export function collapseVariants(items: readonly NewItemInput[], known: ReadonlyMap<string, string>): Collapsed {
  const byKey = new Map(items.map((i) => [i.entityKey, i]))
  // entity key → the root key it collapses under, '' for a primary, null for dropped.
  const memo = new Map<string, string | null>()

  const resolve = (item: NewItemInput, depth: number): string | null => {
    const cached = memo.get(item.entityKey)
    if (cached !== undefined) return cached
    const baseKey = baseKeyOf(item)
    let out: string | null
    if (!baseKey || baseKey === item.entityKey || depth > 8) out = ''
    else if (known.has(baseKey)) out = known.get(baseKey) as string
    else {
      const base = byKey.get(baseKey)
      const baseRoot = base ? resolve(base, depth + 1) : null
      if (base && baseRoot !== null) out = baseRoot === '' ? baseKey : baseRoot
      else out = item.metrics.baseRelation === 'quantized' ? null : ''
    }
    memo.set(item.entityKey, out)
    return out
  }

  const primaries: NewItemInput[] = []
  const variants: Collapsed['variants'] = []
  let dropped = 0
  for (const item of items) {
    const root = resolve(item, 0)
    if (root === null) dropped += 1
    else if (root === '') primaries.push(item)
    else variants.push({ item, rootKey: root })
  }
  return { primaries, variants, dropped }
}
