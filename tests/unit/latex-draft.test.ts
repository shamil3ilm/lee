import { describe, it, expect } from 'vitest'
import { DRAFT_GRAPHICX, withDraftMode } from '@/lib/latex/draft'

describe('withDraftMode', () => {
  it('prepends the graphicx draft option without adding a line', () => {
    const src = '\\documentclass{article}\n\\usepackage{graphicx}\n'
    const out = withDraftMode(src)
    expect(out.startsWith(`${DRAFT_GRAPHICX}\\documentclass`)).toBe(true)
    expect(out.split('\n')).toHaveLength(src.split('\n').length)
  })
})
