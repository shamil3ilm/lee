/**
 * Deterministic shuffling: each attempt stores a seed, so its choice order
 * is reproducible (replay, history) while the answer moves between attempts.
 * Pure, client-safe.
 */

/** mulberry32: tiny, fast, good enough for presentation order. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A shuffled copy (Fisher–Yates). */
export function seededShuffle<T>(list: readonly T[], seed: number): T[] {
  const out = [...list]
  const next = rng(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}

/** Display order of `n` choices for this seed: original indexes. */
export function choiceOrder(n: number, seed: number): number[] {
  return seededShuffle(
    Array.from({ length: n }, (_, i) => i),
    seed,
  )
}

/** A fresh 31-bit seed for a new attempt. */
export function newSeed(random: () => number = Math.random): number {
  return Math.floor(random() * 0x7fffffff)
}
