import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { looksLikePostEmail, parseLinkedInPostEmail, posterFromSubject } from '@/lib/linkedin-posts/email-parse'
import { verifyLinkedInSender, linkedInPostQuery } from '@/lib/linkedin-posts/sender'
import { classifyHiringPost } from '@/lib/linkedin-posts/classify'

// SYNTHETIC notification emails (tests/fixtures/linkedin-posts/README.md).
const fx = (name: string): string => readFileSync(join(__dirname, '../fixtures/linkedin-posts', name), 'utf8')

const pass = (domain: string): string =>
  `mx.google.com; dkim=pass header.i=@${domain} header.s=s1; spf=pass smtp.mailfrom=x@${domain}; dmarc=pass (p=REJECT) header.from=${domain}`

describe('parseLinkedInPostEmail', () => {
  it('reads a single "X posted" email: poster, headline, snippet, canonical link', () => {
    const r = parseLinkedInPostEmail({ subject: "Layla Haddad posted: We're hiring a Laravel Developer…", html: fx('single-hiring.html') })
    expect(r.kind).toBe('single')
    expect(r.posts).toHaveLength(1)
    const p = r.posts[0]!
    expect(p.url).toBe('https://www.linkedin.com/feed/update/urn:li:activity:7300000000000000001/')
    expect(p.posterName).toBe('Layla Haddad')
    expect(p.posterHeadline).toBe('Talent Acquisition Lead at Dune Soft Systems')
    expect(p.posterUrl).toBe('https://www.linkedin.com/in/layla-haddad-x1y2/')
    expect(p.snippet).toContain("We're hiring a Laravel Developer in Dubai")
    // Chrome and footers are not post text; no tracking token survives.
    expect(p.snippet).not.toMatch(/reactions|View post|Unsubscribe|intended for|2h/)
    expect(JSON.stringify(p)).not.toMatch(/midToken|otpToken|trk=/)
  })

  it('reads every post of a digest, including Arabic', () => {
    const r = parseLinkedInPostEmail({ subject: 'Top posts for you', html: fx('digest.html') })
    expect(r.kind).toBe('digest')
    expect(r.posts.map((p) => p.key)).toEqual(['activity:7300000000000000002', 'activity:7300000000000000003', 'ugcPost:7300000000000000004'])
    expect(r.posts.map((p) => p.posterName)).toEqual(['Ahmed Karim', 'Priya Nair', 'Noura Al-Salem'])
    expect(r.posts[0]!.posterHeadline).toBe('HR Manager at Gulf Staffing Partners')
    expect(r.posts[2]!.snippet).toContain('مطلوب مطور PHP Laravel')
    expect(r.posts.map((p) => classifyHiringPost(p.snippet).hiring)).toEqual([true, false, true])
  })

  it('reads a "shared a post" email: the sharer, their note and the shared text', () => {
    const r = parseLinkedInPostEmail({ subject: 'Omar Saleh shared a post', html: fx('shared.html') })
    expect(r.kind).toBe('shared')
    const p = r.posts[0]!
    expect(p.key).toBe('share:7300000000000000005')
    expect(p.posterName).toBe('Omar Saleh')
    expect(p.snippet).toContain('Example Pay is hiring a Payments Engineer')
    expect(classifyHiringPost(p.snippet).hiring).toBe(true)
  })

  it('parses a post without hiring intent (the classifier, not the parser, drops it)', () => {
    const r = parseLinkedInPostEmail({ subject: 'Rahul Menon posted', html: fx('not-hiring.html') })
    expect(r.posts).toHaveLength(1)
    expect(classifyHiringPost(r.posts[0]!.snippet).hiring).toBe(false)
  })

  it('falls back to the plain-text part', () => {
    const r = parseLinkedInPostEmail({ subject: 'Fatima Rahman posted', html: null, text: fx('single-hiring.txt') })
    expect(r.posts).toHaveLength(1)
    const p = r.posts[0]!
    expect(p.posterName).toBe('Fatima Rahman')
    expect(p.posterHeadline).toBe('Recruiter at Pearl Tech Doha')
    expect(p.posterUrl).toBe('https://www.linkedin.com/in/fatima-rahman-qa/')
    expect(p.snippet).toContain('Position: Full Stack Developer')
    expect(p.snippet).not.toMatch(/Unsubscribe|View post/)
  })

  it('tolerates junk: no posts, not an exception', () => {
    expect(parseLinkedInPostEmail({ subject: 'Rahul posted', html: '<html><body><p>Nothing</p></body></html>' })).toEqual({ kind: 'other', posts: [] })
    expect(parseLinkedInPostEmail({ subject: null, html: '<<<not html', text: null }).posts).toEqual([])
  })

  it('caps the snippet at 1 KB', () => {
    const long = `We're hiring a PHP developer. ${'مطلوب '.repeat(400)}`
    const html = `<a href="https://www.linkedin.com/feed/update/urn:li:activity:7300000000000000010/">${long}</a>`
    const p = parseLinkedInPostEmail({ html }).posts[0]!
    expect(new TextEncoder().encode(p.snippet).length).toBeLessThanOrEqual(1000)
  })
})

describe('subject helpers', () => {
  it('reads the poster and recognises post notifications', () => {
    expect(posterFromSubject('Layla Haddad posted: We are hiring')).toBe('Layla Haddad')
    expect(posterFromSubject('Omar Saleh shared a post')).toBe('Omar Saleh')
    expect(looksLikePostEmail('Top posts for you')).toBe(true)
    expect(looksLikePostEmail('You appeared in 5 searches this week')).toBe(false)
  })

  it('searches LinkedIn post notifications, not job alerts', () => {
    expect(linkedInPostQuery(7)).toMatch(/^from:linkedin\.com newer_than:7d /)
    expect(linkedInPostQuery(7)).toContain('-subject:("job alert"')
  })
})

describe('verifyLinkedInSender', () => {
  it('accepts linkedin.com mail Google verified (DMARC or DKIM)', () => {
    expect(verifyLinkedInSender('notifications-noreply@linkedin.com', [pass('linkedin.com')])).toBe(true)
  })

  it('rejects a spoofed LinkedIn sender', () => {
    expect(verifyLinkedInSender('notifications-noreply@linkedin.com', [])).toBe(false)
    expect(verifyLinkedInSender('notifications-noreply@linkedin.com', ['mx.google.com; dkim=fail header.i=@linkedin.com; dmarc=fail header.from=linkedin.com'])).toBe(false)
    expect(verifyLinkedInSender('notifications-noreply@linkedin.com', ['evil.example; dkim=pass header.i=@linkedin.com'])).toBe(false)
    expect(verifyLinkedInSender('notifications@linkedin.com.evil.example', [pass('linkedin.com.evil.example')])).toBe(false)
  })

  it('rejects other verified senders', () => {
    expect(verifyLinkedInSender('alert@indeed.com', [pass('indeed.com')])).toBe(false)
  })
})
