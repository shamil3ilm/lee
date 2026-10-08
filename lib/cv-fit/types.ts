import { isRegion, type Region } from '@/lib/variants/types'

/**
 * "Best CV for each job": client-safe types. A variant's fit for a job is a
 * deterministic 0–100 number (./score.ts); the best and the runner-up are
 * stored compactly on `discoveries.best_cv` / `applications.best_cv` with the
 * key they were computed under (`best_cv_key`, ./key.ts).
 */

export interface Coverage {
  met: number
  partial: number
  missing: number
  /** Checked must-have and nice-to-have lines ("not checked" lines are left out). */
  total: number
}

/** One variant scored against one job. */
export interface VariantFit {
  variantId: string
  version: number
  name: string
  region: Region
  fit: number
  /** Must-haves only (what the card line says). */
  must: Coverage
  /** Short, human reasons ("Covers 5 of 6 must-haves", "GCC variant for a GCC job"). */
  reasons: string[]
  /** Requirement lines this variant meets or partly meets (for the comparison reasons). */
  covered: string[]
  /** CV Score (deterministic, general) of the variant: the tiebreaker. */
  quality: number
}

/** What is stored per row: compact (≈ 0.5–1 KB). */
export interface StoredFit {
  variantId: string
  version: number
  name: string
  region: Region
  fit: number
  met: number
  partial: number
  missing: number
  total: number
  reasons: string[]
}

export interface BestCv {
  /** Rules version (BEST_CV_VERSION). */
  v: string
  best: StoredFit
  runnerUp: StoredFit | null
  /** How many variants were compared. */
  compared: number
}

function str(v: unknown, max = 200): string | null {
  return typeof v === 'string' ? v.slice(0, max) : null
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function storedFit(v: unknown): StoredFit | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  const variantId = str(r.variantId, 64)
  const name = str(r.name)
  const fit = num(r.fit)
  const version = num(r.version)
  if (!variantId || !name || fit === null || version === null || !isRegion(r.region)) return null
  return {
    variantId,
    version,
    name,
    region: r.region,
    fit,
    met: num(r.met) ?? 0,
    partial: num(r.partial) ?? 0,
    missing: num(r.missing) ?? 0,
    total: num(r.total) ?? 0,
    reasons: Array.isArray(r.reasons) ? r.reasons.filter((x): x is string => typeof x === 'string').slice(0, 6) : [],
  }
}

/** A stored `best_cv` jsonb, read defensively (anything malformed → null). */
export function toBestCv(value: unknown): BestCv | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const d = value as Record<string, unknown>
  const best = storedFit(d.best)
  if (!best) return null
  return { v: str(d.v, 20) ?? '', best, runnerUp: storedFit(d.runnerUp), compared: num(d.compared) ?? 1 }
}

export function toStoredFit(f: VariantFit): StoredFit {
  return {
    variantId: f.variantId,
    version: f.version,
    name: f.name,
    region: f.region,
    fit: f.fit,
    met: f.must.met,
    partial: f.must.partial,
    missing: f.must.missing,
    total: f.must.total,
    reasons: f.reasons.slice(0, 6),
  }
}
