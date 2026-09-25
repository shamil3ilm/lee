import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TIMEZONE,
  detectBrowserTimezone,
  formatInTz,
  isMondayInTz,
  listTimezones,
  sentThisTzWeek,
} from '@/lib/ui/timezone'

describe('formatInTz', () => {
  it('renders the instant in the given IANA timezone', () => {
    // 2026-02-02T00:30:00Z is 04:30 in Asia/Dubai (UTC+4, no DST)
    const at = new Date('2026-02-02T00:30:00Z')
    const s = formatInTz(at, 'Asia/Dubai', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    expect(s).toContain('04:30')
  })

  it('falls back to local formatting on an invalid tz', () => {
    const at = new Date('2026-02-02T00:30:00Z')
    // Should not throw, just returns some formatted string.
    expect(typeof formatInTz(at, 'Not/A_Real_Zone')).toBe('string')
  })
})

describe('isMondayInTz', () => {
  it('true when the local day is Monday, false otherwise', () => {
    // 2026-02-02T20:00:00Z → 00:00 Tue in Asia/Dubai (UTC+4). NOT Monday-local.
    expect(isMondayInTz('Asia/Dubai', new Date('2026-02-02T20:00:00Z'))).toBe(false)
    // 2026-02-02T09:00:00Z → 13:00 Mon in Asia/Dubai. Monday-local.
    expect(isMondayInTz('Asia/Dubai', new Date('2026-02-02T09:00:00Z'))).toBe(true)
    // 2026-02-01T22:00:00Z → 02:00 Mon in Asia/Dubai. Monday-local (server
    // still thinks it's Sunday). The whole point of this helper.
    expect(isMondayInTz('Asia/Dubai', new Date('2026-02-01T22:00:00Z'))).toBe(true)
  })

  it('UTC tz agrees with getUTCDay', () => {
    expect(isMondayInTz('UTC', new Date('2026-02-02T09:00:00Z'))).toBe(true)
    expect(isMondayInTz('UTC', new Date('2026-02-03T09:00:00Z'))).toBe(false)
  })
})

describe('sentThisTzWeek', () => {
  it('null sentAt → false', () => {
    expect(sentThisTzWeek(null, 'Asia/Dubai')).toBe(false)
  })

  it('sent this Monday-local → true when called Thursday-local', () => {
    // Monday 08:00 local (Asia/Dubai UTC+4) → 04:00Z
    const monday = new Date('2026-02-02T04:00:00Z')
    // Thursday 09:00 local → 05:00Z
    const thursday = new Date('2026-02-05T05:00:00Z')
    expect(sentThisTzWeek(monday, 'Asia/Dubai', thursday)).toBe(true)
  })

  it('sent previous Sunday-local → false on the following Monday', () => {
    // Sunday 20:00 local → 16:00Z
    const lastSunday = new Date('2026-02-01T16:00:00Z')
    // Monday 09:00 local → 05:00Z
    const nextMonday = new Date('2026-02-02T05:00:00Z')
    expect(sentThisTzWeek(lastSunday, 'Asia/Dubai', nextMonday)).toBe(false)
  })
})

describe('listTimezones + detectBrowserTimezone', () => {
  it('returns a non-empty list of IANA timezone ids', () => {
    const tzs = listTimezones()
    expect(tzs.length).toBeGreaterThan(0)
    // Every real IANA tz list should contain at least these anchors.
    expect(tzs).toContain('Asia/Dubai')
    expect(tzs).toContain('Europe/London')
  })

  it('detectBrowserTimezone returns a string, defaulting when unavailable', () => {
    const tz = detectBrowserTimezone()
    expect(typeof tz).toBe('string')
    expect(tz.length).toBeGreaterThan(0)
    expect(tz).not.toBe('')
    // Sanity — either the runtime tz or the fallback.
    expect(tz === DEFAULT_TIMEZONE || tz.includes('/') || tz === 'UTC').toBe(true)
  })
})
