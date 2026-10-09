import { describe, expect, it } from 'vitest'
import { extractPostFacts, guessRole } from '@/lib/linkedin-posts/extract'

// Synthetic posts only (invented companies on .example domains).

describe('extractPostFacts', () => {
  it('reads role, place (region normaliser), employer and email from a typical GCC post', () => {
    const f = extractPostFacts("We're hiring a Laravel Developer in Dubai! 3+ years. Send your CV to careers@dunesoft.example #hiring")
    expect(f.role).toBe('Laravel Developer')
    expect(f.location).toBe('Dubai, UAE')
    expect(f.regionIds).toEqual(expect.arrayContaining(['dubai', 'ae', 'gcc']))
    expect(f.contact.emails).toEqual(['careers@dunesoft.example'])
    expect(f.contact.dm).toBe(false)
    expect(f.companyDomain).toBe('dunesoft.example')
    expect(f.company).toBe('Dunesoft')
  })

  it('names the employer from "<Company> is hiring" and the apply link', () => {
    const f = extractPostFacts('Join our team! Example Pay is hiring a Payments Engineer in Abu Dhabi. Apply here: https://careers.examplepay.example/jobs/42.')
    expect(f.company).toBe('Example Pay')
    expect(f.role).toBe('Payments Engineer')
    expect(f.location).toBe('Abu Dhabi, UAE')
    expect(f.contact.applyLinks).toEqual(['https://careers.examplepay.example/jobs/42'])
  })

  it('takes the employer from the poster headline ("… at Company")', () => {
    const f = extractPostFacts('Looking for a Backend Engineer (Node.js) in Riyadh. DM me.', { headline: 'Engineering Manager at Falcon Systems' })
    expect(f.company).toBe('Falcon Systems')
    expect(f.role).toBe('Backend Engineer (Node.js)')
    expect(f.contact.dm).toBe(true)
    expect(f.location).toBe('Riyadh, Saudi Arabia')
  })

  it('does not take a place for the employer ("at Dubai Internet City")', () => {
    const f = extractPostFacts('#hiring Backend Developer (Go) at Dubai Internet City. Hybrid.')
    expect(f.company).toBeNull()
    expect(f.remote).toBe('hybrid')
  })

  it('keeps freemail addresses but never derives a company from them', () => {
    const f = extractPostFacts('Urgent requirement: PHP Developer in Kuwait. Send CV to recruiter.kw@gmail.com')
    expect(f.contact.emails).toEqual(['recruiter.kw@gmail.com'])
    expect(f.companyDomain).toBeNull()
    expect(f.company).toBeNull()
    expect(f.location).toContain('Kuwait')
  })

  it('reads Arabic posts', () => {
    const f = extractPostFacts('مطلوب مطور PHP Laravel للعمل في الكويت. أرسل سيرتك الذاتية إلى jobs@kwtech.example')
    expect(f.role).toBe('PHP Laravel Developer')
    expect(f.location).toContain('Kuwait')
    expect(f.contact.emails).toEqual(['jobs@kwtech.example'])
  })

  it('unwraps LinkedIn outbound links, drops LinkedIn pages, flags WhatsApp', () => {
    const f = extractPostFacts(
      'Hiring a QA Engineer. Apply: https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Fjobs.example%2Fqa&urlhash=x ' +
        'see https://www.linkedin.com/in/someone/ WhatsApp only',
    )
    expect(f.contact.applyLinks).toEqual(['https://jobs.example/qa'])
    expect(f.contact.chat).toBe(true)
  })

  it('caps lists and ignores text past 5,000 characters', () => {
    const emails = Array.from({ length: 6 }, (_, i) => `a${i}@x${i}.example`).join(' ')
    expect(extractPostFacts(`Hiring a developer. ${emails}`).contact.emails).toHaveLength(3)
    expect(extractPostFacts(`${'x '.repeat(3_000)} hr@late.example`).contact.emails).toEqual([])
  })
})

describe('guessRole', () => {
  it.each([
    ['Urgent requirement: PHP Developer (Laravel) for our client', 'PHP Developer (Laravel)'],
    ['Position: Full Stack Developer\nLocation: Doha', 'Full Stack Developer'],
    ['We are looking for a talented Senior Backend Engineer to join', 'Senior Backend Engineer'],
    ['Job opening for a DevOps Engineer at Oasis Cloud', 'DevOps Engineer'],
  ])('%s → %s', (text, role) => {
    expect(guessRole(text)).toBe(role)
  })

  it('returns null when no role is named', () => {
    expect(guessRole("We're hiring! DM me.")).toBeNull()
  })
})
