import { afterEach, describe, expect, it, vi } from 'vitest'
import { readPastedPost } from '@/lib/linkedin-posts/paste'
import { bookmarkletHref, bookmarkletSource } from '@/lib/linkedin-posts/bookmarklet'
import { replyFactLock, templateReply, lockedReply, type ReplyFacts } from '@/lib/linkedin-posts/draft'
import { buildHiringPostPrompts } from '@/lib/discovery/ai-mode/hiring-posts'
import { EMPTY_PREFS } from '@/lib/discovery/relevance/prefs'

// Synthetic posts and people only.

const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
  throw new Error('no network while reading a paste')
})
afterEach(() => expect(fetchSpy).not.toHaveBeenCalled())

const COPIED = `Layla Haddad
• 2nd
Talent Acquisition Lead at Dune Soft Systems
2h •
We're hiring a Laravel Developer in Dubai! 3+ years with PHP and MySQL.
Send your CV to careers@dunesoft.example #hiring
24 reactions
https://www.linkedin.com/posts/layla-haddad_hiring-activity-7300000000000000001-AbCd?utm_source=share`

describe('readPastedPost', () => {
  it('reads copied post text: poster, headline, role, place, contact, hiring reasons', () => {
    const c = readPastedPost(COPIED)!
    expect(c).toMatchObject({
      linkOnly: false,
      postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7300000000000000001/',
      posterName: 'Layla Haddad',
      posterHeadline: 'Talent Acquisition Lead at Dune Soft Systems',
      role: 'Laravel Developer',
      company: 'Dune Soft Systems',
      location: 'Dubai, UAE',
      hiring: true,
      risk: null,
    })
    expect(c.contact.emails).toEqual(['careers@dunesoft.example'])
    expect(c.text).not.toMatch(/2nd|reactions|linkedin\.com|Layla Haddad/)
  })

  it('treats a post link alone as link-only (asks for the text, never fetches)', () => {
    const c = readPastedPost('https://www.linkedin.com/feed/update/urn:li:activity:7300000000000000011/?trk=x')!
    expect(c).toMatchObject({ linkOnly: true, text: '', hiring: false, postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7300000000000000011/' })
  })

  it('recognises a hiring post without a link', () => {
    expect(readPastedPost('مطلوب مطور PHP Laravel للعمل في الكويت. أرسل سيرتك الذاتية إلى jobs@kwtech.example')?.hiring).toBe(true)
  })

  it('leaves other pastes to the openings reader (lists of links, ordinary text)', () => {
    expect(readPastedPost('Backend Engineer at Acme (Dubai) https://jobs.lever.co/acme/1\nhttps://boards.greenhouse.io/x/jobs/123\nhttps://example.com/3')).toBeNull()
    expect(readPastedPost('Some notes about my week.')).toBeNull()
  })

  it('runs Scam Shield on the post text', () => {
    const c = readPastedPost("We're hiring for Dubai! Visa + job guaranteed. Pay the visa processing fee of AED 2,500 on WhatsApp to get the offer letter.")!
    expect(c.risk?.level).toMatch(/Caution|Likely scam/)
    expect(c.risk?.labels.join(' ')).toMatch(/Gulf agency charges|Offer letter only after you pay/)
  })
})

describe('bookmarklet', () => {
  it('posts the selection and page URL in a form, never in a URL', () => {
    const src = bookmarkletSource('https://lee.example/', 'user.1.sig')
    expect(src).toContain("f.method='post'")
    expect(src).toContain('"https://lee.example/api/capture"')
    expect(src).toContain('window.getSelection')
    expect(src).toContain("['url',location.href]")
    expect(src).not.toMatch(/\?text=|\?url=|location\.href\s*=|fetch\(|XMLHttpRequest|querySelector/)
    expect(bookmarkletHref('https://lee.example', 'k').startsWith('javascript:')).toBe(true)
  })

  it('escapes the key and origin safely', () => {
    const src = bookmarkletSource("https://lee.example/'+alert(1)+'", "k');alert(1);//")
    expect(() => new Function(src)).not.toThrow()
    expect(src).toContain(JSON.stringify("k');alert(1);//"))
  })
})

const FACTS: ReplyFacts = {
  channel: 'linkedin',
  post: { posterName: 'Layla Haddad', role: 'Laravel Developer', company: 'Dune Soft Systems', location: 'Dubai, UAE', snippet: "We're hiring a Laravel Developer in Dubai. 3+ years.", email: null },
  candidate: { name: 'Sam Example', headline: 'Backend developer', skills: ['Laravel', 'MySQL'], highlight: 'Built payment webhooks in Laravel', currentRole: 'Backend Developer at Example Fintech', variantName: 'GCC backend' },
  regionFacts: { region: 'gcc', lines: [{ label: 'Visa status', value: 'Visit visa' }, { label: 'Notice period', value: '30 days' }] },
}

describe('reply draft fact lock', () => {
  it('the template passes its own lock and stays under the DM limit', () => {
    const t = templateReply(FACTS)
    expect(replyFactLock(t.body, FACTS)).toEqual([])
    expect(t.body.length).toBeLessThanOrEqual(700)
    expect(t.body).toContain('Visa status: Visit visa.')
  })

  it('rejects invented numbers, skills, emails, links and claims', () => {
    const issues = replyFactLock('I have 7 years of Kubernetes. Write to me@x.example or https://x.example. Salary negotiable.', FACTS)
    expect(issues).toEqual(expect.arrayContaining(['number "7"', 'skill "kubernetes"', 'email "me@x.example"', 'link "https://x.example."', 'claim "7 years"']))
    expect(replyFactLock('Salary is negotiable and I am available immediately.', FACTS)).toEqual(['claim "Salary"'])
  })

  it('keeps an AI rewrite that stays within the facts', () => {
    const ok = lockedReply(FACTS, { body: 'Hi Layla, I saw your post about the Laravel Developer role in Dubai. I am Sam Example, Backend developer. May I send you my CV?\nSam Example' })
    expect(ok.origin).toBe('ai')
    const bad = lockedReply({ ...FACTS, regionFacts: null }, { body: 'Hi Layla, my notice period is 30 days.' })
    expect(bad.origin).toBe('template')
  })
})

describe('AI Mode hiring-post prompts', () => {
  it('ask for post links and are built from preferences only', () => {
    const prompts = buildHiringPostPrompts({ ...EMPTY_PREFS, regions: ['AE', 'KW'], include: ['payments'] }, [])
    expect(prompts.map((p) => p.id)).toEqual(['posts-gcc', 'posts-domain'])
    expect(prompts[0]!.prompt).toMatch(/LinkedIn posts/)
    expect(prompts[0]!.prompt).toMatch(/linkedin\.com\/posts/)
    expect(prompts[0]!.prompt).toMatch(/United Arab Emirates|UAE/)
    expect(prompts[1]!.prompt).toContain('payments')
  })

  it('scrubs personal identifiers from free-text preferences', () => {
    const prompts = buildHiringPostPrompts({ ...EMPTY_PREFS, customRoles: ['Laravel developer like Sam Example'] }, ['Sam Example'])
    expect(prompts[0]!.prompt).not.toContain('Sam Example')
  })
})
