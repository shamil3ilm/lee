import { describe, expect, it } from 'vitest'
import { clientErrorSchema, toClientErrorReport } from '@/lib/errors/client-report'
import { startsNavigation } from '@/components/nav/navigation-progress'

describe('client error reports', () => {
  it('sends only the digest for server errors (the message is already logged)', () => {
    const report = toClientErrorReport({ message: 'secret detail', digest: 'abc123' }, '/applications/1', 'authed')
    expect(report).toEqual({ boundary: 'authed', route: '/applications/1', digest: 'abc123' })
    expect(clientErrorSchema.safeParse(report).success).toBe(true)
  })

  it('sends a capped message for browser errors without a digest', () => {
    const report = toClientErrorReport({ message: 'x'.repeat(900) }, '/', 'app')
    expect(report.message).toHaveLength(500)
    expect(report.digest).toBeUndefined()
    expect(clientErrorSchema.safeParse(report).success).toBe(true)
  })

  it('rejects oversized or unknown fields', () => {
    expect(clientErrorSchema.safeParse({ route: '/', boundary: 'nope' }).success).toBe(false)
    expect(clientErrorSchema.safeParse({ route: '/'.repeat(201), boundary: 'app' }).success).toBe(false)
  })
})

describe('navigation progress', () => {
  const here = { origin: 'http://localhost', pathname: '/todos', search: '' }
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }
  const anchor = (href: string, attrs: { target?: string; download?: boolean } = {}) => ({
    href: new URL(href, 'http://localhost/todos').href,
    target: attrs.target ?? '',
    hasAttribute: (name: string) => name === 'download' && Boolean(attrs.download),
  })

  it('starts for a plain click on an in-app link to another URL', () => {
    expect(startsNavigation(click, anchor('/discoveries'), here)).toBe(true)
    expect(startsNavigation(click, anchor('/todos?filter=week'), here)).toBe(true)
  })

  it('ignores same-page, hash, external, new-tab, download and modified clicks', () => {
    expect(startsNavigation(click, anchor('/todos'), here)).toBe(false)
    expect(startsNavigation(click, anchor('/todos#done'), here)).toBe(false)
    expect(startsNavigation(click, anchor('https://example.com/'), here)).toBe(false)
    expect(startsNavigation(click, anchor('/a', { target: '_blank' }), here)).toBe(false)
    expect(startsNavigation(click, anchor('/a.pdf', { download: true }), here)).toBe(false)
    expect(startsNavigation({ ...click, metaKey: true }, anchor('/a'), here)).toBe(false)
    expect(startsNavigation({ ...click, button: 1 }, anchor('/a'), here)).toBe(false)
    expect(startsNavigation(click, null, here)).toBe(false)
  })
})
