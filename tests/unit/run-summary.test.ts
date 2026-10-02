import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { capSummary, describeSummary, readRunRecord } from '@/lib/queue/run-summary'
import { DRAIN_HOURS_UTC, nextDrainAfter, nextRunAt, SCHEDULE_HOUR_UTC } from '@/lib/queue/schedule-times'
import { describePollStats, readSourceLastResult } from '@/lib/discovery/poll-stats'

describe('describeSummary', () => {
  it('writes one line per job type', () => {
    expect(
      describeSummary({
        kind: 'discovery-source',
        source: 'Acme',
        status: 'polled',
        fetched: 12,
        new: 3,
        scored: 3,
        quarantined: 1,
        skipped: 9,
        errors: 0,
      }),
    ).toBe('Acme: 12 found · 3 new · 3 scored · 1 quarantined')
    expect(describeSummary({ kind: 'gmail-sync', checked: 40, matched: 2, logged: 2 })).toBe(
      '40 checked · 2 matched · 2 logged',
    )
    expect(describeSummary({ kind: 'gmail-sync', skipped: 'no_google_account' })).toBe('Skipped: no Google account')
    expect(describeSummary({ kind: 'digest', sent: true })).toBe('Digest sent')
    expect(describeSummary({ kind: 'digest', sent: false, reason: 'not_monday' })).toBe(
      'Not sent: not Monday in your timezone',
    )
    expect(describeSummary({ kind: 'followups', nudged: 1 })).toBe('1 follow-up nudged')
    expect(describeSummary({ kind: 'reminders', added: 2 })).toBe('2 reminders added')
    expect(describeSummary({ kind: 'usage-snapshot', throttles: [], todosCreated: 0 })).toBe(
      'Snapshot taken · no throttles',
    )
    expect(describeSummary({ kind: 'scam-reassess', reassessed: 5 })).toBe('5 listings re-checked')
    expect(describeSummary({ kind: 'discovery-email', sent: true, count: 1 })).toBe('Sent · 1 match')
    expect(describeSummary({ kind: 'discovery-email', sent: false, reason: 'no_matches' })).toBe('Nothing new to send')
    expect(describeSummary(null)).toBe('')
  })

  it('reads stored records defensively', () => {
    expect(readRunRecord(null)).toEqual({})
    expect(readRunRecord({ summary: { nope: 1 }, errors: [{ message: 'x', attempt: 2, at: 't' }, 5] })).toEqual({
      summary: null,
      errors: [{ message: 'x', attempt: 2, at: 't' }],
    })
    expect(capSummary(undefined)).toBeNull()
  })
})

describe('source poll stats', () => {
  it('reads last_result and formats it', () => {
    const r = readSourceLastResult({ fetched: 12, new: 3, quarantined: 1, at: '2026-09-27T00:00:00Z', junk: 'x' })
    expect(r).toEqual({ fetched: 12, new: 3, scored: 0, quarantined: 1, skipped: 0, at: '2026-09-27T00:00:00Z' })
    expect(describePollStats(r!)).toBe('12 found · 3 new · 1 quarantined')
    expect(readSourceLastResult(null)).toBeNull()
  })
})

describe('schedule times', () => {
  it('match the crons in vercel.json', () => {
    const cfg = JSON.parse(readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons: Array<{ path: string; schedule: string }>
    }
    const hours = (p: string) =>
      cfg.crons.filter((c) => c.path === p).map((c) => Number(c.schedule.split(' ')[1])).sort((a, b) => a - b)
    expect(hours('/api/cron/drain')).toEqual([...DRAIN_HOURS_UTC])
    expect(hours('/api/cron/schedule')).toEqual([SCHEDULE_HOUR_UTC])
  })

  it('computes the next drain and next run', () => {
    expect(nextDrainAfter(new Date('2026-09-26T12:00:00Z')).toISOString()).toBe('2026-09-26T16:00:00.000Z')
    expect(nextDrainAfter(new Date('2026-09-26T22:00:00Z')).toISOString()).toBe('2026-09-27T12:00:00.000Z')
    const now = new Date('2026-09-26T13:00:00Z')
    expect(nextRunAt(now, new Date('2026-09-26T08:00:00Z')).toISOString()).toBe('2026-09-26T16:00:00.000Z')
    expect(nextRunAt(now, null).toISOString()).toBe('2026-09-27T12:00:00.000Z')
  })
})
