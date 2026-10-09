import { describe, expect, it } from 'vitest'
import { resolveLocation } from '@/lib/regions/normalize'
import { evaluateRelevance, type GateInput } from '@/lib/discovery/relevance/gate'
import { EMPTY_PREFS, type SearchPrefs } from '@/lib/discovery/relevance/prefs'
import { REGION_CODES } from '@/lib/discovery/relevance/places'
import { EMPTY_DISCOVERY_PREFS } from '@/lib/discovery/relevance/discovery-prefs'
import { detectNationalsOnly } from '@/lib/discovery/relevance/signals'
import { detectSeniority } from '@/lib/discovery/relevance/seniority'
import { locationMatchesCountries } from '@/lib/discovery/search-prefs'
import { dropDuplicates, keysOf } from '@/lib/discovery/manual-import/dedupe'
import type { DiscoveryItem } from '@/lib/discovery/adapters/types'

/**
 * Pipeline-loss audit (2026-10-09): one fixture set per target region,
 * pushed through every stage that can lose a posting — region tagging, the
 * location rule, remote eligibility, nationals-only, title relevance,
 * seniority and dedupe — to show a posting that should survive does.
 * Synthetic postings only.
 */

/** Spellings job boards use for each region, including districts and native scripts. */
const PLACES: Readonly<Record<string, readonly string[]>> = {
  kw: [
    'Kuwait City, Kuwait', 'Salmiya', 'Salmiyah, Hawalli Governorate', 'Shuwaikh Industrial Area', 'Farwaniya',
    'Al Farwaniyah', 'Mangaf', 'Fahaheel', 'Jahra', 'Al Jahra', 'Ahmadi', 'Al Ahmadi', 'Mubarak Al-Kabeer',
    'Mubarak Al Kabir', 'Hawally', 'Hawalli', 'KW', 'KWT', 'State of Kuwait', 'الكويت', 'السالمية', 'حولي',
    'الفروانية', 'الجهراء', 'الأحمدي', 'مبارك الكبير', 'الشويخ', 'Sharq', 'Khaitan', 'Jabriya', 'Egaila',
    'Kuwait - Kuwait City', 'KW-Kuwait', 'Al Rai', 'Qurain',
  ],
  ae: [
    'Dubai', 'Abu Dhabi', 'Sharjah', 'DIFC', 'Dubai Internet City', 'AE', 'UAE', 'Dubai - United Arab Emirates', 'دبي',
    'Al Barsha', 'Jumeirah', 'TECOM', 'KIZAD', 'DAFZA', 'Al Reem Island', 'Hamriyah Free Zone', 'twofour54',
    'Sheikh Zayed Road', 'Motor City', 'Al Qusais',
  ],
  sa: ['Riyadh', 'Jeddah', 'Dammam', 'Khobar', 'Al-Khobar', 'Dhahran', 'KSA', 'الرياض', 'Olaya, Riyadh', 'KAUST', 'Jizan', 'Al Ahsa', 'Hofuf', 'Qatif', 'Khamis Mushait'],
  qa: ['Doha', 'Lusail', 'West Bay', 'QFC', 'Al Sadd', 'Doha, QA', 'الدوحة', 'Al Khor'],
  bh: ['Manama', 'Seef', 'Bahrain Bay', 'Sanabis', 'Juffair', 'Hidd', 'Isa Town', 'Diplomatic Area'],
  om: ['Muscat', 'Al Khuwair', 'Ruwi', 'Qurum', 'Ghala', 'Bausher', 'Seeb', 'مسقط', 'Madinat Sultan Qaboos', 'Azaiba'],
  kochi: ['Kochi', 'Cochin', 'Kakkanad', 'Infopark', 'Ernakulam', 'കൊച്ചി', 'Vyttila', 'Aluva'],
  kozhikode: ['Calicut', 'Kozhikode', 'UL Cyberpark', 'കോഴിക്കോട്'],
  thiruvananthapuram: ['Trivandrum', 'Technopark', 'Technopark Phase III', 'തിരുവനന്തപുരം', 'Kazhakkoottam'],
  bengaluru: ['Bangalore', 'Bengaluru Urban', 'Whitefield', 'Marathahalli', 'JP Nagar', 'Sarjapur Road', 'बेंगलुरु', 'ಬೆಂಗಳೂರು'],
  hyderabad: ['Hyderabad', 'HITEC City', 'Gachibowli', 'Nanakramguda', 'Kokapet', 'हैदराबाद'],
  chennai: ['Chennai', 'OMR, Chennai', 'Taramani', 'Perungudi', 'சென்னை'],
  pune: ['Pune', 'Hinjewadi', 'Kharadi', 'Viman Nagar', 'Wakad', 'पुणे'],
  'delhi-ncr': ['Gurgaon', 'Noida Sector 62', 'New Delhi', 'Udyog Vihar', 'Okhla', 'दिल्ली'],
  mumbai: ['Mumbai', 'Powai', 'Andheri', 'Airoli', 'Vikhroli', 'मुंबई'],
}

/** The owner's domains: software, data and analysis; junior to mid; every target region. */
const USER: SearchPrefs = {
  ...EMPTY_PREFS,
  active: true,
  roleFamilies: ['backend', 'fullstack', 'payments', 'einvoicing', 'erp', 'api_integration', 'data_analyst', 'business_analyst'],
  seniority: ['junior', 'mid'],
  regionIds: ['gcc', 'in'],
  regions: [...REGION_CODES],
  remoteScope: 'worldwide',
  extra: { ...EMPTY_DISCOVERY_PREFS, sponsorshipFor: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'], basedIn: 'IN' },
}

const JD = 'We are hiring a PHP / Laravel developer to build payment APIs with MySQL and REST. 2+ years of experience.'

function job(title: string, extra: Partial<GateInput> = {}): GateInput {
  return { title, location: '', remoteType: 'onsite', descriptionMd: JD, techStack: [], ...extra }
}

describe('stage 1 — region tagging: every spelling resolves to its region', () => {
  for (const [id, list] of Object.entries(PLACES)) {
    it.each(list)(`%s → ${id}`, (place) => {
      expect(resolveLocation(place, { trustCodes: true }).ids).toContain(id)
    })
  }

  it('a code at the start of a longer place name is not a code ("JP Nagar" is not Japan)', () => {
    expect(resolveLocation('JP Nagar, Bengaluru', { trustCodes: true }).ids).not.toContain('jp')
    expect(resolveLocation('Tokyo, JP', { trustCodes: true }).ids).toContain('jp')
  })

  it('the job APIs\' free-text country filter knows the districts too', () => {
    expect(locationMatchesCountries('Shuwaikh Industrial Area', ['KW'])).toBe(true)
    expect(locationMatchesCountries('Mangaf', ['KW'])).toBe(true)
    expect(locationMatchesCountries('Kakkanad', ['IN'])).toBe(true)
    expect(locationMatchesCountries('Berlin, Germany', ['KW', 'IN'])).toBe(false)
  })
})

describe('stage 2 — the location rule keeps on-site postings in every target region', () => {
  for (const [id, list] of Object.entries(PLACES)) {
    it(`${id}: on-site postings pass and carry the region id`, () => {
      for (const location of list) {
        const r = evaluateRelevance(job('Laravel Developer', { location }), USER)
        expect(r.reasons, location).toEqual([])
        expect(r.regionIds, location).toContain(id)
      }
    })
  }

  it.each([
    ['Kuwait City', 'Our clients are in the US and Europe; you will join calls with US-based stakeholders.'],
    ['Dubai', 'Experience with US GAAP and UK reporting is a plus.'],
    ['Kochi, Kerala', 'You will support our US customers. Overlap with US time zones for 2 hours.'],
  ])('an on-site %s posting that mentions US / UK clients is not "US-only"', (location, extra) => {
    const r = evaluateRelevance(job('PHP Developer', { location, descriptionMd: `${JD} ${extra}` }), USER)
    expect(r.reasons).toEqual([])
  })

  it('a posting elsewhere is still filtered', () => {
    expect(evaluateRelevance(job('PHP Developer', { location: 'Berlin, Germany' }), USER).pass).toBe(false)
  })
})

describe('stage 3 — remote eligibility keeps GCC / India / EMEA remote roles', () => {
  it.each([
    ['Remote - Kuwait', ''],
    ['Remote (GCC)', ''],
    ['Remote, MENA', ''],
    ['Remote - EMEA', ''],
    ['Remote', 'Must be based in Kuwait or the GCC.'],
    ['Remote', 'Candidates must be eligible to work in the UAE.'],
    ['Remote', 'Remote within India; work from home.'],
    ['Remote (UTC+3)', ''],
    ['Work from home, Kerala', ''],
    ['Anywhere', 'Fully remote, worldwide.'],
  ])('%s %s passes', (location, extra) => {
    const r = evaluateRelevance(job('Backend Developer', { location, remoteType: 'remote', descriptionMd: `${JD} ${extra}` }), USER)
    expect(r.reasons).toEqual([])
  })

  it('a US-only remote role is still filtered', () => {
    const r = evaluateRelevance(job('Backend Developer', { location: 'Remote - US only', remoteType: 'remote' }), USER)
    expect(r.pass).toBe(false)
  })

  it('a Kuwait remote role carries kw and the EMEA remote scope', () => {
    const r = evaluateRelevance(job('Backend Developer', { location: 'Remote - Kuwait', remoteType: 'remote' }), USER)
    expect(r.regionIds).toEqual(expect.arrayContaining(['kw', 'remote', 'remote-emea']))
  })
})

describe('stage 4 — nationals-only: requirements filter, boilerplate does not (every GCC country)', () => {
  const COUNTRIES = [
    { demonym: 'Kuwaiti', people: 'Kuwaitis', programme: 'Kuwaitization' },
    { demonym: 'Emirati', people: 'Emiratis', programme: 'Emiratisation' },
    { demonym: 'Saudi', people: 'Saudis', programme: 'Saudization' },
    { demonym: 'Qatari', people: 'Qataris', programme: 'Qatarization' },
    { demonym: 'Omani', people: 'Omanis', programme: 'Omanisation' },
    { demonym: 'Bahraini', people: 'Bahrainis', programme: 'Bahrainisation' },
  ]

  for (const c of COUNTRIES) {
    it(`${c.demonym}: a requirement is nationals-only`, () => {
      for (const text of [
        `This role is open to ${c.demonym} nationals only.`,
        `Applicants must be ${c.demonym} nationals.`,
        `${c.people} only.`,
        `This position is part of our ${c.programme} programme for ${c.demonym} graduates.`.replace('our ', 'the '),
        `Requirements:\n- ${c.demonym} nationals\n- 2 years of PHP`,
      ]) {
        expect(detectNationalsOnly(text), text).toBe('nationals only')
      }
      expect(detectNationalsOnly(JD, `BI Developer - ${c.demonym} National`)).toBe('nationals only')
    })

    it(`${c.demonym}: company boilerplate is not nationals-only`, () => {
      for (const text of [
        `We are a leading ${c.demonym} company with 2,000 employees.`,
        `Over 60% of our workforce are ${c.demonym} nationals, and we are proud of it.`,
        `We support ${c.programme} and invest in developing ${c.demonym} talent.`,
        `In line with ${c.programme} goals, we run a graduate programme. This role is open to all nationalities.`,
        `Open to ${c.demonym} nationals and expatriates.`,
        `About us: a ${c.demonym} shareholding company founded in 1975.`,
      ]) {
        expect(detectNationalsOnly(`${JD}\n\n${text}`), text).toBeNull()
      }
    })
  }

  it('a GCC posting whose JD only mentions the company\'s nationality survives the gate', () => {
    const r = evaluateRelevance(
      job('Data Analyst', {
        location: 'Kuwait City',
        descriptionMd: 'About us: a leading Kuwaiti company in retail. We employ Kuwaiti nationals and expatriates.\n\nThe role: SQL, Power BI and Excel reporting. 2+ years of experience.',
      }),
      USER,
    )
    expect(r.reasons).toEqual([])
  })
})

describe('stage 5 — title relevance: software / data / analyst roles at non-tech employers pass', () => {
  it.each([
    ['Business Analyst – Retail Banking', 'Gather requirements, write user stories and SQL queries for the core banking system.', 'Kuwait City'],
    ['ERP Developer – Hospital Group', 'Develop and customise Oracle E-Business Suite modules, PL/SQL, integrations with HIS.', 'Hawalli'],
    ['Data Analyst – Logistics', 'Build dashboards in Power BI from shipment data, SQL, Python.', 'Dubai'],
    ['Odoo Consultant', 'Implement and customise Odoo ERP modules (Python), integrations, user training.', 'Riyadh'],
    ['SAP ABAP Consultant', 'ABAP development and SAP S/4HANA integration with banking systems.', 'Doha'],
    ['MIS Executive', 'Prepare MIS reports with Excel, SQL and Power BI for the finance team.', 'Kochi'],
    ['BI Developer', 'Design data models and reports in Power BI and SSRS; SQL Server.', 'Manama'],
    ['IT Officer – Applications', 'Support and develop in-house applications (PHP, MySQL) for an insurance company.', 'Muscat'],
    ['Integration Developer (Payments)', 'Build REST and ISO 8583 integrations with card schemes and payment gateways.', 'Salmiya'],
  ])('%s passes', (title, descriptionMd, location) => {
    const r = evaluateRelevance(job(title, { location, descriptionMd }), USER)
    expect(r.reasons).toEqual([])
  })

  it.each([
    ['Staff Nurse – ICU', 'Provide patient care in the intensive care unit. Nursing licence required.'],
    ['Bank Teller', 'Handle cash deposits and withdrawals at the branch counter, customer service.'],
    ['Sales Executive', 'Achieve monthly sales targets, cold calling and closing deals with retail customers.'],
  ])('%s is still filtered', (title, descriptionMd) => {
    const r = evaluateRelevance(job(title, { location: 'Kuwait City', descriptionMd }), USER)
    expect(r.pass).toBe(false)
  })
})

describe('stage 6 — seniority: Gulf grade titles are not managers', () => {
  it.each([
    ['Assistant Manager – Application Development', 'senior'],
    ['Deputy Manager - MIS', 'senior'],
    ['Officer - Business Intelligence', null],
    ['IT Executive', null],
    ['Engineering Manager', 'manager'],
  ])('%s → %s', (title, level) => {
    expect(detectSeniority(title)).toBe(level)
  })

  it('an "Assistant Manager – IT" in Kuwait is ranked lower, not filtered', () => {
    const r = evaluateRelevance(job('Assistant Manager – IT Applications', { location: 'Kuwait City' }), USER)
    expect(r.pass).toBe(true)
  })
})

describe('stage 7 — dedupe keeps the same title in another country', () => {
  const item = (title: string, companyName: string, location: string, url: string): DiscoveryItem => ({
    sourceItemId: url,
    raw: {},
    normalized: { kind: 'job', title, companyName, location, applyUrl: url, descriptionMd: '', techStack: [], raw: {} },
  })

  it('a Kuwait opening is not dropped as a duplicate of the Dubai one', () => {
    const existing = keysOf([{ applyUrl: 'https://jobs.example.org/1', title: 'Data Analyst', companyName: 'Example Group W.L.L.', location: 'Dubai, UAE' }])
    const r = dropDuplicates([item('Data Analyst', 'Example Group', 'Kuwait City', 'https://jobs.example.org/2')], existing)
    expect(r.fresh).toHaveLength(1)
  })

  it('the same opening in the same country (or with no location) is still a duplicate', () => {
    const existing = keysOf([{ applyUrl: null, title: 'Data Analyst', companyName: 'Example Group K.S.C.P.', location: 'Salmiya' }])
    expect(dropDuplicates([item('Data Analyst', 'Example Group', 'Kuwait', 'https://a.example.org/3')], existing).fresh).toHaveLength(0)
    expect(dropDuplicates([item('Data Analyst', 'Example Group', '', 'https://a.example.org/4')], existing).fresh).toHaveLength(0)
  })
})
