import { describe, expect, it } from 'vitest'
import { channelFor, radarNotifyMode, selectDigestEntries, type DigestCandidate } from '@/lib/radar/digest'

const since = new Date('2026-10-01T00:00:00Z')
const termLabels = new Map([
  ['t1', 'Zorb'],
  ['t2', 'Quill Runner'],
])

function c(over: Partial<DigestCandidate>): DigestCandidate {
  return {
    id: 'e',
    name: 'Entry',
    kind: 'model',
    sources: ['hf'],
    matchedTerms: ['t1'],
    lastSeenAt: new Date('2026-10-05T00:00:00Z'),
    readAt: null,
    ...over,
  }
}

describe('radar digest selection', () => {
  it('keeps unread entries on current terms seen since the window, newest first', () => {
    const lines = selectDigestEntries(
      [
        c({ id: 'old', lastSeenAt: new Date('2026-09-20T00:00:00Z') }),
        c({ id: 'read', readAt: new Date('2026-10-06T00:00:00Z') }),
        c({ id: 'unwatched', matchedTerms: [] }),
        c({ id: 'removed-term', matchedTerms: ['gone'] }),
        c({ id: 'a', name: 'A', lastSeenAt: new Date('2026-10-04T00:00:00Z') }),
        c({ id: 'b', name: 'B', matchedTerms: ['t1', 't2', 'gone'], lastSeenAt: new Date('2026-10-06T00:00:00Z') }),
      ],
      { since, termLabels },
    )
    expect(lines.map((l) => l.id)).toEqual(['b', 'a'])
    expect(lines[0]?.terms).toEqual(['Zorb', 'Quill Runner'])
  })

  it('caps the number of lines', () => {
    const many = Array.from({ length: 20 }, (_, i) => c({ id: `e${i}`, name: `E${i}` }))
    expect(selectDigestEntries(many, { since, termLabels })).toHaveLength(8)
    expect(selectDigestEntries(many, { since, termLabels, limit: 3 })).toHaveLength(3)
  })

  it('maps each notification mode to one channel', () => {
    expect(channelFor('instant')).toBe('browser')
    expect(channelFor('daily')).toBe('daily_email')
    expect(channelFor('weekly')).toBe('weekly_digest')
    expect(channelFor('off')).toBeNull()
    expect(radarNotifyMode('nonsense')).toBe('weekly')
    expect(radarNotifyMode('daily')).toBe('daily')
  })
})
