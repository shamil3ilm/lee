import { describe, expect, it } from 'vitest'
import {
  brandLabel,
  detectLookalike,
  editDistance,
  findKnownCompany,
  hostOf,
  isFreemail,
  isJobPlatform,
  registrableDomain,
  skeleton,
} from '@/lib/scam/domains'

describe('hostOf', () => {
  it.each([
    ['https://www.Acme.com/jobs?id=1', 'acme.com'],
    ['acme.com', 'acme.com'],
    ['hr@acme.co.in', 'acme.co.in'],
    ['mailto:hr@acme.com', 'acme.com'],
    ['https://careers.acme.com:8443/x', 'careers.acme.com'],
    ['https://xn--mazon-3ve.com/jobs', 'аmazon.com'],
  ])('%s → %s', (input, host) => {
    expect(hostOf(input)).toBe(host)
  })

  it.each(['', '   ', 'not a host', 'https://', 'localhost'])('rejects %j', (v) => {
    expect(hostOf(v)).toBeNull()
  })
})

describe('registrable domain + brand label', () => {
  it('handles multi-part suffixes', () => {
    expect(registrableDomain('careers.acme.co.in')).toBe('acme.co.in')
    expect(registrableDomain('jobs.acme.com')).toBe('acme.com')
    expect(brandLabel('careers.amazon.co.uk')).toBe('amazon')
    expect(brandLabel('noon.com')).toBe('noon')
  })
})

describe('lists', () => {
  it('knows free-mail and job platforms', () => {
    expect(isFreemail('gmail.com')).toBe(true)
    expect(isFreemail('rediffmail.com')).toBe(true)
    expect(isFreemail('acme.com')).toBe(false)
    expect(isJobPlatform('boards.greenhouse.io')).toBe(true)
    expect(isJobPlatform('acme.wd5.myworkdayjobs.com')).toBe(true)
    expect(isJobPlatform('naukri.com')).toBe(true)
    expect(isJobPlatform('greenhouse.io.evil.com')).toBe(false)
  })

  it('matches well-known companies by leading words only', () => {
    expect(findKnownCompany('Amazon Development Centre India Pvt Ltd')?.domains).toContain('amazon.jobs')
    expect(findKnownCompany('TCS')?.domains).toContain('tcs.com')
    expect(findKnownCompany('Tata Consultancy Services Limited')?.domains).toContain('tcs.com')
    expect(findKnownCompany('Noonday Labs')).toBeNull()
    expect(findKnownCompany('Acme')).toBeNull()
  })
})

describe('homoglyph skeleton + edit distance', () => {
  it('maps confusables to the same skeleton', () => {
    expect(skeleton('аmаzоn')).toBe(skeleton('amazon')) // Cyrillic а/о
    expect(skeleton('arnazon')).toBe(skeleton('amazon')) // rn → m
    expect(skeleton('paypa1')).toBe(skeleton('paypal')) // 1 → l
    expect(skeleton('g00gle')).toBe(skeleton('google')) // 0 → o
    expect(skeleton('wipro')).not.toBe(skeleton('infosys'))
  })

  it('counts transpositions as one edit', () => {
    expect(editDistance('stripe', 'stirpe')).toBe(1)
    expect(editDistance('infosys', 'infosis')).toBe(1)
    expect(editDistance('abc', 'abc')).toBe(0)
    expect(editDistance('', 'abc')).toBe(3)
    expect(editDistance('kitten', 'sitting')).toBe(3)
  })
})

describe('detectLookalike', () => {
  const amazon = ['amazon.com', 'amazon.jobs', 'amazon.in']

  it.each([
    ['аmazon.com', 'homoglyph'],
    ['arnazon.in', 'homoglyph'],
    ['amazom.com', 'edit_distance'],
    ['amazon-careers.com', 'brand_in_label'],
    ['amazonhiring.co', 'brand_in_label'],
    ['amazon.co', 'tld_swap'],
  ])('%s is a %s lookalike of Amazon', (host, kind) => {
    expect(detectLookalike(host, amazon)?.kind).toBe(kind)
  })

  it.each(['amazon.com', 'www.amazon.jobs', 'hiring.amazon.com', 'greenhouse.io', 'deloitte.com'])(
    '%s is not a lookalike',
    (host) => {
      expect(detectLookalike(host, amazon)).toBeNull()
    },
  )

  it('does not flag short unrelated brands by edit distance', () => {
    expect(detectLookalike('noor.com', ['noon.com'])).toBeNull()
  })

  it('flags filler tokens around a short brand only when hyphenated', () => {
    expect(detectLookalike('tcs-careers.in', ['tcs.com'])?.kind).toBe('brand_in_label')
    expect(detectLookalike('tcsfoods.com', ['tcs.com'])).toBeNull()
  })
})
