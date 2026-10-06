/**
 * jsonb caps for Neon Free's 0.5 GB (v17 §9.6 rule 4). Values over the cap
 * are replaced by a marker, never silently stored at full size. Pure.
 */

export const SUBMISSION_MAX_BYTES = 1024
export const EVALUATION_MAX_BYTES = 2048
export const PLAN_MAX_BYTES = 6144
export const SEED_MAX_BYTES = 1024

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

export function fitsJson(value: unknown, maxBytes: number): boolean {
  return byteLength(JSON.stringify(value ?? null)) <= maxBytes
}

/** `value` when it fits, else `fallback` (which must itself fit). */
export function capJson<T, F>(value: T, maxBytes: number, fallback: F): T | F {
  return fitsJson(value, maxBytes) ? value : fallback
}
