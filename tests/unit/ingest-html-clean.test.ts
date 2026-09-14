import { describe, it, expect } from 'vitest'
import { extractMainText } from '@/lib/ingest/html-clean'

describe('extractMainText', () => {
  it('returns text stripped of scripts and styles', () => {
    const html = `<html><head><style>.a{}</style><script>x</script></head><body><h1>Senior Engineer</h1><p>We are hiring.</p><script>y</script></body></html>`
    const text = extractMainText(html)
    expect(text).toContain('Senior Engineer')
    expect(text).toContain('We are hiring')
    expect(text).not.toContain('x')
    expect(text).not.toContain('y')
  })

  it('collapses whitespace', () => {
    const html = `<p>a   \n\n\n b</p>`
    expect(extractMainText(html)).toBe('a b')
  })
})
