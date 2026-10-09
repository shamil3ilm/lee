import type { RegionPlaybook } from './playbook-types'

/**
 * Region playbooks: the per-region onboarding recipe (see playbook-types.ts).
 * Order is priority: Kuwait and the UAE first (the owner's top GCC
 * priorities), then the rest of the GCC, India's tech cities, remote and
 * relocation targets. Browse links are never fetched; their reasons are
 * quoted in docs/job-sources.md. Client-safe data.
 */

const GULF_SITES = ['linkedin', 'bayt', 'naukrigulf', 'indeed', 'gulftalent'] as const
const INDIA_SITES = ['linkedin', 'naukri', 'indeed', 'instahyre', 'wellfound'] as const
const ABROAD_SITES = ['linkedin', 'indeed', 'glassdoor'] as const

export const PLAYBOOKS: readonly RegionPlaybook[] = [
  {
    id: 'kw',
    label: 'Kuwait',
    covers: ['kw'],
    searchPlace: 'Kuwait',
    aiModePlaces: 'Kuwait (Kuwait City, Sharq, Shuwaikh, Salmiya, Hawalli, Farwaniya or Ahmadi)',
    alertSites: GULF_SITES,
    localQueries: [
      '("software developer" OR "data analyst" OR "business analyst") (Kuwait OR Salmiya OR Shuwaikh OR Hawalli) hiring',
      '("developer" OR "analyst") Kuwait "KWD"',
      'وظائف مطور برمجيات الكويت',
      'وظائف محلل بيانات الكويت',
    ],
    boards: [
      { label: 'Bayt · Kuwait', url: 'https://www.bayt.com/en/kuwait/jobs/', why: 'robots.txt disallows search pages; terms ban robots. Set a Bayt alert instead.' },
      { label: 'NaukriGulf · Kuwait', url: 'https://www.naukrigulf.com/jobs-in-kuwait', why: 'Info Edge terms ban crawlers. Set a NaukriGulf alert instead.' },
      { label: 'Indeed Kuwait', url: 'https://kw.indeed.com/', why: 'robots.txt disallows job pages; terms ban bots. Set an Indeed alert instead.' },
      { label: 'Tanqeeb · Kuwait', url: 'https://kuwait.tanqeeb.com/', why: 'robots.txt disallows search pages.' },
    ],
    directoryGroup: 'kw',
    priority: 1,
  },
  {
    id: 'ae',
    label: 'UAE',
    covers: ['ae'],
    searchPlace: 'United Arab Emirates',
    aiModePlaces: 'the UAE (Dubai, Abu Dhabi or Sharjah, including free zones such as Dubai Internet City, DIFC and ADGM)',
    alertSites: GULF_SITES,
    localQueries: [
      '("software developer" OR "data analyst") (Dubai OR "Abu Dhabi" OR Sharjah) hiring',
      'وظائف مطور برمجيات دبي',
      'وظائف محلل بيانات أبوظبي',
    ],
    boards: [
      { label: 'Bayt · UAE', url: 'https://www.bayt.com/en/uae/jobs/', why: 'robots.txt disallows search pages; terms ban robots. Set a Bayt alert instead.' },
      { label: 'dubizzle Jobs', url: 'https://dubai.dubizzle.com/jobs/', why: 'Bot wall; terms forbid scraping.' },
      { label: 'Dubai Careers (government)', url: 'https://dubaicareers.ae/', why: 'Custom portal, no feed; nationals-only postings are skipped.' },
    ],
    directoryGroup: 'ae',
    priority: 2,
  },
  {
    id: 'sa',
    label: 'Saudi Arabia',
    covers: ['sa'],
    searchPlace: 'Saudi Arabia',
    aiModePlaces: 'Saudi Arabia (Riyadh, Jeddah, Dammam or Al Khobar)',
    alertSites: GULF_SITES,
    localQueries: ['("software developer" OR "data analyst") (Riyadh OR Jeddah OR Dammam OR Khobar) hiring', 'وظائف مطور برمجيات الرياض'],
    boards: [{ label: 'Bayt · Saudi Arabia', url: 'https://www.bayt.com/en/saudi-arabia/jobs/', why: 'robots.txt disallows search pages; terms ban robots.' }],
    directoryGroup: 'sa',
    priority: 3,
  },
  {
    id: 'qa',
    label: 'Qatar',
    covers: ['qa'],
    searchPlace: 'Qatar',
    aiModePlaces: 'Qatar (Doha, Lusail or West Bay)',
    alertSites: GULF_SITES,
    localQueries: ['("software developer" OR "data analyst") (Doha OR Qatar) hiring', 'وظائف مطور برمجيات الدوحة'],
    boards: [{ label: 'Bayt · Qatar', url: 'https://www.bayt.com/en/qatar/jobs/', why: 'robots.txt disallows search pages; terms ban robots.' }],
    directoryGroup: 'qa',
    priority: 4,
  },
  {
    id: 'bh',
    label: 'Bahrain',
    covers: ['bh'],
    searchPlace: 'Bahrain',
    aiModePlaces: 'Bahrain (Manama, Seef or Bahrain Bay)',
    alertSites: GULF_SITES,
    localQueries: ['("software developer" OR "data analyst") (Bahrain OR Manama) hiring', 'وظائف مطور برمجيات البحرين'],
    boards: [{ label: 'Bayt · Bahrain', url: 'https://www.bayt.com/en/bahrain/jobs/', why: 'robots.txt disallows search pages; terms ban robots.' }],
    directoryGroup: 'bh',
    priority: 5,
  },
  {
    id: 'om',
    label: 'Oman',
    covers: ['om'],
    searchPlace: 'Oman',
    aiModePlaces: 'Oman (Muscat, including Al Khuwair, Qurum and Knowledge Oasis Muscat)',
    alertSites: GULF_SITES,
    localQueries: ['("software developer" OR "data analyst") (Muscat OR Oman) hiring', 'وظائف مطور برمجيات مسقط'],
    boards: [{ label: 'Bayt · Oman', url: 'https://www.bayt.com/en/oman/jobs/', why: 'robots.txt disallows search pages; terms ban robots.' }],
    directoryGroup: 'om',
    priority: 6,
  },
  {
    id: 'kochi',
    label: 'Kochi',
    covers: ['kochi'],
    searchPlace: 'Kochi',
    aiModePlaces: 'Kochi, Kerala (Infopark, Kakkanad, SmartCity)',
    alertSites: INDIA_SITES,
    localQueries: ['("software developer" OR "data analyst") (Kochi OR Kakkanad OR Infopark) hiring'],
    boards: [],
    directoryGroup: 'kerala',
    priority: 7,
  },
  {
    id: 'thiruvananthapuram',
    label: 'Trivandrum',
    covers: ['thiruvananthapuram'],
    searchPlace: 'Thiruvananthapuram',
    aiModePlaces: 'Thiruvananthapuram (Technopark, Kazhakkoottam)',
    alertSites: INDIA_SITES,
    localQueries: ['("software developer" OR "data analyst") (Trivandrum OR Technopark) hiring'],
    boards: [],
    directoryGroup: 'kerala',
    priority: 8,
  },
  {
    id: 'kozhikode',
    label: 'Calicut',
    covers: ['kozhikode'],
    searchPlace: 'Kozhikode',
    aiModePlaces: 'Kozhikode / Calicut (UL Cyberpark, Kerala Cyberpark)',
    alertSites: INDIA_SITES,
    localQueries: ['("software developer" OR "data analyst") (Calicut OR Kozhikode OR Cyberpark) hiring'],
    boards: [],
    directoryGroup: 'kerala',
    priority: 9,
  },
  ...(
    [
      ['bengaluru', 'Bengaluru', 'Bengaluru', 'Bengaluru (Whitefield, Outer Ring Road, Electronic City, Koramangala)'],
      ['hyderabad', 'Hyderabad', 'Hyderabad', 'Hyderabad (HITEC City, Gachibowli, Financial District)'],
      ['chennai', 'Chennai', 'Chennai', 'Chennai (OMR, Taramani, Guindy)'],
      ['pune', 'Pune', 'Pune', 'Pune (Hinjewadi, Kharadi, Magarpatta)'],
      ['delhi-ncr', 'Delhi NCR', 'Delhi NCR', 'Delhi NCR (Gurugram, Noida, New Delhi)'],
      ['mumbai', 'Mumbai', 'Mumbai', 'Mumbai (Powai, Andheri, BKC, Navi Mumbai)'],
    ] as const
  ).map(
    ([id, label, place, ai], i): RegionPlaybook => ({
      id,
      label,
      covers: [id],
      searchPlace: place,
      aiModePlaces: ai,
      alertSites: INDIA_SITES,
      localQueries: [`("software developer" OR "data analyst") ${place.includes(' ') ? `"${place}"` : place} hiring`],
      boards: [],
      directoryGroup: 'in',
      priority: 10 + i,
    }),
  ),
  {
    id: 'remote',
    label: 'Remote',
    covers: ['remote', 'remote-worldwide', 'remote-emea', 'remote-apac', 'remote-india-tz'],
    searchPlace: 'Remote',
    aiModePlaces: 'remote (worldwide, EMEA, APAC or India-friendly time zones)',
    alertSites: ['linkedin', 'wellfound'],
    localQueries: ['("remote" "software developer") ("worldwide" OR "EMEA" OR "APAC") hiring'],
    boards: [],
    directoryGroup: null,
    priority: 20,
  },
  ...(
    [
      ['europe', 'Europe', 'European Union'],
      ['gb', 'UK', 'United Kingdom'],
      ['us', 'US', 'United States'],
      ['ca', 'Canada', 'Canada'],
      ['au', 'Australia', 'Australia'],
      ['sg', 'Singapore', 'Singapore'],
      ['my', 'Malaysia', 'Malaysia'],
    ] as const
  ).map(
    ([id, label, place], i): RegionPlaybook => ({
      id,
      label,
      covers: [id],
      searchPlace: place,
      aiModePlaces: `${place}, with visa sponsorship or relocation support`,
      alertSites: ABROAD_SITES,
      localQueries: [`"software developer" "${place}" ("visa sponsorship" OR "relocation")`],
      boards: [],
      directoryGroup: null,
      priority: 30 + i,
    }),
  ),
]

const BY_ID = new Map(PLAYBOOKS.map((p) => [p.id, p] as const))

export function getPlaybook(id: string): RegionPlaybook | undefined {
  return BY_ID.get(id)
}
