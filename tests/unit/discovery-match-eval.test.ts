import { describe, expect, it } from 'vitest'
import {
  checkDiscoveryMatch,
  loadDiscoveryMatchFixtures,
  runDiscoveryMatchFixture,
} from '@/tests/eval/discovery-match'

describe('discovery-match eval fixtures', () => {
  const fixtures = loadDiscoveryMatchFixtures()

  it('has fixtures', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10)
  })

  it.each(fixtures.map((f) => [f.file, f] as const))('%s', (_file, f) => {
    expect(checkDiscoveryMatch(f, runDiscoveryMatchFixture(f))).toEqual([])
  })
})
