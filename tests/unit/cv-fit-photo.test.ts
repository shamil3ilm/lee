import { describe, expect, it } from 'vitest'
import { photoAdvice, type PhotoJob } from '@/lib/cv-fit/photo/advice'
import { applyChannel } from '@/lib/cv-fit/photo/channel'
import { photoCountry } from '@/lib/cv-fit/photo/country'
import { employerKind } from '@/lib/cv-fit/photo/employer'
import { photoAction } from '@/lib/cv-fit/photo/variant'

const base: PhotoJob = { title: 'Software Engineer', companyName: 'Acme', location: '', descriptionMd: '', applyUrl: null }
const job = (over: Partial<PhotoJob>): PhotoJob => ({ ...base, ...over })

describe('photoCountry', () => {
  it.each([
    ['Dubai, UAE', 'gcc'],
    ['Riyadh, Saudi Arabia', 'gcc'],
    ['Doha, Qatar', 'gcc'],
    ['Kuwait City', 'gcc'],
    ['Manama, Bahrain', 'gcc'],
    ['Muscat, Oman', 'gcc'],
    ['New York, NY, USA', 'avoid'],
    ['London, UK', 'avoid'],
    ['Toronto, Canada', 'avoid'],
    ['Sydney, Australia', 'avoid'],
    ['Dublin, Ireland', 'avoid'],
    ['Amsterdam, Netherlands', 'avoid'],
    ['Bengaluru, India', 'india'],
    ['Berlin, Germany', 'dach'],
    ['Zurich, Switzerland', 'dach'],
    ['Vienna, Austria', 'dach'],
    ['Paris, France', 'europe'],
    ['', 'unknown'],
  ])('%s → %s', (location, kind) => {
    expect(photoCountry(job({ location })).kind).toBe(kind)
  })

  it('reads a remote posting as remote', () => {
    expect(photoCountry(job({ location: 'Remote', remoteType: 'remote' })).kind).toBe('remote')
  })
})

describe('employerKind', () => {
  it('uses the watch list sector and government tags', () => {
    expect(employerKind(job({ companyName: 'Dubai Careers (Dubai Government)' })).kind).toBe('government')
    expect(employerKind(job({ companyName: 'DEWA' })).kind).toBe('semi_gov')
    expect(employerKind(job({ companyName: 'Emirates NBD' })).kind).toBe('bank')
    expect(employerKind(job({ companyName: 'Emirates Group' })).kind).toBe('airline')
  })

  it('reads banks, airlines, government and startups from the name and text', () => {
    expect(employerKind(job({ companyName: 'Gulf Commercial Bank' })).kind).toBe('bank')
    expect(employerKind(job({ companyName: 'Desert Airways' })).kind).toBe('airline')
    expect(employerKind(job({ companyName: 'Roads and Transport Authority' })).kind).toBe('government')
    expect(employerKind(job({ companyName: 'Paylane', descriptionMd: 'We are a Series B fintech startup.' })).kind).toBe('startup')
    expect(employerKind(job({ companyName: 'Acme' })).kind).toBe('unknown')
  })
})

describe('applyChannel', () => {
  it('spots ATS links and recruiter emails', () => {
    expect(applyChannel(job({ applyUrl: 'https://boards.greenhouse.io/x/jobs/1' })).kind).toBe('ats')
    expect(applyChannel(job({ applyUrl: 'https://jobs.lever.co/x/1' })).kind).toBe('ats')
    expect(applyChannel(job({ applyUrl: 'https://acme.wd3.myworkdayjobs.com/en-US/careers/job/1' })).kind).toBe('ats')
    expect(applyChannel(job({ applyUrl: 'mailto:hr@acme.example' })).kind).toBe('email')
    expect(applyChannel(job({ descriptionMd: 'Send your CV to careers@acme.example' })).kind).toBe('email')
    expect(applyChannel(job({ applyUrl: 'https://acme.example/careers/1' })).kind).toBe('unknown')
  })
})

describe('photoAdvice', () => {
  it('posting asks for a photo → recommended', () => {
    for (const text of ['Please attach photo with your CV.', 'Send a passport-size photograph.', 'Include a recent photograph.']) {
      const a = photoAdvice(job({ location: 'Paris, France', descriptionMd: text }))
      expect(a.advice).toBe('recommended')
      expect(a.reasons[0]).toMatch(/posting asks for a photo/i)
    }
  })

  it('posting says no photos → avoid, even in the GCC', () => {
    const a = photoAdvice(job({ location: 'Dubai, UAE', companyName: 'DEWA', descriptionMd: 'Do not include photos in your application.' }))
    expect(a.advice).toBe('avoid')
  })

  it('an equal-opportunity statement → avoid', () => {
    expect(photoAdvice(job({ location: 'Remote', remoteType: 'remote', descriptionMd: 'Acme is an equal opportunity employer.' })).advice).toBe('avoid')
  })

  it('US / UK / CA / AU / IE / NL → avoid', () => {
    for (const location of ['Austin, TX, USA', 'London, UK', 'Toronto, Canada', 'Melbourne, Australia', 'Dublin, Ireland', 'Rotterdam, Netherlands']) {
      expect(photoAdvice(job({ location })).advice).toBe('avoid')
    }
  })

  it('India → not needed (avoid); DACH → optional', () => {
    const india = photoAdvice(job({ location: 'Pune, India' }))
    expect(india.advice).toBe('avoid')
    expect(india.reasons.join(' ')).toMatch(/not needed/i)
    expect(photoAdvice(job({ location: 'Munich, Germany' })).advice).toBe('optional')
  })

  it('GCC + local or semi-government employer → recommended', () => {
    expect(photoAdvice(job({ location: 'Dubai, UAE', companyName: 'DEWA' })).advice).toBe('recommended')
    expect(photoAdvice(job({ location: 'Riyadh, KSA', companyName: 'Ministry of Finance' })).advice).toBe('recommended')
  })

  it('GCC + recruiter email → recommended; GCC + ATS + startup → optional', () => {
    expect(photoAdvice(job({ location: 'Doha, Qatar', descriptionMd: 'Email your CV to jobs@acme.example' })).advice).toBe('recommended')
    const a = photoAdvice(job({ location: 'Dubai, UAE', companyName: 'Paylane', descriptionMd: 'A fintech startup.', applyUrl: 'https://jobs.lever.co/paylane/1' }))
    expect(a.advice).toBe('optional')
    expect(a.factors.map((f) => f.key)).toEqual(['country', 'employer', 'channel'])
  })

  it('GCC + bank or airline leans recommended', () => {
    expect(photoAdvice(job({ location: 'Abu Dhabi, UAE', companyName: 'Etihad Airways' })).advice).toBe('recommended')
    expect(photoAdvice(job({ location: 'Kuwait', companyName: 'National Bank of Kuwait' })).advice).toBe('recommended')
  })

  it('nothing known → optional', () => {
    const a = photoAdvice(job({}))
    expect(a.advice).toBe('optional')
    expect(a.reasons.length).toBeGreaterThan(0)
  })
})

describe('photoAction (variant rules still apply)', () => {
  const recommended = photoAdvice(job({ location: 'Dubai, UAE', companyName: 'DEWA' }))
  const avoid = photoAdvice(job({ location: 'London, UK' }))

  it('never offers a photo on Remote or India variants', () => {
    const r = photoAction(recommended, { region: 'remote', photoOn: false }, true)
    expect(r.kind).toBe('switch_to_gcc_photo')
    expect(r.note).toMatch(/never shows a photo/)
    const i = photoAction(recommended, { region: 'india', photoOn: true }, true)
    expect(i.kind).toBe('switch_to_gcc_photo')
  })

  it('recommended with a photo → use the photo version; without → upload guidance', () => {
    expect(photoAction(recommended, { region: 'gcc', photoOn: false }, true).kind).toBe('switch_to_gcc_photo')
    expect(photoAction(recommended, { region: 'gcc', photoOn: true }, true).kind).toBe('none')
    const up = photoAction(recommended, { region: 'gcc', photoOn: false }, false)
    expect(up.kind).toBe('upload')
    expect(up.note).toMatch(/head-and-shoulders/)
  })

  it('avoid with the photo on → warn', () => {
    expect(photoAction(avoid, { region: 'gcc', photoOn: true }, true).kind).toBe('turn_off')
    expect(photoAction(avoid, { region: 'remote', photoOn: false }, true).kind).toBe('none')
  })

  it('no variant chosen: advice only, or the upload hint', () => {
    expect(photoAction(recommended, null, true).kind).toBe('switch_to_gcc_photo')
    expect(photoAction(avoid, null, true).kind).toBe('none')
  })
})
