import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatDateTime, isValidTimeZone, shortDateTime } from '@/lib/ui/date'
import { DIGEST_SEND_UTC_HOUR, digestSendInstant } from '@/lib/digest/send-time'

const AT = new Date('2026-09-27T09:00:00Z')

describe('formatDateTime', () => {
  it('renders in the given IANA timezone, US style', () => {
    expect(formatDateTime(AT, 'datetime', 'Asia/Kolkata')).toBe('Sep 27, 2:30 PM')
    expect(formatDateTime(AT, 'datetime', 'UTC')).toBe('Sep 27, 9:00 AM')
    expect(formatDateTime(AT, 'datetime-year', 'Asia/Kolkata')).toBe('Sep 27, 2026, 2:30 PM')
    expect(formatDateTime(AT, 'time', 'Asia/Kolkata')).toBe('2:30 PM')
    expect(formatDateTime(AT, 'date-year', 'America/Los_Angeles')).toBe('Sep 27, 2026')
  })

  it('crosses the date line correctly', () => {
    expect(formatDateTime('2026-09-27T20:00:00Z', 'date', 'Asia/Kolkata')).toBe('Sep 28')
  })

  it('ignores an invalid zone instead of throwing', () => {
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
    expect(formatDateTime(AT, 'date-year', 'Mars/Olympus')).toBe('Sep 27, 2026')
  })

  it('returns an empty string for invalid dates', () => {
    expect(formatDateTime('not a date')).toBe('')
  })

  it('shortDateTime takes the zone too', () => {
    expect(shortDateTime(AT, 'Asia/Kolkata')).toBe('Sep 27, 2:30 PM')
  })
})

describe('digest send time', () => {
  it('matches the daily scheduler cron in vercel.json', () => {
    const vercel = JSON.parse(readFileSync(path.resolve('vercel.json'), 'utf8')) as {
      crons: { path: string; schedule: string }[]
    }
    const schedule = vercel.crons.find((c) => c.path === '/api/cron/schedule')?.schedule
    expect(schedule).toBe(`0 ${DIGEST_SEND_UTC_HOUR} * * *`)
  })

  it('is 2:30 PM in Asia/Kolkata', () => {
    expect(formatDateTime(digestSendInstant(AT), 'time', 'Asia/Kolkata')).toBe('2:30 PM')
  })
})
