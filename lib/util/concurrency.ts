/**
 * Map over `items` running at most `limit` workers at once. Results keep the
 * input order. Rejects with the first worker error (workers that already
 * started still finish); callers that want per-item isolation catch inside
 * the worker.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const lanes = Math.max(1, Math.min(limit, items.length))
  const run = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i] as T, i)
    }
  }
  await Promise.all(Array.from({ length: lanes }, run))
  return results
}
