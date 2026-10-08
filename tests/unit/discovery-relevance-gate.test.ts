import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { evaluateRelevance, formatReasons, type GateInput } from '@/lib/discovery/relevance/gate'
import { EMPTY_PREFS, relevanceKey, searchPrefsFromProfile, type SearchPrefs } from '@/lib/discovery/relevance/prefs'
import { detectSeniority, detectYearsRequired } from '@/lib/discovery/relevance/seniority'
import { classifyRole, resolveRoleFamily } from '@/lib/discovery/relevance/roles'
import { REGION_CODES } from '@/lib/discovery/relevance/places'

/** The user's stated preferences (2026-09-27). */
const USER: SearchPrefs = {
  ...EMPTY_PREFS,
  active: true,
  roleFamilies: ['backend', 'fullstack'],
  seniority: ['junior', 'mid'],
  regions: [...REGION_CODES],
  remoteScope: 'worldwide',
}

function job(title: string, extra: Partial<GateInput> = {}): GateInput {
  return { title, location: '', remoteType: 'onsite', descriptionMd: '', techStack: [], ...extra }
}

describe('seniority detection', () => {
  it.each([
    ['Senior Backend Engineer', 'senior'],
    ['Sr. PHP Developer', 'senior'],
    ['Staff Software Engineer', 'staff'],
    ['Lead Developer', 'lead'],
    ['Principal Engineer', 'principal'],
    ['Head of Engineering', 'head'],
    ['Engineering Director', 'director'],
    ['Engineering Manager', 'manager'],
    ['VP Engineering', 'executive'],
    ['Junior Laravel Developer', 'junior'],
    ['Associate Software Engineer', 'junior'],
    ['Software Engineer I', 'junior'],
    ['Software Engineer II', 'mid'],
    ['Software Engineer III', 'senior'],
    ['Graduate Developer', 'junior'],
    ['Backend Developer (Mid-level)', 'mid'],
    ['Senior Associate', 'senior'],
    ['Associate Director', 'director'],
  ])('%s → %s', (title, level) => {
    expect(detectSeniority(title)).toBe(level)
  })

  it('leaves unmarked titles and false friends unmarked', () => {
    expect(detectSeniority('Backend Engineer')).toBeNull()
    expect(detectSeniority('Member of Technical Staff')).toBeNull()
    expect(detectSeniority('Lead Generation Developer')).toBeNull()
  })
})

describe('role classification', () => {
  it('names families from titles', () => {
    expect(classifyRole({ title: 'Backend Software Engineer' }).families).toContain('backend')
    expect(classifyRole({ title: 'Laravel Developer' }).families).toContain('backend')
    expect(classifyRole({ title: 'Full-Stack Developer' }).families).toContain('fullstack')
    expect(classifyRole({ title: 'DESARROLLADOR FULL STACK' }).families).toContain('fullstack')
    expect(classifyRole({ title: 'Frontend Engineer' }).families).toEqual(['frontend'])
    expect(classifyRole({ title: 'Technical Support Engineer L2' }).families).toContain('support_eng')
  })

  it('infers families for a generic title from the stack', () => {
    const r = classifyRole({ title: 'Software Engineer', techStack: ['golang', 'postgres'] })
    expect(r).toMatchObject({ engineering: true, generic: true })
    expect(r.families).toContain('backend')
    expect(classifyRole({ title: 'Software Engineer', techStack: ['php', 'react'] }).families).toContain('fullstack')
  })

  it('marks non-engineering titles', () => {
    for (const t of ['Gardener Handyman Driver', 'Junior Payroll Assistant', 'Regional Sales Manager', 'Engineer Estimator', 'Technical Product Manager', 'Video Data Annotator']) {
      expect(classifyRole({ title: t }).engineering, t).toBe(false)
    }
  })

  it('resolves free-text role types to families', () => {
    expect(resolveRoleFamily('Backend Engineer')).toBe('backend')
    expect(resolveRoleFamily('Full-stack')).toBe('fullstack')
    expect(resolveRoleFamily('backend')).toBe('backend')
    expect(resolveRoleFamily('Gardening')).toBeNull()
  })
})

describe('evaluateRelevance', () => {
  it('applies only the domain rule when preferences are not set', () => {
    const tech = evaluateRelevance(job('Senior Backend Engineer', { location: 'Texas' }), EMPTY_PREFS)
    expect(tech).toMatchObject({ pass: true, reasons: [] })
    expect(evaluateRelevance(job('Senior Gardener', { location: 'Texas' }), EMPTY_PREFS).reasons).toEqual(['domain: Trades/Field work'])
  })

  it('passes a mid-level backend role in Dubai', () => {
    expect(evaluateRelevance(job('Laravel Developer', { location: 'Dubai, UAE' }), USER)).toMatchObject({
      pass: true,
      regions: ['ae', 'gcc'],
    })
  })

  it('gives seniority, role and location reasons', () => {
    // Senior is a soft stretch (a chip, ranked lower); Director is still filtered.
    const senior = evaluateRelevance(job('Senior Backend Engineer', { location: 'Dubai' }), USER)
    expect(senior.pass).toBe(true)
    expect(senior.penalties).toEqual(['Senior title'])
    expect(evaluateRelevance(job('Director of Engineering', { location: 'Dubai' }), USER).reasons).toEqual([
      'seniority: Director',
    ])
    expect(evaluateRelevance(job('Payroll Specialist', { location: 'Dubai' }), USER).reasons).toEqual(['domain: HR'])
    expect(evaluateRelevance(job('Frontend Engineer', { location: 'Pune' }), USER).reasons).toEqual([
      'role: Frontend',
    ])
    expect(evaluateRelevance(job('Backend Engineer', { remoteType: 'remote', location: 'Remote - US' }), USER).reasons).toEqual([
      'location: US-only',
    ])
    expect(evaluateRelevance(job('Backend Engineer', { location: 'Berlin, Germany' }), USER).reasons).toEqual([
      'location: Berlin',
    ])
    const many = evaluateRelevance(job('Staff Frontend Engineer', { remoteType: 'remote', location: 'United States' }), USER)
    expect(formatReasons(many.reasons)).toBe('role: Frontend · location: US-only')
    expect(many.penalties).toEqual(['Staff title'])
  })

  it('keeps remote postings with an empty or worldwide location', () => {
    for (const location of ['', 'Remote', 'Worldwide', 'Anywhere', 'Remoto', null]) {
      const r = evaluateRelevance(job('Backend Developer', { remoteType: 'remote', location }), USER)
      expect(r.pass, String(location)).toBe(true)
      expect(r.regions).toContain('remote')
    }
  })

  it('keeps onsite postings with an unknown or empty location', () => {
    for (const location of ['', null, 'Uluberia-II', 'HQ']) {
      expect(evaluateRelevance(job('Backend Developer', { location }), USER).pass).toBe(true)
    }
  })

  it('never drops a Gulf or Indian posting over its spelling', () => {
    const places = [
      'Dubai', 'Abu Dhabi', 'Riyadh, KSA', 'Jeddah', 'Doha', 'Kuwait City', 'Manama', 'Muscat',
      'Bangalore', 'Bengaluru', 'Cochin', 'Kochi', 'Gurugram', 'Gurgaon', 'Remote - India',
      'دبي', 'الرياض', 'Hyderabad, Telangana', 'Noida, Uttar Pradesh',
    ]
    for (const location of places) {
      for (const remoteType of ['onsite', 'hybrid', 'remote']) {
        expect(evaluateRelevance(job('Backend Developer', { location, remoteType }), USER).pass, `${location}/${remoteType}`).toBe(true)
      }
    }
  })

  it('reads a region from the title when the location is empty', () => {
    const r = evaluateRelevance(job('PHP Developer - Dubai', { location: '' }), USER)
    expect(r.pass).toBe(true)
    expect(r.regions).toContain('ae')
  })

  it('rejects remote roles restricted by the description', () => {
    const us = job('Backend Engineer', { remoteType: 'remote', location: 'Remote', descriptionMd: 'Candidates must be located in the United States.' })
    expect(evaluateRelevance(us, USER).reasons).toEqual(['location: US-only'])
    const auth = job('Backend Engineer', { remoteType: 'remote', descriptionMd: 'You must be authorized to work in the US without sponsorship.' })
    expect(evaluateRelevance(auth, USER).pass).toBe(false)
    const india = job('Backend Engineer', { remoteType: 'remote', descriptionMd: 'You must be based in India (IST overlap).' })
    expect(evaluateRelevance(india, USER).pass).toBe(true)
    const emea = job('Backend Engineer', { remoteType: 'remote', location: 'Remote - EMEA' })
    expect(evaluateRelevance(emea, USER).pass).toBe(true)
  })

  it('applies the remote scope', () => {
    const regionsOnly = { ...USER, remoteScope: 'regions' as const }
    expect(evaluateRelevance(job('Backend Engineer', { remoteType: 'remote' }), regionsOnly).reasons).toEqual([
      'location: remote, region not stated',
    ])
    expect(evaluateRelevance(job('Backend Engineer', { remoteType: 'remote', location: 'Remote - India' }), regionsOnly).pass).toBe(true)
    const none = { ...USER, remoteScope: 'none' as const }
    expect(evaluateRelevance(job('Backend Engineer', { remoteType: 'remote' }), none).pass).toBe(false)
  })

  it('accepts relocation countries', () => {
    const prefs = { ...USER, otherCountries: ['US'] }
    expect(evaluateRelevance(job('Backend Engineer', { location: 'Austin, Texas, United States' }), prefs).pass).toBe(true)
  })

  it('applies include and exclude keywords', () => {
    const prefs = { ...USER, include: ['Laravel', 'PHP'], exclude: ['gambling'] }
    expect(evaluateRelevance(job('Backend Developer', { descriptionMd: 'Laravel APIs' }), prefs).pass).toBe(true)
    expect(evaluateRelevance(job('Backend Developer', { descriptionMd: 'Java services' }), prefs).reasons).toEqual([
      'keywords: none of Laravel, PHP',
    ])
    expect(evaluateRelevance(job('PHP Developer', { descriptionMd: 'Online gambling platform' }), prefs).reasons).toEqual([
      'excluded: gambling',
    ])
  })

  it('matches custom role titles literally', () => {
    const prefs = { ...USER, roleFamilies: [], customRoles: ['Mainframe COBOL Maintainer'] }
    expect(evaluateRelevance(job('Mainframe COBOL Maintainer', { location: 'Doha' }), prefs).pass).toBe(true)
  })
})

describe('search prefs from the profile', () => {
  const base = {
    roleTypes: ['Backend Engineer', 'fullstack', 'Mainframe COBOL Maintainer'],
    seniorityLevels: ['mid', 'junior', 'bogus'],
    locationPrefs: [{ country: 'AE' }, { country: 'in' }, { country: 'DE' }],
    acceptRelocation: false,
    willingToRelocateTo: ['US'],
    remoteScope: 'worldwide',
    keywords: [' laravel ', 'Laravel'],
    dealbreakers: [],
    searchPrefsSavedAt: new Date(),
  }

  it('maps profile columns onto gate prefs', () => {
    const p = searchPrefsFromProfile(base)
    expect(p).toMatchObject({
      active: true,
      roleFamilies: ['backend', 'fullstack'],
      customRoles: ['Mainframe COBOL Maintainer'],
      seniority: ['junior', 'mid'],
      regions: ['AE', 'IN'],
      otherCountries: ['DE'],
      include: ['laravel'],
    })
  })

  it('is inactive until preferences are saved (default location seeds alone do nothing)', () => {
    expect(searchPrefsFromProfile({ ...base, searchPrefsSavedAt: null }).active).toBe(false)
    // Unsaved: a provisional key (domain rule on provisional targets).
    expect(relevanceKey(searchPrefsFromProfile({ ...base, searchPrefsSavedAt: null }))).toMatch(/^r\d+:p:/)
  })

  it('adds relocation targets only when relocation is accepted', () => {
    expect(searchPrefsFromProfile({ ...base, acceptRelocation: true }).otherCountries).toEqual(['DE', 'US'])
  })

  it('keys change with the preferences and ignore order', () => {
    const a = relevanceKey(searchPrefsFromProfile(base))
    const b = relevanceKey(searchPrefsFromProfile({ ...base, roleTypes: ['fullstack', 'Backend Engineer', 'Mainframe COBOL Maintainer'] }))
    const c = relevanceKey(searchPrefsFromProfile({ ...base, seniorityLevels: ['senior'] }))
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

describe('RemoteOK sample (99 real postings, 2026-09-27)', () => {
  interface SampleJob {
    position: string
    location: string
    tags: string[]
    description: string
  }
  const sample = JSON.parse(
    readFileSync(join(__dirname, '../fixtures/discovery/remoteok-sample.json'), 'utf8'),
  ) as { jobs: SampleJob[] }
  // Same normalisation as the RemoteOK adapter: remote, location as given.
  const inputs: GateInput[] = sample.jobs.map((j) => ({
    title: j.position,
    location: j.location,
    remoteType: 'remote',
    descriptionMd: j.description,
    techStack: j.tags,
  }))

  it('with no preferences, filters only unrelated fields (59 of 99 kept), each with a domain reason', () => {
    const results = inputs.map((j) => evaluateRelevance(j, EMPTY_PREFS))
    expect(results.filter((r) => r.pass)).toHaveLength(59)
    for (const r of results.filter((x) => !x.pass)) expect(r.reasons[0]).toMatch(/^domain: /)
  })

  it('keeps the relevant few for this user (16 of 99; Senior titles and unknown fields pass with a chip)', () => {
    const passed = inputs.filter((j) => evaluateRelevance(j, USER).pass)
    // (The Oracle Fusion title is served double-encoded; matched by prefix.)
    expect(passed.map((j) => (j.title.startsWith('Oracle Fusion Cloud Lead') ? 'Oracle Fusion Cloud Lead' : j.title))).toEqual([
      'Software Engineer',
      'Senior .NET Software Engineer',
      'Backend Software Engineer',
      'Golang Kubernetes Engineer',
      'Software Engineer',
      'External Data Specialist',
      'AI Response Analyst',
      'Junior Crypto Analyst & Trader',
      'Oracle Fusion Cloud Lead',
      'Senior Backend Engineer Build AI Agents',
      'Senior Specialist Global QMS',
      'DESARROLLADOR FULL STACK',
      'Brand Protection & Marketplace Compliance Analyst',
      'Real Time Drilling Ops Centre Analyst',
      'Software Engineer II Golang',
      'Why do you want this new job',
    ])
    // Unknown fields are never filtered on the title alone: they carry the review chip.
    const uncertain = evaluateRelevance(inputs.find((j) => j.title === 'AI Response Analyst')!, USER)
    expect(uncertain.penalties).toContain('Uncertain fit — review')
    const senior = evaluateRelevance(inputs.find((j) => j.title === 'Senior .NET Software Engineer')!, USER)
    expect(senior.penalties).toContain('Senior title')
  })

  it('explains every rejection', () => {
    for (const j of inputs) {
      const r = evaluateRelevance(j, USER)
      if (!r.pass) expect(r.reasons.length, j.title).toBeGreaterThan(0)
    }
    const byTitle = (t: string): string | null =>
      formatReasons(evaluateRelevance(inputs.find((j) => j.title === t)!, USER).reasons)
    expect(byTitle('Gardener Handyman Driver')).toBe('domain: Trades/Field work · location: Alice Springs-only')
    expect(byTitle('Hotline Paralegal')).toBe('domain: Legal')
    expect(byTitle('Marketing Student Assistant')).toBe('domain: Marketing')
    expect(byTitle('Staff Software Engineer')).toBe('location: US-only')
    expect(byTitle('Principal Engineer')).toBe('seniority: Principal')
    expect(byTitle('Frontend Engineer')).toBe('role: Frontend · location: Singapore-only')
    expect(byTitle('Java Developer')).toBe('location: US-only')
    // "Mostly remote (within Germany)" in the description.
    expect(byTitle('Software Developer Security Analytics')).toBe('location: Germany-only')
  })

  it('reads the double-encoded Gulf locations', () => {
    const gulf = inputs.filter((j) => evaluateRelevance(j, USER).regions.includes('gcc'))
    expect(gulf.map((j) => j.title).sort()).toEqual([
      'Business Development Manager',
      'Data Analyst Assistant',
      'Data Entry Administrator',
    ])
  })
})

describe('years of experience', () => {
  it.each([
    ['Requirements: 1-3 years of experience with PHP', 1],
    ['2–4 years experience building APIs', 2],
    ['5+ years of professional software experience', 5],
    ['Experience: minimum 6 years', 6],
    ['At least 3 years in backend development', 3],
    ["3+ years' experience with Laravel and 5+ years overall experience", 3],
  ])('%s → %i', (text, years) => {
    expect(detectYearsRequired(text)).toBe(years)
  })

  it('ignores years that are not about experience', () => {
    expect(detectYearsRequired('Founded 10 years ago, we have been remote for 7 years.')).toBeNull()
  })

  it('ranks an unmarked title that asks for more years than the selected levels lower, never filters it', () => {
    const five = job('Backend Developer', { location: 'Dubai', descriptionMd: 'You have 5+ years of experience.' })
    const r = evaluateRelevance(five, USER)
    expect(r.pass).toBe(true)
    expect(r.penalties).toEqual(['5+ yrs asked'])
    expect(evaluateRelevance(five, { ...USER, extra: { ...USER.extra, rules: { seniority: 'hard' } } }).reasons).toEqual([
      'seniority: 5+ years required',
    ])
    const two = job('Backend Developer', { location: 'Dubai', descriptionMd: 'You have 2-4 years of experience.' })
    expect(evaluateRelevance(two, USER).pass).toBe(true)
    // A title marker wins over the years line.
    const junior = job('Junior Backend Developer', { location: 'Dubai', descriptionMd: '5+ years of experience' })
    expect(evaluateRelevance(junior, USER).pass).toBe(true)
  })
})

describe('GCC and India title synonyms', () => {
  it.each([
    ['PHP Developer', 'backend'],
    ['Laravel Developer', 'backend'],
    ['PHP Laravel Developer', 'backend'],
    ['Backend Developer', 'backend'],
    ['Web Developer (Laravel)', 'fullstack'],
    ['Full Stack Developer (Laravel/React)', 'fullstack'],
    ['Software Engineer – Backend', 'backend'],
    ['ZATCA Integration Developer', 'einvoicing'],
    ['E-Invoicing Developer', 'einvoicing'],
    ['ERP Developer', 'erp'],
    ['Odoo Developer', 'erp'],
    ['Payments Integration Engineer', 'payments'],
    ['Integration Engineer', 'api_integration'],
    ['Production Support Engineer', 'support_eng'],
    ['AI Application Developer', 'llm_app'],
  ])('%s → %s', (title, family) => {
    expect(classifyRole({ title }).families).toContain(family)
  })

  it('passes a generic "Software Developer" title for a backend/full-stack target', () => {
    expect(evaluateRelevance(job('Software Developer', { location: 'Kochi' }), USER).pass).toBe(true)
  })
})
