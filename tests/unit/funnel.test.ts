import { describe, it, expect } from 'vitest'
import { buildFunnelCounts } from '@/lib/dashboard/funnel'

describe('buildFunnelCounts', () => {
  it('cumulates from later stages into earlier ones', () => {
    const counts = buildFunnelCounts({
      saved: 10,
      applied: 5,
      screen: 3,
      interview: 2,
      offer: 1,
      rejected: 4,
      withdrawn: 1,
    })
    // Applied = applied+screen+interview+offer = 5+3+2+1
    expect(counts.applied).toBe(11)
    expect(counts.screen).toBe(6)
    expect(counts.interview).toBe(3)
    expect(counts.offer).toBe(1)
    // Terminal stages pass through exclusive.
    expect(counts.rejected).toBe(4)
    expect(counts.withdrawn).toBe(1)
  })

  it('all zeros → all zeros', () => {
    const counts = buildFunnelCounts({
      saved: 0,
      applied: 0,
      screen: 0,
      interview: 0,
      offer: 0,
      rejected: 0,
      withdrawn: 0,
    })
    expect(counts.applied).toBe(0)
    expect(counts.offer).toBe(0)
  })

  it('excludes saved from the funnel', () => {
    const counts = buildFunnelCounts({
      saved: 100,
      applied: 3,
      screen: 0,
      interview: 0,
      offer: 0,
      rejected: 0,
      withdrawn: 0,
    })
    expect(counts.applied).toBe(3)
  })
})
