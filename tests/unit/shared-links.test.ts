import { describe, expect, it } from 'vitest'
import { withSharedLinks } from '@/lib/ai/prompts/shared-links'
import { parseLinkIds } from '@/lib/profile/shared-links'
import { COVER_LETTER_PROMPT_VERSION } from '@/lib/ai/prompts/cover-letter'

describe('links in drafts', () => {
  it('leaves the prompt unchanged without links', () => {
    expect(withSharedLinks('PROMPT', undefined)).toBe('PROMPT')
    expect(withSharedLinks('PROMPT', [])).toBe('PROMPT')
  })

  it('appends only the confirmed links, verbatim', () => {
    const p = withSharedLinks('PROMPT', [{ label: 'Case study: payment approvals', url: 'https://example.com/cs' }])
    expect(p).toContain('--- LINKS THE CANDIDATE CHOSE TO SHARE ---\n- Case study: payment approvals: https://example.com/cs')
    expect(p).toContain('never invent other links')
    expect(COVER_LETTER_PROMPT_VERSION).toBe('1.2.0')
  })

  it('accepts only well-formed link ids from a request body', () => {
    expect(parseLinkIds({ linkIds: ['abc-1', 'DROP TABLE', 5, 'x'] })).toEqual(['abc-1', 'x'])
    expect(parseLinkIds(null)).toEqual([])
    expect(parseLinkIds({ linkIds: 'abc' })).toEqual([])
  })
})
