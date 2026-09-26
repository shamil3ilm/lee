export const BACKOFF_BASE_MS = 60_000
export const BACKOFF_CAP_MS = 6 * 60 * 60 * 1000

/**
 * Delay before retry number `attempts` (1 = the first failure): exponential
 * (base · 2^(attempts-1), capped) with "equal jitter" — half fixed, half
 * random — so retries of jobs that failed together spread out, while the
 * delay never drops below half the exponential step.
 */
export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const n = Math.max(1, Math.floor(attempts))
  const exp = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.min(n - 1, 30))
  const r = Math.min(1, Math.max(0, random()))
  return Math.round(exp / 2 + (exp / 2) * r)
}
