import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { companyAndLocation, isLocationLine, parseAlertEmail, parseAlertHtml, parseAlertText } from '@/lib/email-alerts/parse'
import { parseGccLocation } from '@/lib/discovery/relevance/location'

// SYNTHETIC GCC alert variants (tests/fixtures/email-alerts/gcc). Each
// stresses a layout the original fixtures did not: labelled lines, Arabic
// cards, wrapped links, plain-text parts, Glassdoor age chips.
const fx = (name: string): string => readFileSync(join(__dirname, '../fixtures/email-alerts/gcc', name), 'utf8')

describe('Bayt — cards, wrapped links, Arabic', () => {
  const jobs = parseAlertHtml('bayt', fx('bayt-cards.html'))

  it('finds every job once (Apply now repeats the first; listing links are skipped)', () => {
    expect(jobs.map((j) => j.jobKey)).toEqual(['5123401', '5123488', '5123499'])
  })

  it('splits "Company · City, Country" and drops labelled noise', () => {
    expect(jobs[0]).toMatchObject({
      title: 'Backend Developer (Laravel)',
      company: 'Example Payments LLC',
      location: 'Dubai, United Arab Emirates',
      url: 'https://www.bayt.com/en/uae/jobs/backend-developer-laravel-5123401/',
    })
  })

  it('unwraps a click-tracker link to the canonical posting', () => {
    expect(jobs[1]).toMatchObject({ title: 'PHP Developer', company: 'Example Retail Co', location: 'Riyadh - Saudi Arabia', canonical: true })
    expect(jobs[1]!.url).toBe('https://www.bayt.com/en/saudi-arabia/jobs/php-developer-5123488/')
  })

  it('reads an Arabic card: company and Arabic location', () => {
    expect(jobs[2]).toMatchObject({ title: 'مطور ويب متكامل', company: 'شركة مثال للتقنية', location: 'دبي، الإمارات العربية المتحدة' })
    expect(parseGccLocation(jobs[2]!.location)).toMatchObject({ countryCode: 'AE', city: 'Dubai' })
  })
})

describe('NaukriGulf — labelled lines before the location', () => {
  const jobs = parseAlertHtml('naukrigulf', fx('naukrigulf-detailed.html'))

  it('skips Experience / Salary / Industry / Nationality lines', () => {
    expect(jobs).toHaveLength(3)
    expect(jobs[0]).toMatchObject({ jobKey: '261008000101', title: 'Laravel Developer', company: 'Example Tech WLL', location: 'Doha, Qatar' })
    expect(jobs[1]).toMatchObject({ company: 'Example Bank K.S.C.', location: 'Kuwait City - Kuwait' })
    expect(jobs[2]).toMatchObject({ company: 'Example Fintech B.S.C.', location: 'Manama, Bahrain' })
  })
})

describe('GulfTalent — plain-text part', () => {
  it('reads title / company / location blocks with bare and labelled URLs', () => {
    const jobs = parseAlertEmail({ site: 'gulftalent', html: null, text: fx('gulftalent.txt') })
    expect(jobs).toHaveLength(2)
    expect(jobs[0]).toMatchObject({ jobKey: '512301', title: 'Software Developer - .NET', company: 'Example Holding', location: 'Abu Dhabi, United Arab Emirates' })
    expect(jobs[1]).toMatchObject({ jobKey: '512399', title: 'Backend Engineer', company: 'Example Telecom SAOG', location: 'Muscat, Oman' })
    expect(jobs[1]!.url).toBe('https://www.gulftalent.com/oman/jobs/backend-engineer-512399')
  })
})

describe('Glassdoor — age, rating and salary chips', () => {
  const jobs = parseAlertHtml('glassdoor', fx('glassdoor-ae.html'))

  it('keeps company and city, never "3d" or "30d+"', () => {
    expect(jobs[0]).toMatchObject({ jobKey: '1011000000001', company: 'Example Co', location: 'Dubai' })
    expect(jobs[1]).toMatchObject({ jobKey: '1011000000002', company: 'Example SA', location: 'Jeddah' })
  })
})

describe('LinkedIn — Arabic interface', () => {
  const jobs = parseAlertHtml('linkedin', fx('linkedin-ae-arabic.html'))

  it('splits an Arabic "Company · Location" line and reads an Arabic location line', () => {
    expect(jobs[0]).toMatchObject({ jobKey: '4123400001', company: 'شركة مثال', location: 'دبي، الإمارات العربية المتحدة (عن بُعد)' })
    expect(jobs[1]).toMatchObject({ company: 'Example KSA', location: 'الرياض، المملكة العربية السعودية' })
  })
})

describe('isLocationLine — GCC spellings', () => {
  it.each([
    'Dubai - UAE', 'Kuwait City - Kuwait', 'Al Khobar, Saudi Arabia', 'Makkah', 'Lusail, Qatar', 'Salmiya',
    'Muharraq, Bahrain', 'Salalah, Oman', 'Al Ain', 'دبي', 'الرياض، المملكة العربية السعودية', 'Remote in UAE',
  ])('%s is a location', (line) => {
    expect(isLocationLine(line)).toBe(true)
  })

  it.each(['Dubai Holding', 'Example Payments LLC', 'شركة مثال للتقنية', 'Abu Dhabi Commercial Bank'])('%s is not a location', (line) => {
    expect(isLocationLine(line)).toBe(false)
  })

  it('labelled lines are noise, not company', () => {
    expect(companyAndLocation(['Experience: 2 - 5 Years', 'Example Co', 'Doha'])).toEqual({ company: 'Example Co', location: 'Doha' })
    expect(companyAndLocation(['Example Co', '30d+', 'Riyadh'])).toEqual({ company: 'Example Co', location: 'Riyadh' })
  })
})

describe('plain-text Indeed AE with Arabic city', () => {
  it('reads the Arabic location line', () => {
    const text = [
      'Backend Developer',
      'Example Co - دبي',
      'https://ae.indeed.com/rc/clk?jk=0123456789abcdef&from=ja',
    ].join('\n')
    const [job] = parseAlertText('indeed', text)
    expect(job).toMatchObject({ title: 'Backend Developer', company: 'Example Co', location: 'دبي' })
  })
})
