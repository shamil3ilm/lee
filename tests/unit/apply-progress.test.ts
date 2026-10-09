import { describe, expect, it } from 'vitest'
import { counts, currentStep, isPrepared, parseProgress, scoreDelta } from '@/lib/apply/progress'
import { appliedInstant, followupDue, isDayString, localDay, weekStart } from '@/lib/apply/dates'
import { applySettingsFrom, applySettingsSchema } from '@/lib/apply/settings'

const ID = '00000000-0000-4000-8000-000000000001'

describe('prepare progress', () => {
  it('walks the steps in order and treats skipped as finished', () => {
    expect(currentStep({})).toBe('variant')
    const p = parseProgress({ variant: { status: 'skipped' }, tailor: { status: 'done', documentId: ID, version: 1, scoreBefore: 60, scoreAfter: 72 } })
    expect(currentStep(p)).toBe('cover')
    expect(isPrepared(p)).toBe(false)
    const full = { ...p, cover: { status: 'skipped' as const }, checklist: { status: 'done' as const, checked: ['apply'] } }
    expect(isPrepared(full)).toBe(true)
    expect(currentStep(full)).toBe('applied')
    expect(counts(full)).toEqual({ done: 2, skipped: 2 })
    expect(scoreDelta(full)).toBe(12)
  })

  it('reads broken stored progress as empty', () => {
    expect(parseProgress({ variant: { status: 'maybe' } })).toEqual({})
    expect(parseProgress(null)).toEqual({})
  })
})

describe('apply dates (user timezone)', () => {
  const tz = 'Asia/Dubai'
  const now = new Date('2026-10-07T22:30:00Z') // Oct 8, 02:30 in Dubai

  it('uses the local calendar day', () => {
    expect(localDay(now, tz)).toBe('2026-10-08')
    expect(isDayString('2026-02-30')).toBe(false)
    expect(isDayString('2026-10-08')).toBe(true)
  })

  it('applies "today" at now and another day at local noon', () => {
    expect(appliedInstant('2026-10-08', tz, now)).toEqual(now)
    expect(appliedInstant('2026-10-06', tz, now).toISOString()).toBe('2026-10-06T08:00:00.000Z')
  })

  it('schedules the follow-up N business days later at 09:00 local', () => {
    // Tuesday + 5 business days = the next Tuesday.
    expect(followupDue(new Date('2026-10-06T08:00:00Z'), 5, tz).toISOString()).toBe('2026-10-13T05:00:00.000Z')
    // Friday + 3 business days skips the weekend: Wednesday.
    expect(followupDue(new Date('2026-10-09T08:00:00Z'), 3, tz).toISOString()).toBe('2026-10-14T05:00:00.000Z')
  })

  it('starts the week on the local Monday', () => {
    expect(weekStart(now, tz).toISOString()).toBe('2026-10-04T20:00:00.000Z')
  })
})

describe('apply settings', () => {
  it('falls back to defaults and clamps stored values', () => {
    expect(applySettingsFrom(null)).toEqual({ shortlistSize: 5, followupDays: 5, followupSecondDays: 10, shortlistInEmails: true })
    expect(applySettingsFrom({ shortlistSize: 99, followupDays: 1, followupSecondDays: 99, shortlistInEmails: false })).toEqual({
      shortlistSize: 10,
      followupDays: 2,
      followupSecondDays: 30,
      shortlistInEmails: false,
    })
  })

  it('rejects out-of-range input with a friendly message', () => {
    const r = applySettingsSchema.safeParse({ shortlistSize: 2, followupDays: 7, shortlistInEmails: true })
    expect(r.success).toBe(false)
  })
})
