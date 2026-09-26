import { describe, expect, it } from 'vitest'
import { mapWithConcurrency } from '@/lib/util/concurrency'

describe('mapWithConcurrency', () => {
  it('keeps input order and never exceeds the limit', async () => {
    let active = 0
    let peak = 0
    const out = await mapWithConcurrency([5, 1, 4, 2, 3], 2, async (n) => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, n * 3))
      active -= 1
      return n * 10
    })
    expect(out).toEqual([50, 10, 40, 20, 30])
    expect(peak).toBe(2)
  })

  it('handles an empty list and a limit larger than the list', async () => {
    expect(await mapWithConcurrency([], 3, async (x) => x)).toEqual([])
    expect(await mapWithConcurrency([1, 2], 10, async (x) => x + 1)).toEqual([2, 3])
  })

  it('rejects with the first error', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('two')
        return n
      }),
    ).rejects.toThrow('two')
  })
})
