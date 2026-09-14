import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/env', () => ({ env: { ALLOWED_EMAIL: 'shamil@example.com' } }))

import { isAllowedEmail } from '@/lib/auth/allowed-email'

describe('isAllowedEmail', () => {
  it('accepts the allowed email', () => expect(isAllowedEmail('shamil@example.com')).toBe(true))
  it('is case-insensitive', () => expect(isAllowedEmail('Shamil@Example.com')).toBe(true))
  it('rejects other emails', () => expect(isAllowedEmail('other@example.com')).toBe(false))
  it('rejects empty', () => expect(isAllowedEmail('')).toBe(false))
  it('rejects null/undefined', () => {
    expect(isAllowedEmail(null)).toBe(false)
    expect(isAllowedEmail(undefined)).toBe(false)
  })
})
