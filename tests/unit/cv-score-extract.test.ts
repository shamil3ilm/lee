import { describe, expect, it } from 'vitest'
import { cvToScorable, detectColumns, headingKey, _internal } from '@/lib/cv-score/extract'
import { itemsToLines, fileTypeOf, extractUpload } from '@/lib/cv-score/upload'
import { CvScoreError } from '@/lib/cv-score/errors'
import { fillTemplate, TEMPLATES } from '@/lib/latex/templates'
import { makeMasterCV } from '@/tests/eval/factories'
import { NO_CONTACT_TEXT, strongCv, TWO_COLUMN_TEXT } from '@/tests/fixtures/cv-score/cvs'

describe('cvToScorable — structured', () => {
  it('maps a master CV directly', () => {
    const cv = cvToScorable({ kind: 'master_cv', cv: strongCv() })
    expect(cv.meta).toMatchObject({ sourceKind: 'master_cv', structured: true, fileType: 'json', columnsSuspected: false })
    expect(cv.meta.sectionOrder).toEqual(['summary', 'experience', 'education', 'skills'])
    expect(cv.roles).toHaveLength(3)
    expect(cv.roles[0]).toMatchObject({ company: 'PayCo', title: 'Senior Backend Engineer', start: '2021-03', end: 'present' })
    expect(cv.roles[0]!.tech).toEqual(['typescript', 'postgres', 'kafka', 'redis'])
    expect(cv.bullets).toHaveLength(10)
    expect(cv.bullets[4]).toMatchObject({ section: 'Experience', roleIndex: 1 })
    expect(cv.skillsListed).toEqual(['TypeScript', 'Go', 'PostgreSQL', 'Kafka', 'Redis', 'Docker', 'Kubernetes', 'GitHub Actions'])
    expect(cv.contact).toEqual({
      email: 'alex@example.com',
      phone: '+971 50 123 4567',
      linkedin: 'https://linkedin.com/in/alexstrong',
      location: 'Dubai, UAE',
    })
    expect(cv.headline).toBe('Senior Backend Engineer')
    expect(cv.meta.pageCountEstimate).toBe(1)
  })
})

describe('cvToScorable — text uploads', () => {
  it('segments headings, roles, bullets, skills and contact', () => {
    const text = [
      'Morgan Text',
      'morgan@example.com | +1 (415) 555-0100 | San Francisco, CA | linkedin.com/in/morgan',
      '',
      'PROFESSIONAL SUMMARY',
      'Backend engineer focused on payments.',
      '',
      'Work Experience',
      'Senior Engineer — Stripe',
      'Jan 2021 – Present',
      '• Led the migration of the ledger to Postgres, cutting costs by 30%',
      '- Mentored 4 engineers',
      'Engineer at Square | 06/2018 - 12/2020',
      '* Built the payouts API in Go',
      '',
      'Education:',
      'BSc Computer Science, MIT, 2014 - 2018',
      '',
      'Technical Skills',
      'Languages: Go, TypeScript; Databases: Postgres | Redis',
    ].join('\n')
    const cv = cvToScorable({ kind: 'upload', text, fileType: 'txt' })
    expect(cv.meta.sectionOrder).toEqual(['summary', 'experience', 'education', 'skills'])
    expect(cv.roles).toEqual([
      {
        title: 'Senior Engineer',
        company: 'Stripe',
        start: '2021-01',
        end: 'present',
        bullets: ['Led the migration of the ledger to Postgres, cutting costs by 30%', 'Mentored 4 engineers'],
      },
      { title: 'Engineer', company: 'Square', start: '2018-06', end: '2020-12', bullets: ['Built the payouts API in Go'] },
    ])
    expect(cv.bullets.map((b) => b.roleIndex)).toEqual([0, 0, 1])
    expect(cv.skillsListed).toEqual(['Go', 'TypeScript', 'Postgres', 'Redis'])
    expect(cv.contact).toEqual({
      email: 'morgan@example.com',
      phone: '+1 (415) 555-0100',
      linkedin: 'linkedin.com/in/morgan',
      location: 'San Francisco, CA',
    })
    expect(cv.meta.columnsSuspected).toBe(false)
  })

  it('detects missing contact details', () => {
    const cv = cvToScorable({ kind: 'upload', text: NO_CONTACT_TEXT, fileType: 'txt' })
    expect(cv.contact).toEqual({ email: undefined, phone: undefined, linkedin: undefined, location: undefined })
    expect(cv.roles).toHaveLength(1)
    expect(cv.roles[0]).toMatchObject({ title: 'Backend Developer', company: 'Initech', start: '2019-03' })
  })

  it('flags two-column layouts', () => {
    const cv = cvToScorable({ kind: 'upload', text: TWO_COLUMN_TEXT, fileType: 'pdf', pageCount: 1 })
    expect(cv.meta.columnsSuspected).toBe(true)
    expect(detectColumns(['Experience', '• one', '• two'])).toBe(false)
  })

  it('treats paragraph lines inside a role as bullets', () => {
    const parsed = _internal.parseExperience([
      'Engineer, Acme, 2019 – 2020',
      'Designed and shipped the new onboarding flow used by every new customer.',
    ])
    expect(parsed.roles[0]!.bullets).toHaveLength(1)
  })

  it('recognises heading variants', () => {
    expect(headingKey('WORK HISTORY')).toBe('experience')
    expect(headingKey('Skills & Tools:')).toBe('skills')
    expect(headingKey('I built a thing in 2020')).toBeNull()
  })
})

describe('cvToScorable — LaTeX', () => {
  it.each(TEMPLATES.filter((t) => t.kind === 'cv' && t.id !== 'cv-academic-cv').map((t) => t.id))(
    'template %s yields both roles and an email',
    (id) => {
      const cv = cvToScorable({ kind: 'latex_cv', source: fillTemplate(id, makeMasterCV()) })
      expect(cv.meta.fileType).toBe('tex')
      expect(cv.roles.map((r) => r.company)).toEqual(['OnlineCheckWriter', 'Careem'])
      expect(cv.roles[0]!.bullets.length).toBe(2)
      expect(cv.contact.email).toBe('shamil@example.com')
    },
  )
})

describe('upload helpers', () => {
  it('rebuilds lines from positioned PDF items and keeps wide gaps', () => {
    const lines = itemsToLines([
      { str: 'EXPERIENCE', x: 50, y: 700, width: 80, fontSize: 12 },
      { str: 'SKILLS', x: 400, y: 700, width: 50, fontSize: 12 },
      { str: 'Built', x: 50, y: 680, width: 30, fontSize: 10 },
      { str: 'things', x: 83, y: 680, width: 35, fontSize: 10 },
    ])
    expect(lines).toEqual(['EXPERIENCE    SKILLS', 'Built things'])
    expect(detectColumns(lines)).toBe(true)
  })

  it('validates file types and sizes', async () => {
    expect(fileTypeOf('cv.PDF')).toBe('pdf')
    expect(fileTypeOf('cv.exe')).toBeNull()
    await expect(extractUpload({ name: 'cv.exe', bytes: new Uint8Array([1]) })).rejects.toBeInstanceOf(CvScoreError)
    await expect(extractUpload({ name: 'cv.txt', bytes: new Uint8Array() })).rejects.toMatchObject({ code: 'empty_file' })
    const ok = await extractUpload({ name: 'cv.md', bytes: new TextEncoder().encode('# Hi') })
    expect(ok).toEqual({ text: '# Hi', fileType: 'md' })
  })
})
