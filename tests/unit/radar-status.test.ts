import { describe, expect, it } from 'vitest'
import { sourceStatuses, type RadarRun } from '@/lib/radar/status'
import { describeRadarSummary, type RadarRunSummary } from '@/lib/radar/summary'

const NOW = new Date('2026-10-08T12:00:00Z')
const hoursAgo = (h: number): Date => new Date(NOW.getTime() - h * 3_600_000)

function run(source: RadarRunSummary['source'], at: Date, over: Partial<RadarRunSummary> = {}): RadarRun {
  return { at, summary: { kind: 'radar-source', source, status: 'polled', fetched: 5, new: 2, matched: 0, ...over } }
}

describe('radar source status', () => {
  it('derives ok, stale, failing, off and never from run summaries', () => {
    const statuses = sourceStatuses(
      [
        run('hf', hoursAgo(3)),
        run('arxiv', hoursAgo(80)),
        run('github', hoursAgo(2), { status: 'failed', error: 'github: rate limited (429)' }),
        run('github', hoursAgo(26), { new: 7 }),
        run('hn', hoursAgo(1), { status: 'paused' }),
      ],
      NOW,
      new Set(['gdelt']),
    )
    const by = Object.fromEntries(statuses.map((s) => [s.source, s]))
    expect(by.hf?.state).toBe('ok')
    expect(by.arxiv?.state).toBe('stale')
    expect(by.github).toMatchObject({ state: 'failing', lastError: 'github: rate limited (429)', lastNew: 7 })
    expect(by.github?.lastOkAt).toEqual(hoursAgo(26))
    expect(by.hn?.state).toBe('never')
    expect(by.gdelt?.state).toBe('off')
    expect(by.feeds?.state).toBe('never')
  })

  it('surfaces partial failures of an otherwise good run', () => {
    const [feeds] = sourceStatuses([run('feeds', hoursAgo(1), { partialErrors: 1, error: 'feed x: HTTP 404' })], NOW).filter(
      (s) => s.source === 'feeds',
    )
    expect(feeds).toMatchObject({ state: 'ok', lastError: 'feed x: HTTP 404' })
  })

  it('describes runs for Settings › Background jobs', () => {
    expect(describeRadarSummary(run('hf', NOW, { matched: 1 }).summary)).toBe('Hugging Face Hub: 5 found · 2 new · 1 on watch terms')
    expect(describeRadarSummary(run('hn', NOW, { status: 'skipped' }).summary)).toBe('Hacker News: no watch terms')
    expect(describeRadarSummary(run('arxiv', NOW, { status: 'failed', error: 'x' }).summary)).toBe('arXiv: failed (x)')
  })
})
