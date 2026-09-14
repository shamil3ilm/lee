import { describe, it, expect, vi } from 'vitest'
import { logger } from '@/lib/logger'

describe('logger', () => {
  it('emits a JSON line with level, event, and ts', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.info('user_signin', { userId: 'u1' })
    expect(spy).toHaveBeenCalledOnce()
    const line = spy.mock.calls[0]![0] as string
    const parsed = JSON.parse(line)
    expect(parsed.level).toBe('info')
    expect(parsed.event).toBe('user_signin')
    expect(parsed.userId).toBe('u1')
    expect(typeof parsed.ts).toBe('string')
    spy.mockRestore()
  })
})
