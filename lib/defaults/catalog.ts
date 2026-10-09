import { DEFAULT_SOURCES_V3 } from './catalog-v3'

/**
 * Starter data every account gets, applied once per DEFAULTS_VERSION (see
 * lib/defaults/apply.ts). Client-safe (data-only imports): the Settings › Sources
 * "Popular starters" buttons read the same list, so they can't drift.
 *
 * Board slugs were checked live against each ATS public API: v1 on
 * 2026-09-26 (Greenhouse boards-api, Lever v0 postings, Ashby posting-api),
 * v2 on 2026-09-27 (also the Workable widget, Recruitee, Pinpoint, Workday,
 * Oracle Recruiting Cloud, SuccessFactors, Phenom and the Kerala IT parks) — each v2 board's live job count is noted beside
 * it. Re-check before adding more — a plausible slug is often wrong (e.g.
 * Notion moved from Greenhouse to Ashby; Ashby `rain` is a US company, not
 * Rain in Bahrain; Greenhouse `slice` is not slice India).
 *
 * `enabled` defaults are kept few on purpose: every new posting gets an AI
 * match score (capped per source per run), and the free AI tiers have daily
 * request/token limits. The rest are added switched off — one click to use.
 */

export interface DefaultCompany {
  name: string
  domain: string
  website: string
  headquartersCountry?: string
}

export interface DefaultSource {
  /** Stable id — never change once shipped (used to dedupe and to add new defaults later). */
  key: string
  name: string
  kind: string
  /** Adapter config: `company` / `url`, plus kind-specific extras. */
  config: Record<string, unknown>
  enabled: boolean
  /** The company behind a company-board source (added to Companies). */
  company?: DefaultCompany
  /** DEFAULTS_VERSION that introduced it; existing users get it once they're below this. */
  since: number
}

/** Bump when adding defaults; users below it get only the newer ones. */
// 5 — Kuwait employers on the watch list (2026-10-09).
export const DEFAULTS_VERSION = 5

export interface DefaultWatchTerm {
  term: string
  aliases: readonly string[]
  kind: 'term' | 'entity'
  /** DEFAULTS_VERSION that introduced it (as for sources). */
  since: number
}

/**
 * The owner's starter AI Radar watch terms (Radar › Watchlist), asked for
 * on 2026-10-08: recent AI products and models to get regular updates on.
 * They are data, never assumptions: lee states nothing about them beyond
 * what the fetched sources say. Like the starter sources, they are added
 * once and can be edited or removed; a removed term is never re-added.
 */
export const DEFAULT_WATCH_TERMS: readonly DefaultWatchTerm[] = [
  { term: 'Jev', aliases: [], kind: 'entity', since: 4 },
  { term: 'Laya', aliases: [], kind: 'entity', since: 4 },
  { term: 'ChatGPT Dots', aliases: [], kind: 'entity', since: 4 },
  { term: 'Meta Muse', aliases: [], kind: 'entity', since: 4 },
]

export const DEFAULT_SOURCES: readonly DefaultSource[] = [
  // Broad, all-jobs sources
  { key: 'remoteok', name: 'RemoteOK', kind: 'remoteok', config: {}, enabled: true, since: 1 },
  { key: 'hn-whoishiring', name: "HN Who's Hiring", kind: 'hn_whoishiring', config: {}, enabled: true, since: 1 },
  { key: 'yc-directory', name: 'Y Combinator directory', kind: 'yc_directory', config: {}, enabled: false, since: 1 },

  // India — enabled
  {
    key: 'lever:paytm', name: 'Paytm (Lever)', kind: 'lever', config: { company: 'paytm' }, enabled: true, since: 1,
    company: { name: 'Paytm', domain: 'paytm.com', website: 'https://paytm.com', headquartersCountry: 'India' },
  },
  {
    key: 'lever:meesho', name: 'Meesho (Lever)', kind: 'lever', config: { company: 'meesho' }, enabled: true, since: 1,
    company: { name: 'Meesho', domain: 'meesho.com', website: 'https://meesho.com', headquartersCountry: 'India' },
  },
  {
    key: 'greenhouse:inmobi', name: 'InMobi (Greenhouse)', kind: 'greenhouse', config: { company: 'inmobi' }, enabled: true, since: 1,
    company: { name: 'InMobi', domain: 'inmobi.com', website: 'https://www.inmobi.com', headquartersCountry: 'India' },
  },
  {
    key: 'ashby:sarvam', name: 'Sarvam AI (Ashby)', kind: 'ashby', config: { company: 'sarvam' }, enabled: true, since: 1,
    company: { name: 'Sarvam AI', domain: 'sarvam.ai', website: 'https://www.sarvam.ai', headquartersCountry: 'India' },
  },

  // India — added, switched off
  {
    key: 'lever:cred', name: 'CRED (Lever)', kind: 'lever', config: { company: 'cred' }, enabled: false, since: 1,
    company: { name: 'CRED', domain: 'cred.club', website: 'https://cred.club', headquartersCountry: 'India' },
  },
  {
    key: 'lever:zeta', name: 'Zeta (Lever)', kind: 'lever', config: { company: 'zeta' }, enabled: false, since: 1,
    company: { name: 'Zeta', domain: 'zeta.tech', website: 'https://www.zeta.tech', headquartersCountry: 'India' },
  },
  {
    key: 'greenhouse:groww', name: 'Groww (Greenhouse)', kind: 'greenhouse', config: { company: 'groww' }, enabled: false, since: 1,
    company: { name: 'Groww', domain: 'groww.in', website: 'https://groww.in', headquartersCountry: 'India' },
  },

  // Global — added, switched off
  {
    key: 'greenhouse:stripe', name: 'Stripe (Greenhouse)', kind: 'greenhouse', config: { company: 'stripe' }, enabled: false, since: 1,
    company: { name: 'Stripe', domain: 'stripe.com', website: 'https://stripe.com', headquartersCountry: 'United States' },
  },
  {
    key: 'ashby:notion', name: 'Notion (Ashby)', kind: 'ashby', config: { company: 'notion' }, enabled: false, since: 1,
    company: { name: 'Notion', domain: 'notion.so', website: 'https://www.notion.so', headquartersCountry: 'United States' },
  },
  {
    key: 'ashby:ramp', name: 'Ramp (Ashby)', kind: 'ashby', config: { company: 'ramp' }, enabled: false, since: 1,
    company: { name: 'Ramp', domain: 'ramp.com', website: 'https://ramp.com', headquartersCountry: 'United States' },
  },

  // ── v2 (2026-09-27): GCC, more India, job alerts by email, free APIs ──
  // `// n` = live jobs on the board when checked on 2026-09-27.

  // Broad sources — enabled: the compliant route to Indeed / LinkedIn /
  // Naukri / NaukriGulf / Bayt / GulfTalent / Glassdoor, and remote roles
  // open to the GCC and India.
  { key: 'email-alerts', name: 'Job alerts by email', kind: 'email_alert', config: {}, enabled: true, since: 2 },
  { key: 'himalayas', name: 'Himalayas', kind: 'himalayas', config: {}, enabled: true, since: 2 },
  // Broad sources — added, switched off.
  { key: 'jobicy', name: 'Jobicy', kind: 'jobicy', config: {}, enabled: false, since: 2 },
  { key: 'weworkremotely', name: 'We Work Remotely', kind: 'weworkremotely', config: {}, enabled: false, since: 2 },
  { key: 'remotive', name: 'Remotive', kind: 'remotive', config: {}, enabled: false, since: 2 },
  { key: 'workingnomads', name: 'Working Nomads', kind: 'workingnomads', config: {}, enabled: false, since: 2 },
  { key: 'adzuna-in', name: 'Jobs by Adzuna (India)', kind: 'adzuna', config: {}, enabled: false, since: 2 },

  // GCC — enabled (a few only: each new posting costs one AI score)
  {
    key: 'greenhouse:careem', name: 'Careem (Greenhouse)', kind: 'greenhouse', config: { company: 'careem' }, enabled: true, since: 2, // 18
    company: { name: 'Careem', domain: 'careem.com', website: 'https://www.careem.com', headquartersCountry: 'United Arab Emirates' },
  },
  {
    key: 'greenhouse:tamara', name: 'Tamara (Greenhouse)', kind: 'greenhouse', config: { company: 'tamara' }, enabled: true, since: 2, // 30
    company: { name: 'Tamara', domain: 'tamara.co', website: 'https://tamara.co', headquartersCountry: 'Saudi Arabia' },
  },
  {
    key: 'pinpoint:tabby', name: 'Tabby (Pinpoint)', kind: 'pinpoint', config: { company: 'tabby', displayName: 'Tabby' }, enabled: true, since: 2, // 62
    company: { name: 'Tabby', domain: 'tabby.ai', website: 'https://tabby.ai', headquartersCountry: 'Saudi Arabia' },
  },
  {
    key: 'workable:bayutdubizzle', name: 'Dubizzle Group (Workable)', kind: 'workable', config: { company: 'bayutdubizzle' }, enabled: true, since: 2, // 49
    company: { name: 'Dubizzle Group', domain: 'dubizzlegroup.com', website: 'https://www.dubizzlegroup.com', headquartersCountry: 'United Arab Emirates' },
  },

  // GCC — added, switched off
  {
    key: 'ashby:ziina', name: 'Ziina (Ashby)', kind: 'ashby', config: { company: 'ziina' }, enabled: false, since: 2, // 15
    company: { name: 'Ziina', domain: 'ziina.com', website: 'https://www.ziina.com', headquartersCountry: 'United Arab Emirates' },
  },
  {
    key: 'ashby:leantech', name: 'Lean Technologies (Ashby)', kind: 'ashby', config: { company: 'leantech' }, enabled: false, since: 2, // 3
    company: { name: 'Lean Technologies', domain: 'leantech.me', website: 'https://www.leantech.me', headquartersCountry: 'United Arab Emirates' },
  },
  {
    key: 'greenhouse:hala', name: 'HALA (Greenhouse)', kind: 'greenhouse', config: { company: 'hala' }, enabled: false, since: 2, // 14
    company: { name: 'HALA', domain: 'hala.com', website: 'https://hala.com', headquartersCountry: 'Saudi Arabia' },
  },
  {
    key: 'workable:salla', name: 'Salla (Workable)', kind: 'workable', config: { company: 'salla' }, enabled: false, since: 2, // 28
    company: { name: 'Salla', domain: 'salla.com', website: 'https://salla.com', headquartersCountry: 'Saudi Arabia' },
  },
  {
    key: 'workable:foodics', name: 'Foodics (Workable)', kind: 'workable', config: { company: 'foodics' }, enabled: false, since: 2, // 26
    company: { name: 'Foodics', domain: 'foodics.com', website: 'https://www.foodics.com', headquartersCountry: 'Saudi Arabia' },
  },
  {
    key: 'workable:lucidya', name: 'Lucidya (Workable)', kind: 'workable', config: { company: 'lucidya' }, enabled: false, since: 2, // 44
    company: { name: 'Lucidya', domain: 'lucidya.com', website: 'https://lucidya.com', headquartersCountry: 'Saudi Arabia' },
  },
  {
    key: 'workable:mozn-ai', name: 'Mozn (Workable)', kind: 'workable', config: { company: 'mozn-ai' }, enabled: false, since: 2, // 16
    company: { name: 'Mozn', domain: 'mozn.ai', website: 'https://mozn.ai', headquartersCountry: 'Saudi Arabia' },
  },
  {
    key: 'recruitee:unifonic', name: 'Unifonic (Recruitee)', kind: 'recruitee', config: { company: 'unifonic' }, enabled: false, since: 2, // 30
    company: { name: 'Unifonic', domain: 'unifonic.com', website: 'https://www.unifonic.com', headquartersCountry: 'Saudi Arabia' },
  },

  // India — added, switched off (v1 already enables four India boards)
  {
    key: 'greenhouse:razorpaysoftwareprivatelimited', name: 'Razorpay (Greenhouse)', kind: 'greenhouse', // 26
    config: { company: 'razorpaysoftwareprivatelimited' }, enabled: false, since: 2,
    company: { name: 'Razorpay', domain: 'razorpay.com', website: 'https://razorpay.com', headquartersCountry: 'India' },
  },
  {
    key: 'ashby:tekion', name: 'Tekion (Ashby)', kind: 'ashby', config: { company: 'tekion' }, enabled: false, since: 2, // 115
    company: { name: 'Tekion', domain: 'tekion.com', website: 'https://tekion.com', headquartersCountry: 'United States' },
  },
  {
    key: 'workable:innovaccer-analytics', name: 'Innovaccer (Workable)', kind: 'workable', config: { company: 'innovaccer-analytics' }, enabled: false, since: 2, // 73
    company: { name: 'Innovaccer', domain: 'innovaccer.com', website: 'https://innovaccer.com', headquartersCountry: 'United States' },
  },
  {
    key: 'lever:hevodata', name: 'Hevo Data (Lever)', kind: 'lever', config: { company: 'hevodata' }, enabled: false, since: 2, // 52
    company: { name: 'Hevo Data', domain: 'hevodata.com', website: 'https://hevodata.com', headquartersCountry: 'India' },
  },
  {
    key: 'greenhouse:druva', name: 'Druva (Greenhouse)', kind: 'greenhouse', config: { company: 'druva' }, enabled: false, since: 2, // 35
    company: { name: 'Druva', domain: 'druva.com', website: 'https://www.druva.com', headquartersCountry: 'United States' },
  },
  {
    key: 'lever:mindtickle', name: 'Mindtickle (Lever)', kind: 'lever', config: { company: 'mindtickle' }, enabled: false, since: 2, // 18
    company: { name: 'Mindtickle', domain: 'mindtickle.com', website: 'https://www.mindtickle.com', headquartersCountry: 'India' },
  },
  {
    key: 'lever:fampay', name: 'FamPay (Lever)', kind: 'lever', config: { company: 'fampay' }, enabled: false, since: 2, // 15
    company: { name: 'FamPay', domain: 'famapp.in', website: 'https://famapp.in', headquartersCountry: 'India' },
  },
  {
    key: 'greenhouse:observeai', name: 'Observe.AI (Greenhouse)', kind: 'greenhouse', config: { company: 'observeai' }, enabled: false, since: 2, // 14
    company: { name: 'Observe.AI', domain: 'observe.ai', website: 'https://www.observe.ai', headquartersCountry: 'United States' },
  },
  {
    key: 'ashby:atlan', name: 'Atlan (Ashby)', kind: 'ashby', config: { company: 'atlan' }, enabled: false, since: 2, // 8
    company: { name: 'Atlan', domain: 'atlan.com', website: 'https://atlan.com', headquartersCountry: 'India' },
  },

  // Kerala IT parks — public listings, robots allow (see lib/discovery/adapters/kerala-parks.ts)
  { key: 'technopark', name: 'Technopark (Trivandrum)', kind: 'technopark', config: {}, enabled: true, since: 2 }, // 362
  { key: 'infopark', name: 'Infopark (Kochi)', kind: 'infopark', config: {}, enabled: true, since: 2 }, // ~466
  { key: 'cyberpark', name: 'Kerala Cyberpark (Kozhikode)', kind: 'cyberpark', config: {}, enabled: false, since: 2 }, // 29
  { key: 'ul-cyberpark', name: 'UL Cyberpark (Kozhikode)', kind: 'ul_cyberpark', config: {}, enabled: false, since: 2 }, // 26
  { key: 'ksum', name: 'Kerala Startup Mission', kind: 'ksum', config: {}, enabled: false, since: 2 }, // 15

  // Enterprise careers backends (Oracle ORC / SuccessFactors / Phenom / Workday), GCC + India.
  // `// n` = jobs read in the target countries on 2026-09-27.
  {
    key: 'oracle_orc:ibs', name: 'IBS Software (Oracle)', kind: 'oracle_orc', // 69; 35 in Kochi / Trivandrum
    config: { host: 'fa-etbm-saasfaprod1.fa.ocs.oraclecloud.com', siteNumber: 'CX_1', displayName: 'IBS Software' }, enabled: true, since: 2,
    company: { name: 'IBS Software', domain: 'ibsplc.com', website: 'https://www.ibsplc.com', headquartersCountry: 'India' },
  },
  {
    key: 'oracle_orc:emiratesnbd', name: 'Emirates NBD (Oracle)', kind: 'oracle_orc', // 22
    config: { host: 'fa-evlo-saasfaprod1.fa.ocs.oraclecloud.com', siteNumber: 'CX_1', displayName: 'Emirates NBD' }, enabled: false, since: 2,
    company: { name: 'Emirates NBD', domain: 'emiratesnbd.com', website: 'https://www.emiratesnbd.com', headquartersCountry: 'United Arab Emirates' },
  },
  {
    key: 'oracle_orc:fab', name: 'First Abu Dhabi Bank (Oracle)', kind: 'oracle_orc', // 124
    config: { host: 'ehjd.fa.em2.oraclecloud.com', siteNumber: 'fabCareers', displayName: 'First Abu Dhabi Bank' }, enabled: false, since: 2,
    company: { name: 'First Abu Dhabi Bank', domain: 'bankfab.com', website: 'https://www.bankfab.com', headquartersCountry: 'United Arab Emirates' },
  },
  {
    key: 'oracle_orc:mashreq', name: 'Mashreq (Oracle)', kind: 'oracle_orc', // 245
    config: { host: 'hcld.fa.em2.oraclecloud.com', siteNumber: 'CX_1', displayName: 'Mashreq' }, enabled: false, since: 2,
    company: { name: 'Mashreq', domain: 'mashreq.com', website: 'https://www.mashreq.com', headquartersCountry: 'United Arab Emirates' },
  },
  {
    key: 'oracle_orc:eand', name: 'e& UAE (Oracle)', kind: 'oracle_orc', // 17
    config: { host: 'iaayey.fa.ocs.oraclecloud26.com', siteNumber: 'CX_1', displayName: 'e&' }, enabled: false, since: 2,
    company: { name: 'e&', domain: 'eand.com', website: 'https://www.eand.com', headquartersCountry: 'United Arab Emirates' },
  },
  {
    key: 'oracle_orc:du', name: 'du (Oracle)', kind: 'oracle_orc', // 10
    config: { host: 'fa-ewnx-saasfaprod1.fa.ocs.oraclecloud.com', siteNumber: 'CX_1001', displayName: 'du' }, enabled: false, since: 2,
    company: { name: 'du', domain: 'du.ae', website: 'https://www.du.ae', headquartersCountry: 'United Arab Emirates' },
  },
  {
    key: 'oracle_orc:dpworld', name: 'DP World (Oracle)', kind: 'oracle_orc', // 129
    config: { host: 'ehpv.fa.em2.oraclecloud.com', siteNumber: 'CX_1', displayName: 'DP World' }, enabled: false, since: 2,
    company: { name: 'DP World', domain: 'dpworld.com', website: 'https://www.dpworld.com', headquartersCountry: 'United Arab Emirates' },
  },
  {
    key: 'oracle_orc:dubaiholding', name: 'Dubai Holding (Oracle)', kind: 'oracle_orc', // 33
    config: { host: 'esbe.fa.em8.oraclecloud.com', siteNumber: 'CX_1001', displayName: 'Dubai Holding' }, enabled: false, since: 2,
    company: { name: 'Dubai Holding', domain: 'dubaiholding.com', website: 'https://www.dubaiholding.com', headquartersCountry: 'United Arab Emirates' },
  },
  {
    key: 'oracle_orc:kpmg-india', name: 'KPMG India (Oracle)', kind: 'oracle_orc', // 499
    config: { host: 'ejgk.fa.em2.oraclecloud.com', siteNumber: 'CX_3', displayName: 'KPMG India' }, enabled: false, since: 2,
    company: { name: 'KPMG India', domain: 'kpmg.com', website: 'https://kpmg.com/in/en/careers.html', headquartersCountry: 'India' },
  },
  {
    key: 'oracle_orc:oracle', name: 'Oracle (Oracle)', kind: 'oracle_orc', // 29
    config: { host: 'eeho.fa.us2.oraclecloud.com', siteNumber: 'CX_45001', displayName: 'Oracle' }, enabled: false, since: 2,
    company: { name: 'Oracle', domain: 'oracle.com', website: 'https://www.oracle.com/careers/', headquartersCountry: 'United States' },
  },
  {
    key: 'successfactors:adcb', name: 'ADCB (SuccessFactors)', kind: 'successfactors', // 38
    config: { host: 'adcbcareers.com', displayName: 'ADCB' }, enabled: false, since: 2,
    company: { name: 'ADCB', domain: 'adcb.com', website: 'https://www.adcb.com', headquartersCountry: 'United Arab Emirates' },
  },
  {
    key: 'successfactors:alfuttaim', name: 'Al-Futtaim (SuccessFactors)', kind: 'successfactors', // 204
    config: { host: 'www.afuturewithus.com', displayName: 'Al-Futtaim' }, enabled: false, since: 2,
    company: { name: 'Al-Futtaim', domain: 'alfuttaim.com', website: 'https://www.alfuttaim.com', headquartersCountry: 'United Arab Emirates' },
  },
  {
    key: 'successfactors:stc', name: 'stc (SuccessFactors)', kind: 'successfactors', // 5
    config: { host: 'careers.stc.com.sa', displayName: 'stc' }, enabled: false, since: 2,
    company: { name: 'stc', domain: 'stc.com.sa', website: 'https://www.stc.com.sa', headquartersCountry: 'Saudi Arabia' },
  },
  {
    key: 'successfactors:deloitte-sa', name: 'Deloitte South Asia (SuccessFactors)', kind: 'successfactors', // 1928
    config: { host: 'southasiacareers.deloitte.com', displayName: 'Deloitte' }, enabled: false, since: 2,
    company: { name: 'Deloitte India', domain: 'deloitte.com', website: 'https://southasiacareers.deloitte.com', headquartersCountry: 'India' },
  },
  {
    key: 'phenom:g42', name: 'G42 (Phenom)', kind: 'phenom', // 46
    config: { host: 'careers.g42.ai', pageId: 'page3', displayName: 'G42' }, enabled: true, since: 2,
    company: { name: 'G42', domain: 'g42.ai', website: 'https://www.g42.ai', headquartersCountry: 'United Arab Emirates' },
  },
  {
    key: 'phenom:majidalfuttaim', name: 'Majid Al Futtaim (Phenom)', kind: 'phenom', // 139
    config: { host: 'careers.majidalfuttaim.com', pageId: 'page10', displayName: 'Majid Al Futtaim' }, enabled: false, since: 2,
    company: { name: 'Majid Al Futtaim', domain: 'majidalfuttaim.com', website: 'https://www.majidalfuttaim.com', headquartersCountry: 'United Arab Emirates' },
  },
  {
    key: 'phenom:adnoc', name: 'ADNOC (Phenom)', kind: 'phenom', // 72
    config: { host: 'jobs.adnoc.ae', pageId: 'page12', displayName: 'ADNOC', country: 'us', lang: 'en_us', pathPrefix: '/us/en' }, enabled: false, since: 2,
    company: { name: 'ADNOC', domain: 'adnoc.ae', website: 'https://www.adnoc.ae', headquartersCountry: 'United Arab Emirates' },
  },
  {
    key: 'phenom:questglobal', name: 'Quest Global (Phenom)', kind: 'phenom', // 200 (India; 42 in Kerala)
    config: { host: 'careers.quest-global.com', pageId: 'page20', displayName: 'Quest Global' }, enabled: false, since: 2,
    company: { name: 'Quest Global', domain: 'quest-global.com', website: 'https://www.quest-global.com', headquartersCountry: 'Singapore' },
  },
  {
    key: 'workday:salesforce', name: 'Salesforce (Workday)', kind: 'workday', // 100 (IN 118, UAE 12, KSA 12)
    config: { url: 'https://salesforce.wd12.myworkdayjobs.com/External_Career_Site', displayName: 'Salesforce' }, enabled: false, since: 2,
    company: { name: 'Salesforce', domain: 'salesforce.com', website: 'https://www.salesforce.com', headquartersCountry: 'United States' },
  },
  {
    key: 'workday:visa', name: 'Visa (Workday)', kind: 'workday', // 100 (IN 74, UAE 18, KSA 10)
    config: { url: 'https://visa.wd5.myworkdayjobs.com/Visa', displayName: 'Visa' }, enabled: false, since: 2,
    company: { name: 'Visa', domain: 'visa.com', website: 'https://corporate.visa.com', headquartersCountry: 'United States' },
  },
  {
    key: 'workday:adobe', name: 'Adobe (Workday)', kind: 'workday', // 93
    config: { url: 'https://adobe.wd5.myworkdayjobs.com/external_experienced', displayName: 'Adobe' }, enabled: false, since: 2,
    company: { name: 'Adobe', domain: 'adobe.com', website: 'https://www.adobe.com', headquartersCountry: 'United States' },
  },
  {
    key: 'workday:cisco', name: 'Cisco (Workday)', kind: 'workday', // 318 match "India"
    config: { url: 'https://cisco.wd5.myworkdayjobs.com/Cisco_Careers', displayName: 'Cisco', searchText: 'India' }, enabled: false, since: 2,
    company: { name: 'Cisco', domain: 'cisco.com', website: 'https://www.cisco.com', headquartersCountry: 'United States' },
  },
  {
    key: 'workday:mastercard', name: 'Mastercard (Workday)', kind: 'workday', // 8 in the newest 100
    config: { url: 'https://mastercard.wd1.myworkdayjobs.com/CorporateCareers', displayName: 'Mastercard' }, enabled: false, since: 2,
    company: { name: 'Mastercard', domain: 'mastercard.com', website: 'https://www.mastercard.com', headquartersCountry: 'United States' },
  },
  {
    key: 'workday:paypal', name: 'PayPal (Workday)', kind: 'workday', // 5 in the newest 100
    config: { url: 'https://paypal.wd1.myworkdayjobs.com/jobs', displayName: 'PayPal' }, enabled: false, since: 2,
    company: { name: 'PayPal', domain: 'paypal.com', website: 'https://www.paypal.com', headquartersCountry: 'United States' },
  },
  {
    key: 'workday:pwc', name: 'PwC (Workday)', kind: 'workday', // 24 in the newest 100
    config: { url: 'https://pwc.wd3.myworkdayjobs.com/Global_Experienced_Careers', displayName: 'PwC' }, enabled: false, since: 2,
    company: { name: 'PwC', domain: 'pwc.com', website: 'https://www.pwc.com', headquartersCountry: 'United Kingdom' },
  },
  {
    key: 'greenhouse:thoughtworks', name: 'Thoughtworks (Greenhouse)', kind: 'greenhouse', // 35
    config: { company: 'thoughtworks' }, enabled: false, since: 2,
    company: { name: 'Thoughtworks', domain: 'thoughtworks.com', website: 'https://www.thoughtworks.com', headquartersCountry: 'United States' },
  },
  { key: 'rss:chalhoub', name: 'Chalhoub Group (Teamtailor RSS)', kind: 'rss', config: { url: 'https://careers.chalhoubgroup.com/jobs.rss' }, enabled: false, since: 2 }, // newest 100

  // Watch links — never fetched (robots.txt / terms forbid it, a login or bot wall, or no public feed).
  { key: 'watch:talabat', name: 'talabat careers', kind: 'watch', config: { url: 'https://careers.talabat.com/', reason: 'Its job API (api.smartrecruiters.com) disallows all robots except LinkedIn in robots.txt.' }, enabled: false, since: 2 },
  { key: 'watch:hungerstation', name: 'HungerStation careers', kind: 'watch', config: { url: 'https://careers.deliveryhero.com/hungerstation', reason: 'Its job API (api.smartrecruiters.com) disallows all robots except LinkedIn in robots.txt.' }, enabled: false, since: 2 },
  { key: 'watch:etihad', name: 'Etihad careers', kind: 'watch', config: { url: 'https://careers.etihad.com/', reason: 'Its job API (api.smartrecruiters.com) disallows all robots except LinkedIn in robots.txt.' }, enabled: false, since: 2 },
  { key: 'watch:swiggy', name: 'Swiggy careers', kind: 'watch', config: { url: 'https://careers.swiggy.com/', reason: 'Its job API (api.smartrecruiters.com) disallows all robots except LinkedIn in robots.txt.' }, enabled: false, since: 2 },
  { key: 'watch:freshworks', name: 'Freshworks careers', kind: 'watch', config: { url: 'https://www.freshworks.com/company/careers/', reason: 'Its job API (api.smartrecruiters.com) disallows all robots except LinkedIn in robots.txt.' }, enabled: false, since: 2 },
  { key: 'watch:noon', name: 'noon careers', kind: 'watch', config: { url: 'https://www.joinnoon.com/jobs', reason: 'robots.txt disallows everything.' }, enabled: false, since: 2 },
  { key: 'watch:aramco', name: 'Aramco careers', kind: 'watch', config: { url: 'https://careers.aramco.com/', reason: 'The site blocks automated clients.' }, enabled: false, since: 2 },
  { key: 'watch:mubadala', name: 'Mubadala careers', kind: 'watch', config: { url: 'https://www.mubadala.com/en/careers', reason: 'No public job feed; links out to group companies.' }, enabled: false, since: 2 },
  { key: 'watch:qnb', name: 'QNB careers', kind: 'watch', config: { url: 'https://qnb.sniperhire.net/', reason: 'HTML-only job site, no feed or API.' }, enabled: false, since: 2 },
  { key: 'watch:ooredoo', name: 'Ooredoo careers', kind: 'watch', config: { url: 'https://www.ooredoo.qa/web/en/careers/', reason: 'Login-oriented job site, no feed.' }, enabled: false, since: 2 },
  { key: 'watch:emirates-group', name: 'Emirates Group careers', kind: 'watch', config: { url: 'https://www.emiratesgroupcareers.com/search-and-apply/', reason: 'Custom site; no generic lee reader yet.' }, enabled: false, since: 2 },
  { key: 'watch:flydubai', name: 'flydubai careers', kind: 'watch', config: { url: 'https://careers.flydubai.com/', reason: 'Custom site; no generic lee reader yet.' }, enabled: false, since: 2 },
  { key: 'watch:amazon', name: 'Amazon jobs (India / GCC)', kind: 'watch', config: { url: 'https://www.amazon.jobs/en/search?country[]=IND&country[]=ARE&country[]=SAU', reason: 'Terms for automated access could not be confirmed.' }, enabled: false, since: 2 },
  { key: 'watch:google', name: 'Google careers (India)', kind: 'watch', config: { url: 'https://www.google.com/about/careers/applications/jobs/results?location=India', reason: 'Google terms tie automated access to robots.txt, which blocks paging.' }, enabled: false, since: 2 },
  { key: 'watch:microsoft', name: 'Microsoft careers (India / UAE)', kind: 'watch', config: { url: 'https://apply.careers.microsoft.com/careers?location=India', reason: 'Its career platform (Eightfold) terms forbid robots.' }, enabled: false, since: 2 },
  { key: 'watch:atlassian', name: 'Atlassian careers', kind: 'watch', config: { url: 'https://www.atlassian.com/company/careers/all-jobs', reason: 'Own feed; terms not confirmed.' }, enabled: false, since: 2 },
  { key: 'watch:tcs', name: 'TCS careers', kind: 'watch', config: { url: 'https://ibegin.tcs.com/iBegin/', reason: 'The site blocks automated clients.' }, enabled: false, since: 2 },
  { key: 'watch:infosys', name: 'Infosys careers', kind: 'watch', config: { url: 'https://career.infosys.com/joblist', reason: 'The site blocks automated clients.' }, enabled: false, since: 2 },
  { key: 'watch:ust', name: 'UST careers', kind: 'watch', config: { url: 'https://www.ust.com/en/careers', reason: 'Search needs a private token.' }, enabled: false, since: 2 },
  { key: 'watch:ey', name: 'EY careers (Kochi / Trivandrum)', kind: 'watch', config: { url: 'https://careers.ey.com/ey/search/?q=&locationsearch=Kerala', reason: 'Feed too large to read within the time limit; its RSS is disallowed.' }, enabled: false, since: 2 },
  { key: 'watch:wipro', name: 'Wipro careers', kind: 'watch', config: { url: 'https://careers.wipro.com/', reason: 'Feed too large to read within the time limit; its RSS is disallowed.' }, enabled: false, since: 2 },
  { key: 'watch:tata-elxsi', name: 'Tata Elxsi careers', kind: 'watch', config: { url: 'https://www.tataelxsi.com/careers/job-openings', reason: 'HTML only, no feed.' }, enabled: false, since: 2 },
  { key: 'watch:experion', name: 'Experion Technologies careers', kind: 'watch', config: { url: 'https://experionglobal.com/careers/', reason: 'robots.txt disallows the job pages.' }, enabled: false, since: 2 },
  { key: 'watch:kinfra', name: 'KINFRA careers', kind: 'watch', config: { url: 'https://kinfra.org/careers', reason: 'Only its own occasional notices; nothing to poll.' }, enabled: false, since: 2 },
  { key: 'watch:smartcity-kochi', name: 'SmartCity Kochi job posts', kind: 'watch', config: { url: 'https://smartcity-kochi.in/media-hub/job-openings/', reason: 'News-style posts, rarely updated.' }, enabled: false, since: 2 },
  { key: 'watch:dubizzle-jobs', name: 'dubizzle Jobs', kind: 'watch', config: { url: 'https://dubai.dubizzle.com/jobs/', reason: 'Bot wall; terms forbid scraping.' }, enabled: false, since: 2 },
  { key: 'watch:laimoon', name: 'Laimoon', kind: 'watch', config: { url: 'https://laimoon.com/uae/jobs', reason: 'No API; access rules unknown.' }, enabled: false, since: 2 },
  { key: 'watch:wuzzuf', name: 'Wuzzuf', kind: 'watch', config: { url: 'https://wuzzuf.net/jobs', reason: 'Bot wall; set up its email alerts instead.' }, enabled: false, since: 2 },
  { key: 'watch:akhtaboot', name: 'Akhtaboot', kind: 'watch', config: { url: 'https://www.akhtaboot.com/en/jobs', reason: 'robots.txt disallows everything.' }, enabled: false, since: 2 },
  { key: 'watch:tanqeeb', name: 'Tanqeeb', kind: 'watch', config: { url: 'https://uae.tanqeeb.com/', reason: 'robots.txt disallows search pages.' }, enabled: false, since: 2 },
  { key: 'watch:drjob', name: 'Dr.Job', kind: 'watch', config: { url: 'https://www.drjobpro.com/', reason: 'Terms forbid robots and crawlers.' }, enabled: false, since: 2 },
  { key: 'watch:instahyre', name: 'Instahyre', kind: 'watch', config: { url: 'https://www.instahyre.com/', reason: 'Terms forbid crawling; it emails matches.' }, enabled: false, since: 2 },
  { key: 'watch:cutshort', name: 'Cutshort', kind: 'watch', config: { url: 'https://cutshort.io/jobs', reason: 'Terms forbid automated access.' }, enabled: false, since: 2 },
  { key: 'watch:wellfound', name: 'Wellfound', kind: 'watch', config: { url: 'https://wellfound.com/jobs', reason: 'Terms forbid scraping.' }, enabled: false, since: 2 },
  { key: 'watch:hirist', name: 'Hirist', kind: 'watch', config: { url: 'https://www.hirist.tech/', reason: 'Terms forbid crawling.' }, enabled: false, since: 2 },
  { key: 'watch:iimjobs', name: 'iimjobs', kind: 'watch', config: { url: 'https://www.iimjobs.com/', reason: 'Same owner as Hirist; terms forbid crawling.' }, enabled: false, since: 2 },
  { key: 'watch:foundit', name: 'foundit (Monster India)', kind: 'watch', config: { url: 'https://www.foundit.in/', reason: 'Bot wall.' }, enabled: false, since: 2 },
  { key: 'watch:internshala', name: 'Internshala', kind: 'watch', config: { url: 'https://internshala.com/jobs/', reason: 'Terms forbid bots.' }, enabled: false, since: 2 },
  { key: 'watch:kkem', name: 'Kerala Knowledge Mission (DWMS)', kind: 'watch', config: { url: 'https://knowledgemission.kerala.gov.in/', reason: 'Login portal.' }, enabled: false, since: 2 },

  // ── v3 (2026-10-08): GCC employer watch list (lib/defaults/catalog-v3.ts) ──
  ...DEFAULT_SOURCES_V3,
]

/**
 * Identity of a source for de-duplication: kind + its one config value
 * (board slug, URL, or host + site for enterprise career sites).
 */
export function sourceIdentity(kind: string, config: Record<string, unknown>): string {
  const str = (k: string): string => (typeof config[k] === 'string' ? (config[k] as string) : '')
  const value = str('company') || str('url') || [str('host'), str('siteNumber')].filter(Boolean).join('/')
  return `${kind}:${value.toLowerCase()}`
}
