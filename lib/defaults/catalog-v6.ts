import type { DefaultSource } from './catalog'

/**
 * v6 starter defaults (2026-10-09): Kuwait and UAE employer boards found in
 * the Kuwait coverage audit. Each board was checked live with one GET on
 * 2026-10-09 (total jobs, Kuwait / UAE jobs beside it) and the employer
 * confirmed from its own careers page or the postings. Robots / terms
 * evidence is in docs/job-sources.md ("Kuwait coverage audit").
 *
 * Kuwait boards are switched on (few postings, the owner's top priority);
 * the UAE one is added switched off: Settings › Sources › Coverage turns
 * it on in one click. (Ziina, Tamara, Lean and HALA were re-verified the
 * same day; they already ship in v2.)
 */

const CHECKED = '2026-10-09'

const KUWAIT_V6: readonly DefaultSource[] = [
  {
    key: 'oracle_orc:gulfbank', name: 'Gulf Bank (Oracle)', kind: 'oracle_orc', // 6, all in Kuwait
    config: { host: 'fa-ewqb-saasfaprod1.fa.ocs.oraclecloud.com', siteNumber: 'JobSearch-GulfBank', displayName: 'Gulf Bank' },
    enabled: true, since: 6, regions: ['kw'], checkedOn: CHECKED,
    company: { name: 'Gulf Bank', domain: 'e-gulfbank.com', website: 'https://www.e-gulfbank.com', headquartersCountry: 'Kuwait' },
  },
  {
    key: 'oracle_orc:kfh', name: 'Kuwait Finance House (Oracle)', kind: 'oracle_orc', // 0 on the day
    config: { host: 'fa-esqe-saasfaprod1.fa.ocs.oraclecloud.com', siteNumber: 'CX_1', displayName: 'Kuwait Finance House' },
    enabled: true, since: 6, regions: ['kw'], checkedOn: CHECKED,
    company: { name: 'Kuwait Finance House', domain: 'kfh.com', website: 'https://www.kfh.com', headquartersCountry: 'Kuwait' },
  },
  {
    key: 'rss:boubyan', name: 'Boubyan Bank (Taleo feed)', kind: 'rss', // 0 on the day
    config: { url: 'https://lde.tbe.taleo.net/lde01/ats/servlet/Rss?org=BYBBANK&cws=53' },
    enabled: true, since: 6, regions: ['kw'], checkedOn: CHECKED,
    company: { name: 'Boubyan Bank', domain: 'bankboubyan.com', website: 'https://www.bankboubyan.com', headquartersCountry: 'Kuwait' },
  },
  {
    key: 'rss:tap-payments', name: 'Tap Payments (Teamtailor RSS)', kind: 'rss', // 20; 3 in Salmiya, 15 elsewhere in the GCC
    config: { url: 'https://tappayments.teamtailor.com/jobs.rss' },
    enabled: true, since: 6, regions: ['kw', 'bh', 'sa', 'qa', 'ae'], checkedOn: CHECKED,
    company: { name: 'Tap Payments', domain: 'tap.company', website: 'https://www.tap.company', headquartersCountry: 'Kuwait' },
  },
  {
    key: 'workable:agility', name: 'Agility (Workable)', kind: 'workable', // 16; 3 UAE, 9 KSA, 0 Kuwait on the day
    config: { company: 'agility' },
    enabled: true, since: 6, regions: ['kw', 'ae', 'sa'], checkedOn: CHECKED,
    company: { name: 'Agility', domain: 'agility.com', website: 'https://www.agility.com', headquartersCountry: 'Kuwait' },
  },
]

const UAE_V6: readonly DefaultSource[] = [
  {
    key: 'rss:propertyfinder', name: 'Property Finder (Teamtailor RSS)', kind: 'rss', // 32; 15 UAE
    config: { url: 'https://propertyfinder.teamtailor.com/jobs.rss' },
    enabled: false, since: 6, regions: ['ae', 'sa'], checkedOn: CHECKED,
    company: { name: 'Property Finder', domain: 'propertyfinder.ae', website: 'https://www.propertyfinder.ae', headquartersCountry: 'United Arab Emirates' },
  },
]

export const DEFAULT_SOURCES_V6: readonly DefaultSource[] = [...KUWAIT_V6, ...UAE_V6]
