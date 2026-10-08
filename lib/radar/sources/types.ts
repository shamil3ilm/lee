import type { HttpDeps } from '@/lib/reputation/http'
import type { WatchTermLike } from '../match'
import type { RadarItemInput } from '../types'

export interface RadarFetchDeps extends HttpDeps {
  now?: Date
  /** The user's unmuted watch terms (term sources search for the first few). */
  terms?: readonly WatchTermLike[]
  /** Optional free tokens from Settings › AI › Service keys. */
  githubToken?: string | null
  hfToken?: string | null
  /** Epoch ms: start no new request after this. */
  deadline?: number
}

export interface RadarFetchResult {
  items: RadarItemInput[]
  /** Requests that failed without failing the source (one feed, one term). */
  partialErrors: string[]
}

export type RadarFetcher = (deps?: RadarFetchDeps) => Promise<RadarFetchResult>

/** Term sources query at most this many terms per daily run. */
export const MAX_TERMS_PER_RUN = 5

export function pastDeadline(deps: RadarFetchDeps): boolean {
  return deps.deadline !== undefined && Date.now() >= deps.deadline
}

/** The terms a term source searches for today: rotated daily so every term gets a turn. */
export function termsForRun(deps: RadarFetchDeps, max = MAX_TERMS_PER_RUN): WatchTermLike[] {
  const terms = (deps.terms ?? []).filter((t) => !t.muted)
  if (terms.length <= max) return [...terms]
  const day = Math.floor((deps.now ?? new Date()).getTime() / 86_400_000)
  const start = (day * max) % terms.length
  return Array.from({ length: max }, (_, i) => terms[(start + i) % terms.length] as WatchTermLike)
}
