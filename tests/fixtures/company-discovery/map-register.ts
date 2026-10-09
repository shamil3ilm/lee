/**
 * Offline fixtures for the map and register sources (lib/company-discovery/
 * sources/overpass.ts, gleif.ts, mca.ts). Shaped like the real responses
 * checked on 2026-10-09 (Overpass `out tags center` JSON, GLEIF JSON:API
 * lei-records, data.gov.in records), with SYNTHETIC organisations on
 * `.example` domains and made-up identifiers; no people, phones or e-mails
 * are kept by the parsers (the fixtures include some to prove it).
 */

const node = (id: number, tags: Record<string, string>) => ({ type: 'node', id, lat: 29.37, lon: 47.98, tags })
const way = (id: number, tags: Record<string, string>) => ({ type: 'way', id, center: { lat: 29.37, lon: 47.98 }, tags })

/** Overpass for a Kuwait City box: offices of every kind, two bank branches, a hospital, and noise. */
export const OVERPASS_KUWAIT = {
  version: 0.6,
  generator: 'Overpass API',
  osm3s: { timestamp_osm_base: '2026-10-09T17:00:00Z', copyright: 'The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.' },
  elements: [
    node(101, { office: 'it', name: 'Sand Ledger Systems', website: 'https://sandledger.example', 'addr:city': 'Kuwait City', email: 'owner@sandledger.example', phone: '+965 0000 0000' }),
    node(102, { office: 'company', name: 'Example Logistics W.L.L.', 'contact:website': 'https://exlogistics.example/en' }),
    node(103, { amenity: 'bank', name: 'Pearl Example Bank' }),
    node(104, { amenity: 'bank', name: 'Pearl Example Bank', website: 'https://pearlbank.example' }),
    way(201, { amenity: 'hospital', name: 'Example General Hospital', 'addr:city': 'Salmiya' }),
    node(105, { office: 'government', name: 'Ministry of Example Affairs' }),
    // noise: dropped
    node(106, { amenity: 'restaurant', name: 'Example Grill' }),
    node(107, { amenity: 'atm', name: 'Pearl Example Bank ATM' }),
    node(108, { shop: 'mobile_phone', name: 'Example Phone Shop' }),
    node(109, { office: 'company' }),
    way(202, { building: 'house', name: 'Example Villa' }),
    node(110, { office: 'diplomatic', name: 'Embassy of Example' }),
    // kept: a mall (retail HQ) and a tagged-but-generic office
    way(203, { shop: 'mall', name: 'Example Avenues Mall' }),
    node(111, { office: 'insurance', name: 'Gulf Example Takaful' }),
  ],
}

export const OVERPASS_TIMEOUT = { version: 0.6, elements: [], remark: 'runtime error: Query timed out in "query" at line 3 after 61 seconds.' }

const lei = (id: string, opts: { legal: string; lang?: string; translit?: string; trading?: string; city: string; country: string; category?: string; status?: string }) => ({
  type: 'lei-records',
  id,
  attributes: {
    lei: id,
    entity: {
      legalName: { name: opts.legal, language: opts.lang ?? 'en' },
      otherNames: opts.trading ? [{ name: opts.trading, language: 'en', type: 'TRADING_OR_OPERATING_NAME' }] : [],
      transliteratedOtherNames: opts.translit ? [{ name: opts.translit, language: 'ar', type: 'PREFERRED_ASCII_TRANSLITERATED_LEGAL_NAME' }] : [],
      legalAddress: { language: 'en', addressLines: ['Example Street 1'], city: opts.city, region: null, country: opts.country, postalCode: '00000' },
      headquartersAddress: { language: 'en', addressLines: ['Example Street 1'], city: opts.city, region: null, country: opts.country, postalCode: '00000' },
      category: opts.category ?? 'GENERAL',
      status: opts.status ?? 'ACTIVE',
    },
    registration: { status: 'ISSUED' },
  },
})

/** GLEIF lei-records page 1 of 3 for Kuwait. */
export const GLEIF_KUWAIT_PAGE = {
  meta: { goldenCopy: { publishDate: '2026-10-09T08:00:00Z' }, pagination: { currentPage: 1, perPage: 200, from: 1, to: 6, total: 450, lastPage: 3 } },
  data: [
    lei('5493000EXAMPLE000001', { legal: 'Pearl Example Bank K.S.C.P.', city: 'Kuwait City', country: 'KW' }),
    lei('5493000EXAMPLE000002', { legal: 'شركة المثال للتجارة', lang: 'ar', translit: 'Al-Mithal Trading Co. W.L.L.', city: 'Kuwait', country: 'KW' }),
    lei('5493000EXAMPLE000003', { legal: 'Example Holding Fund', city: 'Kuwait City', country: 'KW', category: 'FUND' }),
    lei('5493000EXAMPLE000004', { legal: 'Desert Example Airways K.S.C. (Closed)', trading: 'Desert Example Airways', city: 'Farwaniya', country: 'KW' }),
    lei('5493000EXAMPLE000005', { legal: 'Lapsed Example Co.', city: 'Kuwait City', country: 'KW', status: 'INACTIVE' }),
    lei('BADLEI', { legal: 'Broken Example', city: 'Kuwait City', country: 'KW' }),
  ],
}

/** data.gov.in company master data for Kerala (field names in the platform's mixed styles). */
export const MCA_KERALA_PAGE = {
  index_name: '4dbe5667-7b6b-41d7-82af-211562424d9a',
  title: 'Registrars of Companies (RoC)-wise Company Master Data',
  total: 1200,
  count: 4,
  limit: '500',
  offset: '0',
  records: [
    { CIN: 'U62011KL2015PTC000001', CompanyName: 'BACKWATER EXAMPLE SOFTWARE PRIVATE LIMITED', CompanyStatus: 'Active', PaidupCapital: '2500000', Registered_Office_Address: '1/23 Infopark Road, Kakkanad, Kochi, Ernakulam, Kerala 682030', CompanyEmail: 'founder@backwater.example' },
    { CIN: 'U85110KL1998PTC000002', CompanyName: 'EXAMPLE HOSPITALS PRIVATE LIMITED', CompanyStatus: 'Active', PaidupCapital: '150000000', Registered_Office_Address: 'MG Road, Kozhikode, Kerala' },
    { CIN: 'U52100KL2010PTC000003', CompanyName: 'STRUCK EXAMPLE TRADERS PRIVATE LIMITED', CompanyStatus: 'Strike Off', PaidupCapital: '100000', Registered_Office_Address: 'Thrissur, Kerala' },
    { CIN: 'U72900KA2012PTC000004', CompanyName: 'WRONG STATE EXAMPLE PRIVATE LIMITED', CompanyStatus: 'Active', PaidupCapital: '100000', Registered_Office_Address: 'Bengaluru, Karnataka' },
  ],
}
