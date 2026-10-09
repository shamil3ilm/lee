import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { parseCsv, readTable } from '@/lib/integrations/linkedin/export/csv'
import { linkedinDate, linkedinExportSchema, parseLinkedInExport } from '@/lib/integrations/linkedin/export/parse'
import { readLinkedInExportZip } from '@/lib/integrations/linkedin/export/unzip'
import { applyImportSelection, buildImportSuggestions, bulletLines } from '@/lib/integrations/linkedin/review'
import { companyKey } from '@/lib/integrations/linkedin/company-key'
import { toConnectionInputs } from '@/lib/integrations/linkedin/connections'
import { referralDraft } from '@/lib/integrations/linkedin/referral-draft'
import { EXPORT_CSVS, syntheticExportZip } from '@/tests/fixtures/linkedin-export'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'

describe('CSV reader', () => {
  it('handles quotes, embedded commas / newlines, CRLF and a BOM', () => {
    expect(parseCsv('\uFEFFa,b\r\n"x, y","line1\nline2 ""q"""\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'line1\nline2 "q"'],
    ])
  })
  it('finds the header row below a preamble, case-insensitively', () => {
    expect(readTable('Notes:\n"some note, with comma"\n\nFIRST NAME,Last Name\nA,B\n', ['first name', 'last name'])).toEqual([{ 'first name': 'A', 'last name': 'B' }])
    expect(readTable('x,y\n1,2', ['first name'])).toBeNull()
  })
})

describe('LinkedIn dates', () => {
  it.each([
    ['Jan 2020', '2020-01'],
    ['2020', '2020'],
    ['15 Mar 2023', '2023-03-15'],
    ['Mar 15, 2023', '2023-03-15'],
    ['1/5/24', '2024-01-05'],
    ['', ''],
    ['someday', ''],
  ])('%s → %s', (raw, out) => expect(linkedinDate(raw)).toBe(out))
})

describe('export parsing', () => {
  it('reads every file with the real headers', () => {
    const files = Object.fromEntries(Object.entries(EXPORT_CSVS).map(([k, v]) => [k.toLowerCase(), v]))
    const data = parseLinkedInExport(files)
    expect(linkedinExportSchema.safeParse(data).success).toBe(true)
    expect(data.profile).toMatchObject({ firstName: 'Asha', headline: 'Backend Engineer | Go, PostgreSQL', location: 'Dubai, United Arab Emirates' })
    expect(data.positions[0]).toMatchObject({ company: 'PayFlow', title: 'Backend Engineer', startDate: '2021-04', endDate: '' })
    expect(data.positions[1]).toMatchObject({ startDate: '2017-01', endDate: '2017-12' })
    expect(data.education.map((e) => e.degree)).toEqual(['B.Tech', 'MBA'])
    expect(data.skills).toEqual(['Go', 'PostgreSQL', 'Laravel', 'Kafka'])
    expect(data.certifications[1]).toEqual({ name: 'CKA', authority: 'The Linux Foundation', url: 'https://example.org/cka', date: '2024-03' })
    expect(data.projects[1]).toMatchObject({ title: 'ZATCA Toolkit', startDate: '2024-01', endDate: '2024-03' })
    expect(data.languages[1]).toEqual({ name: 'Malayalam', proficiency: 'Native or bilingual proficiency' })
    expect(data.connections).toHaveLength(3)
    expect(data.connections[1]).toEqual({ firstName: 'Noor', lastName: 'Example', company: 'Careem Networks FZ-LLC', position: 'Technical Recruiter', connectedOn: '2024-01-02', email: 'noor@example.com' })
  })

  it('tolerates missing files (Basic archive without Connections)', () => {
    const data = parseLinkedInExport({ 'skills.csv': EXPORT_CSVS['Skills.csv']! })
    expect(data.profile).toBeNull()
    expect(data.connections).toEqual([])
    expect(data.found).toEqual(['skills.csv'])
  })

  it('unzips only the CSVs lee reads, from any folder in the archive', async () => {
    const zip = zipSync({
      'Basic_LinkedInDataExport_10-09-2026/Profile.csv': strToU8(EXPORT_CSVS['Profile.csv']!),
      'Basic_LinkedInDataExport_10-09-2026/messages.csv': strToU8('CONVERSATION ID,CONTENT\n1,private'),
      'Basic_LinkedInDataExport_10-09-2026/Connections.csv': strToU8(EXPORT_CSVS['Connections.csv']!),
    })
    const data = await readLinkedInExportZip(zip)
    expect(data.found.sort()).toEqual(['connections.csv', 'profile.csv'])
    expect(JSON.stringify(data)).not.toContain('private')
    expect(data.connections).toHaveLength(3)
    const full = await readLinkedInExportZip(syntheticExportZip())
    expect(full.found).toHaveLength(8)
  })

  it('rejects a non-zip and a zip without LinkedIn files', async () => {
    await expect(readLinkedInExportZip(strToU8('not a zip'))).rejects.toThrow('not a readable ZIP')
    await expect(readLinkedInExportZip(zipSync({ 'a.txt': strToU8('x') }))).rejects.toThrow('No LinkedIn CSV')
  })
})

describe('import review', () => {
  const files = Object.fromEntries(Object.entries(EXPORT_CSVS).map(([k, v]) => [k.toLowerCase(), v]))
  const data = parseLinkedInExport(files)

  it('marks what the master profile already has as duplicates', () => {
    const s = buildImportSuggestions(syntheticProfile(), data)
    const status = (label: string) => s.find((x) => x.label === label)?.status
    expect(status('Backend Engineer · PayFlow')).toBe('duplicate')
    expect(status('Software Engineer · Gulf Fintech')).toBe('new')
    expect(status('Go')).toBe('duplicate')
    expect(status('Laravel')).toBe('new')
    expect(status('Example Institute of Technology')).toBe('duplicate')
    expect(status('Open Ledger')).toBe('duplicate')
    expect(status('AWS Certified Developer')).toBe('duplicate')
    expect(status('CKA')).toBe('new')
  })

  it('adds only ticked new items; new readiness items are not ready unless marked mine; duplicates never added', () => {
    const profile = syntheticProfile()
    const s = buildImportSuggestions(profile, data)
    const key = (label: string) => s.find((x) => x.label === label)!.key
    let n = 0
    const next = applyImportSelection(
      profile,
      data,
      { keys: [key('Laravel'), key('Kafka'), key('ZATCA Toolkit'), key('Software Engineer · Gulf Fintech'), key('Go'), key('Malayalam')], own: [key('Kafka')] },
      () => `id-${++n}`,
    )
    const imported = next.skills.find((g) => g.name === 'From LinkedIn')!
    expect(imported.skills.map((x) => [x.name, x.interviewReady])).toEqual([
      ['Laravel', false],
      ['Kafka', true],
    ])
    expect(next.projects.find((p) => p.name === 'ZATCA Toolkit')).toMatchObject({ interviewReady: false, domainReady: false, startDate: '2024-01' })
    expect(next.work.at(-1)).toMatchObject({ name: 'Gulf Fintech', position: 'Software Engineer', startDate: '2017-01', endDate: '2017-12' })
    expect(next.work).toHaveLength(profile.work.length + 1)
    expect(next.skills.flatMap((g) => g.skills).filter((x) => x.name === 'Go')).toHaveLength(1)
    expect(next.languages.at(-1)).toMatchObject({ language: 'Malayalam', fluency: 'native' })
    expect(next.certificates).toEqual(profile.certificates)
  })

  it('turns bullet lines into highlights and the rest into the summary', () => {
    expect(bulletLines('Intro line.\n- First\n• Second\n1) Third')).toEqual(['First', 'Second', 'Third'])
  })
})

describe('connections', () => {
  it('normalizes company names for matching', () => {
    expect(companyKey('Careem Networks FZ-LLC')).toBe('careem networks')
    expect(companyKey('The Example Company')).toBe('example')
    expect(companyKey('Société Générale S.A.')).toBe('societe generale')
    expect(companyKey('Acme Technologies')).toBe('acme technologies')
  })
  it('keeps name, company, position and date; email only when opted in; dedupes', () => {
    const files = Object.fromEntries(Object.entries(EXPORT_CSVS).map(([k, v]) => [k.toLowerCase(), v]))
    const rows = parseLinkedInExport(files).connections
    const plain = toConnectionInputs([...rows, rows[0]!], false)
    expect(plain).toHaveLength(3)
    expect(plain.every((r) => r.email === null)).toBe(true)
    expect(Object.keys(plain[0]!).sort()).toEqual(['company', 'companyKey', 'connectedOn', 'email', 'name', 'position'])
    expect(toConnectionInputs(rows, true).find((r) => r.name === 'Noor Example')?.email).toBe('noor@example.com')
  })
  it('drafts a referral ask the user edits and sends', () => {
    const t = referralDraft({ personName: 'Rami Example', company: 'Careem', role: 'Backend Engineer', myName: null })
    expect(t).toContain('Hi Rami,')
    expect(t).toContain('Careem has the Backend Engineer role')
  })
})
