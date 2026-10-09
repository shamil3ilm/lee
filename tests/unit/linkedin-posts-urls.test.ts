import { afterEach, describe, expect, it, vi } from 'vitest'
import { canonicalPostUrl, canonicalProfileUrl, unwrapLinkedInRedirect } from '@/lib/linkedin-posts/urls'

// Offline only: every helper must work without a single request.
const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
  throw new Error('network is not allowed in the LinkedIn URL canonicaliser')
})

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled()
})

describe('canonicalPostUrl', () => {
  it('rebuilds feed URNs and strips tracking / recipient tokens', () => {
    const r = canonicalPostUrl(
      'https://www.linkedin.com/comm/feed/update/urn:li:activity:7300000000000000001/?midToken=AQ123&midSig=0x&trk=eml-email_notification&lipi=urn%3Ali%3Apage&otpToken=secret',
    )
    expect(r).toEqual({ key: 'activity:7300000000000000001', url: 'https://www.linkedin.com/feed/update/urn:li:activity:7300000000000000001/' })
  })

  it('reads an encoded URN, share and ugcPost kinds', () => {
    expect(canonicalPostUrl('https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A7311111111111111111')?.key).toBe('share:7311111111111111111')
    expect(canonicalPostUrl('https://linkedin.com/feed/update/urn:li:ugcPost:7322222222222222222/')?.url).toBe(
      'https://www.linkedin.com/feed/update/urn:li:ugcPost:7322222222222222222/',
    )
  })

  it('turns /posts/<slug>-activity-<id>-xxxx into the URN form (one key per post)', () => {
    const a = canonicalPostUrl('https://www.linkedin.com/posts/jane-doe_hiring-laravel-activity-7300000000000000001-AbCd?utm_source=share&utm_medium=member_desktop')
    expect(a?.key).toBe('activity:7300000000000000001')
    expect(a?.url).toBe('https://www.linkedin.com/feed/update/urn:li:activity:7300000000000000001/')
  })

  it('keeps a /posts/ slug without a readable id, minus the query', () => {
    expect(canonicalPostUrl('https://ae.linkedin.com/posts/acme_jobs-post?trk=x')).toEqual({
      key: 'slug:acme_jobs-post',
      url: 'https://www.linkedin.com/posts/acme_jobs-post/',
    })
  })

  it('unwraps a click tracker carrying the post link', () => {
    const wrapped = `https://click.example/track?url=${encodeURIComponent('https://www.linkedin.com/feed/update/urn:li:activity:7300000000000000009/?trk=a')}`
    expect(canonicalPostUrl(wrapped)?.key).toBe('activity:7300000000000000009')
  })

  it('rejects non-post and non-LinkedIn links and look-alike hosts', () => {
    expect(canonicalPostUrl('https://www.linkedin.com/jobs/view/1234567890/')).toBeNull()
    expect(canonicalPostUrl('https://www.linkedin.com/in/jane-doe/')).toBeNull()
    expect(canonicalPostUrl('https://evil-linkedin.com/feed/update/urn:li:activity:7300000000000000001')).toBeNull()
    expect(canonicalPostUrl('https://linkedin.com.evil.example/feed/update/urn:li:activity:7300000000000000001')).toBeNull()
    expect(canonicalPostUrl('javascript:alert(1)')).toBeNull()
    expect(canonicalPostUrl('not a url')).toBeNull()
  })
})

describe('canonicalProfileUrl', () => {
  it('canonicalises member profile links from emails', () => {
    expect(canonicalProfileUrl('https://www.linkedin.com/comm/in/Jane-Doe-a1b2?midToken=x&trk=y')).toBe('https://www.linkedin.com/in/jane-doe-a1b2/')
    expect(canonicalProfileUrl('https://www.linkedin.com/company/acme/')).toBeNull()
  })
})

describe('unwrapLinkedInRedirect', () => {
  it('returns the external target of an outbound wrapper, else the link', () => {
    expect(unwrapLinkedInRedirect('https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Fjobs.example%2Fa&urlhash=1')).toBe('https://jobs.example/a')
    expect(unwrapLinkedInRedirect('https://jobs.example/b')).toBe('https://jobs.example/b')
  })
})
