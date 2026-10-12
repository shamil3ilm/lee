import type { DefaultSource } from './catalog'

/**
 * v7 starter defaults (2026-10-12): Kuwait and UAE education and healthcare
 * employers whose boards were verified live on 2026-10-12 with one GET each
 * (job counts beside them), plus the job-news roundup sources. Robots and
 * terms evidence is in docs/job-sources.md ("BambooHR", "Employer board
 * auto-detect", "Job-news roundups").
 *
 * Kuwait boards are switched on (the owner's top priority, few postings);
 * the UAE ones are added switched off: Settings › Sources › Coverage turns
 * them on in one click. Employers checked the same day with no readable
 * board (AUK and GEMS on Bayt careers, GUST behind Cloudflare, AUM and ASK
 * disallowing all robots, Dar Al Shifa and Mediclinic on SuccessFactors,
 * M42 on iCIMS, Khalifa University on Taleo, the rest custom pages) are
 * recorded in the seed with a note and left to the weekly auto-detect.
 */

const CHECKED = '2026-10-12'

const KUWAIT_V7: readonly DefaultSource[] = [
  {
    key: 'bamboohr:aiu', name: 'American International University (BambooHR)', kind: 'bamboohr', // 41, all Jahra (Saad Al Abdullah)
    config: { company: 'aiu', displayName: 'American International University' },
    enabled: true, since: 7, regions: ['kw'], checkedOn: CHECKED,
    company: { name: 'American International University', domain: 'aiu.edu.kw', website: 'https://www.aiu.edu.kw', headquartersCountry: 'Kuwait' },
  },
  {
    key: 'bamboohr:absedu', name: 'American Baccalaureate School (BambooHR)', kind: 'bamboohr', // 3, Khaitan
    config: { company: 'absedu', displayName: 'American Baccalaureate School' },
    enabled: true, since: 7, regions: ['kw'], checkedOn: CHECKED,
    company: { name: 'American Baccalaureate School', domain: 'abs.edu.kw', website: 'https://www.abs.edu.kw', headquartersCountry: 'Kuwait' },
  },
  {
    key: 'rss:taiba-hospital', name: 'Taiba Hospital (Teamtailor RSS)', kind: 'rss', // 19, Sabah Al Salem
    config: { url: 'https://careers.taibahospital.com/jobs.rss' },
    enabled: true, since: 7, regions: ['kw'], checkedOn: CHECKED,
    company: { name: 'Taiba Hospital', domain: 'taibahospital.com', website: 'https://www.taibahospital.com', headquartersCountry: 'Kuwait' },
  },
]

const UAE_V7: readonly DefaultSource[] = [
  {
    key: 'oracle_orc:nmc', name: 'NMC Healthcare (Oracle)', kind: 'oracle_orc', // 146, all UAE
    config: { host: 'eiby.fa.em2.oraclecloud.com', siteNumber: 'CX_1', displayName: 'NMC Healthcare' },
    enabled: false, since: 7, regions: ['ae'], checkedOn: CHECKED,
    company: { name: 'NMC Healthcare', domain: 'nmc.ae', website: 'https://nmc.ae', headquartersCountry: 'United Arab Emirates' },
  },
  {
    key: 'oracle_orc:aster', name: 'Aster DM Healthcare (Oracle)', kind: 'oracle_orc', // 640; 223 UAE, the rest mostly India
    config: { host: 'hcdtgccprod-iayeqy.fa.ocs.oraclecloud.com', siteNumber: 'CX', displayName: 'Aster DM Healthcare' },
    enabled: false, since: 7, regions: ['ae', 'in'], checkedOn: CHECKED,
    company: { name: 'Aster DM Healthcare', domain: 'asterdmhealthcare.com', website: 'https://www.asterdmhealthcare.com', headquartersCountry: 'United Arab Emirates' },
  },
  {
    key: 'oracle_orc:zayed-university', name: 'Zayed University (Oracle)', kind: 'oracle_orc', // 14, all UAE
    config: { host: 'fa-evge-saasfaprod1.fa.ocs.oraclecloud.com', siteNumber: 'CX_1', displayName: 'Zayed University' },
    enabled: false, since: 7, regions: ['ae'], checkedOn: CHECKED,
    company: { name: 'Zayed University', domain: 'zu.ac.ae', website: 'https://www.zu.ac.ae', headquartersCountry: 'United Arab Emirates' },
  },
  {
    key: 'oracle_orc:cud', name: 'Canadian University Dubai (Oracle)', kind: 'oracle_orc', // 6, all UAE (faculty)
    config: { host: 'fa-eufk-saasfaprod1.fa.ocs.oraclecloud.com', siteNumber: 'CX_1', displayName: 'Canadian University Dubai' },
    enabled: false, since: 7, regions: ['ae'], checkedOn: CHECKED,
    company: { name: 'Canadian University Dubai', domain: 'cud.ac.ae', website: 'https://www.cud.ac.ae', headquartersCountry: 'United Arab Emirates' },
  },
]

/**
 * Job-news roundups (lib/discovery/adapters/wp-job-news.ts). Pravasi News
 * Daily: WordPress, robots.txt disallows only /wp-admin/, no terms page
 * forbidding feeds; "Jobs" is category 20 (513 posts, about 27 between
 * Oct 9 and Oct 12). Pravasi Varthakal: "JOB" is category 78, last job post
 * in June 2026 — added switched off (stale).
 */
const JOB_NEWS_V7: readonly DefaultSource[] = [
  {
    key: 'wp_job_news:pravasinewsdaily', name: 'Pravasi News Daily (job news)', kind: 'wp_job_news',
    config: {
      url: 'https://www.pravasinewsdaily.com',
      jobCategories: [20],
      countryCategories: { '3': 'AE', '47': 'KW', '8': 'QA', '344': 'IN' },
      siteName: 'Pravasi News Daily',
      siteKey: 'pravasinewsdaily',
    },
    enabled: true, since: 7, regions: ['ae', 'kw', 'qa'], checkedOn: CHECKED,
  },
  {
    key: 'wp_job_news:pravasivarthakal', name: 'Pravasi Varthakal (job news, inactive since June 2026)', kind: 'wp_job_news',
    config: {
      url: 'https://pravasivarthakal.in',
      jobCategories: [78],
      countryCategories: { '27': 'KW', '988': 'QA', '5': 'IN' },
      siteName: 'Pravasi Varthakal',
      siteKey: 'pravasivarthakal',
    },
    enabled: false, since: 7, regions: ['ae', 'kw'], checkedOn: CHECKED,
  },
]

export const DEFAULT_SOURCES_V7: readonly DefaultSource[] = [...KUWAIT_V7, ...UAE_V7, ...JOB_NEWS_V7]
