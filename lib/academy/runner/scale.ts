import { generateArgs, SCALE_SIZES } from './generate'
import type { ScaleJob, ScalePoint } from './protocol'

/**
 * Time the user's function at growing n (v13 §4.1). Stops when one call gets
 * slow or the budget is spent, so an O(n²) solution is measured on smaller n
 * instead of hitting the hard timeout. Runs inside a runner worker.
 */

export const SLOW_CALL_MS = 200

export async function measureScale(
  job: ScaleJob,
  timeAt: (args: unknown[]) => number | Promise<number>,
  clock: () => number = () => performance.now(),
): Promise<ScalePoint[]> {
  const start = clock()
  const points: ScalePoint[] = []
  for (const n of SCALE_SIZES) {
    if (clock() - start > job.budgetMs) break
    const ms = await timeAt(generateArgs(job.specs, n, job.seed))
    if (!Number.isFinite(ms) || ms < 0) break
    points.push({ n, ms })
    if (ms > SLOW_CALL_MS) break
  }
  return points
}
