import type { GenField, GenSpec } from '@/lib/academy/problems/schema'

/**
 * Seeded input generators for the empirical complexity fit (v13 §4.1): each
 * problem declares how its arguments scale with n, and the runner times the
 * user's function on growing n. Generators are public (they reveal no test
 * case). Deterministic for a seed. Pure and client-safe.
 */

export type Rng = () => number

/** mulberry32: a small, fast, seedable PRNG. */
export function rng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function int(r: Rng, min: number, max: number): number {
  return min + Math.floor(r() * (max - min + 1))
}

function ints(r: Rng, len: number, spec: Extract<GenSpec, { t: 'ints' }>): number[] {
  let out: number[]
  if (spec.distinct) {
    const span = spec.max - spec.min + 1
    const step = Math.max(1, Math.floor(span / Math.max(1, len)))
    out = Array.from({ length: len }, (_, i) => spec.min + i * step + (step > 1 ? int(r, 0, step - 1) : 0))
    if (!spec.sorted) shuffle(r, out)
  } else {
    out = Array.from({ length: len }, () => int(r, spec.min, spec.max))
    if (spec.sorted) out.sort((a, b) => a - b)
  }
  return out
}

function shuffle<T>(r: Rng, list: T[]): void {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    const tmp = list[i] as T
    list[i] = list[j] as T
    list[j] = tmp
  }
}

function str(r: Rng, len: number, alphabet: string): string {
  let s = ''
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(r() * alphabet.length)]
  return s
}

export interface TreeNode {
  val: number
  left: TreeNode | null
  right: TreeNode | null
}

/** A balanced binary search tree over 1..n (depth ≈ log2 n, so recursion stays shallow). */
function tree(lo: number, hi: number): TreeNode | null {
  if (lo > hi) return null
  const mid = (lo + hi) >> 1
  return { val: mid, left: tree(lo, mid - 1), right: tree(mid + 1, hi) }
}

/** A random tree over n nodes plus `extra × n` extra edges: [[u, v], ...]. */
function edges(r: Rng, n: number, extra: number): number[][] {
  const out: number[][] = []
  for (let v = 1; v < n; v++) out.push([int(r, 0, v - 1), v])
  const more = Math.floor(extra * n)
  for (let i = 0; i < more && n > 1; i++) {
    const u = int(r, 0, n - 1)
    const v = int(r, 0, n - 1)
    if (u !== v) out.push([u, v])
  }
  return out
}

function field(r: Rng, f: GenField, i: number): unknown {
  switch (f.t) {
    case 'seq':
      return `${f.prefix ?? ''}${i}`
    case 'int':
      return int(r, f.min, f.max)
    case 'pick':
      return f.values[Math.floor(r() * f.values.length)]
    case 'ascInt':
      return i * f.step
  }
}

function one(r: Rng, spec: GenSpec, n: number): unknown {
  switch (spec.t) {
    case 'n':
      return Math.round(n * (spec.mul ?? 1) + (spec.add ?? 0))
    case 'const':
      return spec.value
    case 'ints':
      return ints(r, spec.len ?? n, spec)
    case 'str':
      return str(r, spec.len ?? n, spec.alphabet)
    case 'strs':
      return Array.from({ length: spec.len ?? n }, () => str(r, spec.wordLen, spec.alphabet))
    case 'intervals':
      return Array.from({ length: spec.len ?? n }, () => {
        const start = int(r, 0, 4 * n)
        return [start, start + int(r, 0, spec.maxLen)]
      })
    case 'tree':
      return tree(1, n)
    case 'edges':
      return edges(r, n, spec.extra ?? 0)
    case 'objs':
      return Array.from({ length: spec.len ?? n }, (_, i) =>
        Object.fromEntries(Object.entries(spec.fields).map(([k, f]) => [k, field(r, f, i)])),
      )
  }
}

/** The argument list for size n. */
export function generateArgs(specs: readonly GenSpec[], n: number, seed: number): unknown[] {
  const r = rng(seed ^ Math.imul(n, 2654435761))
  return specs.map((s) => one(r, s, n))
}

/** Sizes tried for the fit: 2^8 … 2^16; the runner stops early when calls get slow. */
export const SCALE_SIZES: readonly number[] = [256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536]
