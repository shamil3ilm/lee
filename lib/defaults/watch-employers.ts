/**
 * GCC government, semi-government and major employers lee keeps watching,
 * with the best COMPLIANT way to see their openings. Client-safe data (no
 * imports): Settings › Sources renders it, the starter catalog derives its
 * watch links from it, and the AI web-search source may build a daily
 * employer-targeted prompt from it (name, country, sector, careersUrl).
 *
 * Methods, best first:
 *   adapter    a public careers endpoint lee polls (`sourceKey` names it)
 *   alert      the employer's own job-alert email (sign up at alertSignupUrl;
 *              lee does not parse these senders yet — see docs/job-sources.md)
 *   ai_search  a daily AI web search for the employer's new openings
 *   manual     "check weekly": a link in the watch list, never fetched
 *
 * Checked live on 2026-10-08 (counts beside adapter entries). Portals that
 * hire nationals only (Saudi Jadarat, Qatar Kawader, Kuwait Civil Service
 * Commission, the UAE federal and Abu Dhabi government portals) are not
 * listed: lee skips nationals-only openings.
 */

export type GccCountry = 'AE' | 'SA' | 'QA' | 'KW' | 'BH' | 'OM'
export type WatchMethod = 'adapter' | 'alert' | 'ai_search' | 'manual'
export type WatchSector =
  | 'aviation' | 'energy' | 'utilities' | 'telecom' | 'banking' | 'ports' | 'real-estate' | 'government'
  | 'investment' | 'transport' | 'postal' | 'mining' | 'petrochemicals' | 'events' | 'tech'

export interface WatchEmployer {
  /** Stable id; never change once shipped. */
  key: string
  name: string
  country: GccCountry
  sector: WatchSector
  /** Most roles are for nationals (shown as a note; such postings are skipped). */
  nationalsOnly: boolean
  careersUrl: string
  /** The careers backend found behind the site. */
  backend: string
  /** Monitoring methods, best first. */
  methods: readonly WatchMethod[]
  /** DEFAULT_SOURCES key of the source that monitors it (adapter or watch link). */
  sourceKey: string
  alertSignupUrl?: string
  /** What the live check found. */
  note: string
}

export const WATCH_CHECKED_ON = '2026-10-08'

const AI_MANUAL: readonly WatchMethod[] = ['ai_search', 'manual']
const ALERT_AI_MANUAL: readonly WatchMethod[] = ['alert', 'ai_search', 'manual']

export const WATCH_EMPLOYERS: readonly WatchEmployer[] = [
  // United Arab Emirates
  { key: 'emirates-group', name: 'Emirates Group', country: 'AE', sector: 'aviation', nationalsOnly: false, careersUrl: 'https://www.emiratesgroupcareers.com/', backend: 'Avature', methods: ALERT_AI_MANUAL, sourceKey: 'watch:emirates-group', alertSignupUrl: 'https://www.emiratesgroupcareers.com/', note: 'Avature site with no public feed; job alerts after sign-up.' },
  { key: 'etihad', name: 'Etihad Airways', country: 'AE', sector: 'aviation', nationalsOnly: false, careersUrl: 'https://careers.etihad.com/', backend: 'SmartRecruiters', methods: ALERT_AI_MANUAL, sourceKey: 'watch:etihad', alertSignupUrl: 'https://careers.etihad.com/', note: 'SmartRecruiters API disallowed by robots.txt.' },
  { key: 'flydubai', name: 'flydubai', country: 'AE', sector: 'aviation', nationalsOnly: false, careersUrl: 'https://careers.flydubai.com/', backend: 'iCIMS', methods: ALERT_AI_MANUAL, sourceKey: 'watch:flydubai', alertSignupUrl: 'https://careers.flydubai.com/', note: 'iCIMS robots.txt disallows everything.' },
  { key: 'dubai-airports', name: 'Dubai Airports', country: 'AE', sector: 'aviation', nationalsOnly: false, careersUrl: 'https://dubaiairports.ae/corporate/careers', backend: 'Custom', methods: AI_MANUAL, sourceKey: 'watch:dubai-airports', note: 'Custom careers site, no feed.' },
  { key: 'dewa', name: 'DEWA', country: 'AE', sector: 'utilities', nationalsOnly: false, careersUrl: 'https://www.dewa.gov.ae/en/about-us/careers', backend: 'Custom', methods: AI_MANUAL, sourceKey: 'watch:dewa', note: 'Blocks automated clients (403).' },
  { key: 'sewa', name: 'SEWA', country: 'AE', sector: 'utilities', nationalsOnly: false, careersUrl: 'https://www.sewa.gov.ae/en/careers', backend: 'Custom', methods: AI_MANUAL, sourceKey: 'watch:sewa', note: 'Custom page, no feed; many roles favour UAE nationals.' },
  { key: 'adnoc', name: 'ADNOC', country: 'AE', sector: 'energy', nationalsOnly: false, careersUrl: 'https://jobs.adnoc.ae/', backend: 'Phenom', methods: ['adapter'], sourceKey: 'phenom:adnoc', note: '66 jobs (read after the locale fix).' },
  { key: 'enoc', name: 'ENOC', country: 'AE', sector: 'energy', nationalsOnly: false, careersUrl: 'https://careers.enoc.com/', backend: 'SAP SuccessFactors', methods: ['adapter'], sourceKey: 'successfactors:enoc', note: '4 jobs in the job feed.' },
  { key: 'taqa', name: 'TAQA', country: 'AE', sector: 'utilities', nationalsOnly: false, careersUrl: 'https://www.taqa.com/careers/', backend: 'Custom', methods: AI_MANUAL, sourceKey: 'watch:taqa', note: 'Custom page, no feed.' },
  { key: 'masdar', name: 'Masdar', country: 'AE', sector: 'energy', nationalsOnly: false, careersUrl: 'https://masdar.ae/en/careers', backend: 'SmartRecruiters', methods: ALERT_AI_MANUAL, sourceKey: 'watch:masdar', alertSignupUrl: 'https://careers.smartrecruiters.com/masdar', note: 'SmartRecruiters API disallowed by robots.txt.' },
  { key: 'adnec', name: 'ADNEC Group', country: 'AE', sector: 'events', nationalsOnly: false, careersUrl: 'https://www.adnecgroup.ae/', backend: 'Unknown', methods: AI_MANUAL, sourceKey: 'watch:adnec', note: 'No careers page found (404); watch the site and LinkedIn.' },
  { key: 'du', name: 'du', country: 'AE', sector: 'telecom', nationalsOnly: false, careersUrl: 'https://www.du.ae/', backend: 'Oracle ORC', methods: ['adapter'], sourceKey: 'oracle_orc:du', note: '12 jobs.' },
  { key: 'eand', name: 'e& (Etisalat)', country: 'AE', sector: 'telecom', nationalsOnly: false, careersUrl: 'https://www.eand.com/', backend: 'Oracle ORC', methods: ['adapter'], sourceKey: 'oracle_orc:eand', note: '8 jobs.' },
  { key: 'emirates-nbd', name: 'Emirates NBD', country: 'AE', sector: 'banking', nationalsOnly: false, careersUrl: 'https://www.emiratesnbd.com/', backend: 'Oracle ORC', methods: ['adapter'], sourceKey: 'oracle_orc:emiratesnbd', note: '23 jobs.' },
  { key: 'dp-world', name: 'DP World', country: 'AE', sector: 'ports', nationalsOnly: false, careersUrl: 'https://www.dpworld.com/', backend: 'Oracle ORC', methods: ['adapter'], sourceKey: 'oracle_orc:dpworld', note: '140 jobs (16 in the GCC).' },
  { key: 'ad-ports', name: 'AD Ports Group', country: 'AE', sector: 'ports', nationalsOnly: false, careersUrl: 'https://www.adportsgroup.com/en/careers', backend: 'Oracle ORC', methods: ['adapter'], sourceKey: 'oracle_orc:adports', note: '9 jobs.' },
  { key: 'emaar', name: 'Emaar', country: 'AE', sector: 'real-estate', nationalsOnly: false, careersUrl: 'https://www.emaar.com/en/careers', backend: 'Oracle ORC', methods: ['adapter'], sourceKey: 'oracle_orc:emaar', note: '2 jobs (mostly hospitality).' },
  { key: 'rta', name: 'RTA Dubai', country: 'AE', sector: 'transport', nationalsOnly: false, careersUrl: 'https://www.rta.ae/wps/portal/rta/ae/home/about-rta/careers', backend: 'Custom', methods: AI_MANUAL, sourceKey: 'watch:rta', note: 'Custom portal, no feed.' },
  { key: 'mubadala', name: 'Mubadala', country: 'AE', sector: 'investment', nationalsOnly: false, careersUrl: 'https://www.mubadala.com/en/careers', backend: 'Custom', methods: AI_MANUAL, sourceKey: 'watch:mubadala', note: 'Links out to group companies.' },
  { key: 'adq', name: 'ADQ', country: 'AE', sector: 'investment', nationalsOnly: false, careersUrl: 'https://www.adq.ae/', backend: 'Unknown', methods: AI_MANUAL, sourceKey: 'watch:adq', note: 'Careers page moved (404).' },
  { key: 'emirates-post', name: 'Emirates Post', country: 'AE', sector: 'postal', nationalsOnly: false, careersUrl: 'https://www.emiratespost.ae/careers', backend: 'Custom', methods: AI_MANUAL, sourceKey: 'watch:emirates-post', note: 'Blocks automated clients (403).' },
  { key: 'dubai-careers', name: 'Dubai Careers (Dubai Government)', country: 'AE', sector: 'government', nationalsOnly: false, careersUrl: 'https://dubaicareers.ae/', backend: 'Custom', methods: AI_MANUAL, sourceKey: 'watch:dubai-careers', note: 'Mixed portal: nationals-only postings are skipped.' },
  // Qatar
  { key: 'qatar-airways', name: 'Qatar Airways', country: 'QA', sector: 'aviation', nationalsOnly: false, careersUrl: 'https://careers.qatarairways.com/', backend: 'Taleo + Avature', methods: ALERT_AI_MANUAL, sourceKey: 'watch:qatar-airways', alertSignupUrl: 'https://careers.qatarairways.com/', note: 'No public feed; job alerts after sign-up.' },
  { key: 'qatarenergy', name: 'QatarEnergy', country: 'QA', sector: 'energy', nationalsOnly: false, careersUrl: 'https://www.qatarenergy.qa/', backend: 'Custom', methods: AI_MANUAL, sourceKey: 'watch:qatarenergy', note: 'Careers page sits behind a login.' },
  { key: 'ooredoo', name: 'Ooredoo', country: 'QA', sector: 'telecom', nationalsOnly: false, careersUrl: 'https://www.ooredoo.qa/web/en/careers/', backend: 'SniperHire', methods: AI_MANUAL, sourceKey: 'watch:ooredoo', note: 'HTML-only job site.' },
  { key: 'qnb', name: 'QNB', country: 'QA', sector: 'banking', nationalsOnly: false, careersUrl: 'https://qnb.sniperhire.net/', backend: 'SniperHire', methods: AI_MANUAL, sourceKey: 'watch:qnb', note: 'HTML-only job site.' },
  // Saudi Arabia
  { key: 'aramco', name: 'Aramco', country: 'SA', sector: 'energy', nationalsOnly: false, careersUrl: 'https://careers.aramco.com/', backend: 'SAP SuccessFactors', methods: AI_MANUAL, sourceKey: 'watch:aramco', note: 'Refuses automated clients; not bypassed.' },
  { key: 'sabic', name: 'SABIC', country: 'SA', sector: 'petrochemicals', nationalsOnly: false, careersUrl: 'https://jobs.sabic.com/', backend: 'SAP SuccessFactors', methods: ['adapter'], sourceKey: 'successfactors:sabic', note: 'Job feed reachable, 0 jobs on the day.' },
  { key: 'stc', name: 'stc', country: 'SA', sector: 'telecom', nationalsOnly: false, careersUrl: 'https://careers.stc.com.sa/', backend: 'SAP SuccessFactors', methods: ['adapter'], sourceKey: 'successfactors:stc', note: 'Job feed reachable, site lists no openings.' },
  { key: 'saudia', name: 'Saudia', country: 'SA', sector: 'aviation', nationalsOnly: false, careersUrl: 'https://careers.saudia.com/', backend: 'SAP SuccessFactors', methods: ['adapter'], sourceKey: 'successfactors:saudia', note: '6 jobs in the job feed.' },
  { key: 'neom', name: 'NEOM', country: 'SA', sector: 'government', nationalsOnly: false, careersUrl: 'https://careers.neom.com/careers', backend: 'Custom', methods: AI_MANUAL, sourceKey: 'watch:neom', note: 'Custom site, no feed.' },
  { key: 'maaden', name: "Ma'aden", country: 'SA', sector: 'mining', nationalsOnly: false, careersUrl: 'https://www.maaden.com/careers', backend: 'Custom', methods: AI_MANUAL, sourceKey: 'watch:maaden', note: 'Custom page, no feed.' },
  { key: 'snb', name: 'Saudi National Bank', country: 'SA', sector: 'banking', nationalsOnly: false, careersUrl: 'https://www.alahli.com/', backend: 'Unknown', methods: AI_MANUAL, sourceKey: 'watch:snb', note: 'Site did not answer automated requests.' },
  { key: 'pif', name: 'PIF', country: 'SA', sector: 'investment', nationalsOnly: false, careersUrl: 'https://www.pif.gov.sa/en/careers', backend: 'Custom', methods: AI_MANUAL, sourceKey: 'watch:pif', note: 'Blocks automated clients (403); portfolio companies hire separately.' },
  // Kuwait
  { key: 'koc', name: 'Kuwait Oil Company', country: 'KW', sector: 'energy', nationalsOnly: false, careersUrl: 'https://www.kockw.com/', backend: 'Custom', methods: AI_MANUAL, sourceKey: 'watch:koc', note: 'No careers feed; most direct hires are Kuwaiti nationals.' },
  { key: 'knpc', name: 'KNPC', country: 'KW', sector: 'energy', nationalsOnly: false, careersUrl: 'https://www.knpc.com/', backend: 'Custom', methods: AI_MANUAL, sourceKey: 'watch:knpc', note: 'Careers page not found (404).' },
  { key: 'zain', name: 'Zain', country: 'KW', sector: 'telecom', nationalsOnly: false, careersUrl: 'https://careers.zain.com/', backend: 'Custom', methods: AI_MANUAL, sourceKey: 'watch:zain', note: 'Custom site, no feed.' },
  { key: 'nbk', name: 'National Bank of Kuwait', country: 'KW', sector: 'banking', nationalsOnly: false, careersUrl: 'https://www.nbk.com/kuwait/careers.html', backend: 'Custom', methods: AI_MANUAL, sourceKey: 'watch:nbk', note: 'Custom page, no feed.' },
  // Bahrain
  { key: 'bapco', name: 'Bapco Energies', country: 'BH', sector: 'energy', nationalsOnly: false, careersUrl: 'https://www.bapcoenergies.com/careers', backend: 'Oracle ORC', methods: ['adapter'], sourceKey: 'oracle_orc:bapco', note: '1 job.' },
  { key: 'beyon', name: 'Beyon (Batelco)', country: 'BH', sector: 'telecom', nationalsOnly: false, careersUrl: 'https://beyon.com/careers/', backend: 'Custom', methods: AI_MANUAL, sourceKey: 'watch:beyon', note: 'Custom page, no feed.' },
  // Oman
  { key: 'oq', name: 'OQ', country: 'OM', sector: 'energy', nationalsOnly: false, careersUrl: 'https://careers.oq.com/', backend: 'SAP SuccessFactors', methods: ['adapter'], sourceKey: 'successfactors:oq', note: '2 jobs in the job feed.' },
  { key: 'omantel', name: 'Omantel', country: 'OM', sector: 'telecom', nationalsOnly: false, careersUrl: 'https://www.omantel.om/', backend: 'Custom (sign-in)', methods: AI_MANUAL, sourceKey: 'watch:omantel', note: 'Careers site needs a Microsoft sign-in.' },
  { key: 'oman-air', name: 'Oman Air', country: 'OM', sector: 'aviation', nationalsOnly: false, careersUrl: 'https://www.omanair.com/en/careers', backend: 'Custom', methods: AI_MANUAL, sourceKey: 'watch:oman-air', note: 'Custom page, no feed.' },
]

/** Nationals-only portals deliberately left out (documented, never added). */
export const EXCLUDED_NATIONALS_ONLY: readonly { name: string; country: GccCountry; url: string }[] = [
  { name: 'Jadarat (Saudi national employment platform)', country: 'SA', url: 'https://jadarat.sa/' },
  { name: 'Kawader (Qatar)', country: 'QA', url: 'https://www.kawader.gov.qa/' },
  { name: 'Kuwait Civil Service Commission', country: 'KW', url: 'https://www.csc.gov.kw/' },
  { name: 'UAE federal government jobs (FAHR)', country: 'AE', url: 'https://www.fahr.gov.ae/' },
  { name: 'Abu Dhabi government jobs', country: 'AE', url: 'https://www.tamm.abudhabi/' },
]

export function watchEmployer(key: string): WatchEmployer | undefined {
  return WATCH_EMPLOYERS.find((e) => e.key === key)
}
