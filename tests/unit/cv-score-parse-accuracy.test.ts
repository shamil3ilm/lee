import { describe, expect, it } from 'vitest'
import { cvToScorable } from '@/lib/cv-score/extract'
import { extractUpload, hrefsFromHtml, itemsToLayoutLines } from '@/lib/cv-score/upload'
import { scoreAts } from '@/lib/cv-score/dimensions/ats'
import { buildPdf } from '@/tests/fixtures/cv-score/pdf'
import { TRICKY_LINES, TRICKY_LINKS, TRICKY_TEXT, trickyWithGlyphs } from '@/tests/fixtures/cv-score/tricky'

/**
 * v1.1 — parsing defects found on a real 2-page CV, reproduced with a
 * synthetic CV of the same layout (tests/fixtures/cv-score/tricky.ts).
 */
const tricky = () => cvToScorable({ kind: 'upload', text: TRICKY_TEXT, fileType: 'pdf', pageCount: 2, links: TRICKY_LINKS })

const upload = (text: string) => cvToScorable({ kind: 'upload', text, fileType: 'txt' })

describe('defect 1 — role/company pairing', () => {
  it('reads the company from the line BELOW "Title <dates>"', () => {
    const cv = tricky()
    expect(cv.roles.map((r) => [r.title, r.company, r.start, r.end])).toEqual([
      ['Software Engineer', 'Acme Pay', '2025-12', 'present'],
      ['PHP Laravel Intern', 'Contoso Solutions', '2025-06', '2025-11'],
      ['Executive Manager', 'Brightpath Academy', '2024-01', '2025-05'],
      ['Web Developer Intern', 'Fabrikam Robotics', '2024-06', '2024-07'],
    ])
    expect(cv.roles[0]!.location).toBe('Kochi, India')
    expect(cv.roles[1]!.location).toBe('Dubai, UAE, Remote')
    expect(cv.roles[0]!.lines).toEqual([7, 8])
  })

  it('still reads the company from the line ABOVE when the CV puts it there', () => {
    const text = [
      'Experience',
      'Northwind Traders, London, UK',
      'Backend Engineer    Jan 2022 – Present',
      'Built the settlement service that reconciles payouts across 4 banks.',
      'Cut deploy time from 40 to 8 minutes with GitHub Actions.',
      'Initech, Austin, TX',
      'Software Developer    Mar 2019 – Dec 2021',
      'Migrated 30 cron jobs to Kubernetes.',
    ].join('\n')
    const cv = upload(text)
    expect(cv.roles.map((r) => [r.title, r.company])).toEqual([
      ['Backend Engineer', 'Northwind Traders'],
      ['Software Developer', 'Initech'],
    ])
    expect(cv.roles.map((r) => r.bullets.length)).toEqual([2, 1])
  })

  it('handles "Title — Company" and "Company | Title" on the date line', () => {
    const text = [
      'Experience',
      'Senior Engineer — Globex | Jan 2021 – Present',
      '• Led the ledger migration to Postgres, cutting costs by 30%',
      'Umbrella Corp | Platform Engineer | 2018 – 2020',
      '• Built the payouts API in Go',
    ].join('\n')
    const cv = upload(text)
    expect(cv.roles.map((r) => [r.title, r.company])).toEqual([
      ['Senior Engineer', 'Globex'],
      ['Platform Engineer', 'Umbrella Corp'],
    ])
  })

  it('never takes the tail of a wrapped bullet ("payments.") as the next company', () => {
    const cv = tricky()
    for (const r of cv.roles) {
      expect(r.company).not.toMatch(/\.$/)
      expect(r.company).not.toMatch(/^[a-z]/)
    }
  })
})

describe('defect 2 — wrapped lines are one bullet', () => {
  it('joins wrapped lines without bullet glyphs (6 bullets, not 12+)', () => {
    const cv = tricky()
    expect(cv.roles.map((r) => r.bullets.length)).toEqual([6, 3, 2, 1])
    const exp = cv.bullets.filter((b) => b.roleIndex !== undefined)
    expect(exp).toHaveLength(12)
    expect(exp[0]).toMatchObject({
      roleIndex: 0,
      lines: [9, 10, 11],
      text: `${TRICKY_LINES[9]} ${TRICKY_LINES[10]} ${TRICKY_LINES[11]}`,
    })
    // An uppercase continuation ("UAE, tracing…") after a line with no full stop.
    expect(cv.roles[1]!.bullets[0]).toContain('Saudi Arabia and the UAE, tracing routes')
  })

  it('parses project paragraphs as bullets and keeps project headers out', () => {
    const cv = tricky()
    const projects = cv.bullets.filter((b) => b.section === 'PROJECTS')
    expect(projects.map((b) => b.lines)).toEqual([[41, 42], [44, 45]])
  })

  it('gives the same result when bullets carry glyphs', () => {
    const cv = upload(trickyWithGlyphs())
    expect(cv.roles.map((r) => r.bullets.length)).toEqual([6, 3, 2, 1])
    expect(cv.roles[0]!.bullets[0]).toBe(`${TRICKY_LINES[9]} ${TRICKY_LINES[10]} ${TRICKY_LINES[11]}`)
  })

  it('handles each bullet glyph (•, -, –, ▪)', () => {
    const text = [
      'Experience',
      'Engineer — Hooli | 2019 – 2021',
      '• Built a thing that serves 4 teams',
      '- Built another thing that serves 5 teams',
      '– Built a third thing used by 6 teams and',
      'continued on the next line',
      '▪ Built a fourth thing',
    ].join('\n')
    const cv = upload(text)
    expect(cv.roles[0]!.bullets).toEqual([
      'Built a thing that serves 4 teams',
      'Built another thing that serves 5 teams',
      'Built a third thing used by 6 teams and continued on the next line',
      'Built a fourth thing',
    ])
  })

  it('uses PDF layout (right margin) to join wraps when bullets have no full stops', async () => {
    const pdf = buildPdf([
      { text: 'Experience', x: 50, y: 720, size: 12 },
      { text: 'Backend Engineer', x: 50, y: 700 },
      { text: 'Jan 2022 – Present', x: 450, y: 700 },
      { text: 'Northwind Traders, London, UK', x: 50, y: 686 },
      { text: 'Built the settlement service that reconciles card payouts across every acquiring bank we support and', x: 50, y: 672 },
      { text: 'Stripe Connect accounts in real time', x: 50, y: 658 },
      { text: 'Cut deploy time from 40 to 8 minutes with GitHub Actions', x: 50, y: 644 },
      { text: 'Migrated 30 cron jobs to Kubernetes', x: 50, y: 630 },
    ])
    const ex = await extractUpload({ name: 'cv.pdf', bytes: pdf })
    expect(ex.layout).toHaveLength(ex.text.split('\n').length)
    const cv = cvToScorable({ kind: 'upload', ...ex })
    expect(cv.roles[0]).toMatchObject({ title: 'Backend Engineer', company: 'Northwind Traders' })
    expect(cv.roles[0]!.bullets).toEqual([
      'Built the settlement service that reconciles card payouts across every acquiring bank we support and Stripe Connect accounts in real time',
      'Cut deploy time from 40 to 8 minutes with GitHub Actions',
      'Migrated 30 cron jobs to Kubernetes',
    ])
  })

  it('records layout per line (x, right edge, gap)', () => {
    const { lines, layout } = itemsToLayoutLines(
      [
        { str: 'Built', x: 50, y: 700, width: 30, fontSize: 10 },
        { str: 'things', x: 83, y: 700, width: 35, fontSize: 10 },
        { str: 'Next', x: 50, y: 686, width: 25, fontSize: 10 },
      ],
      1,
    )
    expect(lines).toEqual(['Built things', 'Next'])
    expect(layout).toEqual([
      { page: 1, x: 50, right: 118, y: 700, fontSize: 10, gapBefore: 0 },
      { page: 1, x: 50, right: 75, y: 686, fontSize: 10, gapBefore: 14 },
    ])
  })
})

describe('defect 5 — contact links from hyperlinks', () => {
  it('counts LinkedIn/GitHub/site written as link text when the file has the URLs', () => {
    const cv = tricky()
    expect(cv.links).toEqual(TRICKY_LINKS)
    expect(cv.contact).toMatchObject({
      email: 'riya.menon@example.com',
      linkedin: 'https://www.linkedin.com/in/riya-menon-example/',
      github: 'https://github.com/riya-menon-example',
      website: 'riyamenon.example.dev',
    })
    const ats = scoreAts(cv)
    expect(ats.findings.some((f) => /LinkedIn/.test(f.message))).toBe(false)
  })

  it('without the links, LinkedIn is reported missing', () => {
    const cv = cvToScorable({ kind: 'upload', text: TRICKY_TEXT, fileType: 'pdf', pageCount: 2 })
    expect(cv.contact.linkedin).toBeUndefined()
    expect(scoreAts(cv).findings.some((f) => /LinkedIn URL/.test(f.message))).toBe(true)
  })

  it('reads PDF link annotations through unpdf', async () => {
    const pdf = buildPdf(
      [
        { text: 'Dana Example', x: 50, y: 740, size: 14 },
        { text: 'dana@example.com | LinkedIn | GitHub', x: 50, y: 720 },
      ],
      [
        { url: 'https://www.linkedin.com/in/dana-example', rect: [150, 715, 190, 730] },
        { url: 'https://github.com/dana-example', rect: [200, 715, 240, 730] },
      ],
    )
    const ex = await extractUpload({ name: 'cv.pdf', bytes: pdf })
    expect(ex.links).toEqual(['https://www.linkedin.com/in/dana-example', 'https://github.com/dana-example'])
    const cv = cvToScorable({ kind: 'upload', ...ex })
    expect(cv.contact.linkedin).toBe('https://www.linkedin.com/in/dana-example')
    expect(cv.contact.github).toBe('https://github.com/dana-example')
  })

  it('reads DOCX hyperlinks from mammoth HTML', () => {
    expect(
      hrefsFromHtml('<p><a href="https://linkedin.com/in/x">LinkedIn</a> <a href="#_top">top</a> <a href="mailto:a@b.co">mail</a></p>'),
    ).toEqual(['https://linkedin.com/in/x', 'mailto:a@b.co'])
  })
})
