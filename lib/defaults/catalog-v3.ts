import type { DefaultSource } from './catalog'
import { WATCH_EMPLOYERS } from './watch-employers'

/**
 * v3 starter defaults (2026-10-08): the GCC employer watch list. Client-safe.
 *
 * Adapter sources were verified live on 2026-10-08 (count beside each) and
 * are switched on: their volume is small and they are the employers the
 * user asked to keep watching. Employers without a public feed get a
 * `watch` link (never fetched) generated from lib/defaults/watch-employers.ts.
 */

const ENTERPRISE_V3: readonly DefaultSource[] = [
  {
    key: 'successfactors:enoc', name: 'ENOC (SuccessFactors)', kind: 'successfactors', // 4
    config: { host: 'careers.enoc.com', displayName: 'ENOC' }, enabled: true, since: 3,
    company: { name: 'ENOC', domain: 'enoc.com', website: 'https://www.enoc.com', headquartersCountry: 'United Arab Emirates' },
  },
  {
    key: 'successfactors:sabic', name: 'SABIC (SuccessFactors)', kind: 'successfactors', // 0 on the day
    config: { host: 'jobs.sabic.com', displayName: 'SABIC' }, enabled: true, since: 3,
    company: { name: 'SABIC', domain: 'sabic.com', website: 'https://www.sabic.com', headquartersCountry: 'Saudi Arabia' },
  },
  {
    key: 'successfactors:saudia', name: 'Saudia (SuccessFactors)', kind: 'successfactors', // 6
    config: { host: 'careers.saudia.com', displayName: 'Saudia' }, enabled: true, since: 3,
    company: { name: 'Saudia', domain: 'saudia.com', website: 'https://www.saudia.com', headquartersCountry: 'Saudi Arabia' },
  },
  {
    key: 'successfactors:oq', name: 'OQ (SuccessFactors)', kind: 'successfactors', // 2
    config: { host: 'careers.oq.com', displayName: 'OQ' }, enabled: true, since: 3,
    company: { name: 'OQ', domain: 'oq.com', website: 'https://oq.com', headquartersCountry: 'Oman' },
  },
  {
    key: 'oracle_orc:adports', name: 'AD Ports Group (Oracle)', kind: 'oracle_orc', // 9
    config: { host: 'fa-ewzx-saasfaprod1.fa.ocs.oraclecloud.com', siteNumber: 'CX_1', displayName: 'AD Ports Group' }, enabled: true, since: 3,
    company: { name: 'AD Ports Group', domain: 'adportsgroup.com', website: 'https://www.adportsgroup.com', headquartersCountry: 'United Arab Emirates' },
  },
  {
    key: 'oracle_orc:emaar', name: 'Emaar (Oracle)', kind: 'oracle_orc', // 2
    config: { host: 'emhm.fa.em2.oraclecloud.com', siteNumber: 'CX_1001', displayName: 'Emaar' }, enabled: true, since: 3,
    company: { name: 'Emaar', domain: 'emaar.com', website: 'https://www.emaar.com', headquartersCountry: 'United Arab Emirates' },
  },
  {
    key: 'oracle_orc:bapco', name: 'Bapco Energies (Oracle)', kind: 'oracle_orc', // 1
    config: { host: 'iadygs.fa.ocs.oraclecloud.com', siteNumber: 'CX_1', displayName: 'Bapco Energies' }, enabled: true, since: 3,
    company: { name: 'Bapco Energies', domain: 'bapcoenergies.com', website: 'https://www.bapcoenergies.com', headquartersCountry: 'Bahrain' },
  },
]

/** GCC tech / fintech boards found in the 2026-10-08 search; switched off. */
const BOARDS_V3: readonly DefaultSource[] = [
  {
    key: 'rss:qashio', name: 'Qashio (Teamtailor RSS)', kind: 'rss', // 16
    config: { url: 'https://careers.qashio.com/jobs.rss' }, enabled: false, since: 3,
    company: { name: 'Qashio', domain: 'qashio.com', website: 'https://www.qashio.com', headquartersCountry: 'United Arab Emirates' },
  },
  {
    key: 'workable:mrsool-3', name: 'Mrsool (Workable)', kind: 'workable', config: { company: 'mrsool-3' }, enabled: false, since: 3, // 14
    company: { name: 'Mrsool', domain: 'mrsool.co', website: 'https://mrsool.co', headquartersCountry: 'Saudi Arabia' },
  },
  {
    key: 'ashby:thndr', name: 'Thndr (Ashby)', kind: 'ashby', config: { company: 'thndr' }, enabled: false, since: 3, // 10
    company: { name: 'Thndr', domain: 'thndr.app', website: 'https://thndr.app', headquartersCountry: 'Egypt' },
  },
]

/** Watch keys the v2 catalog already ships (their employers reuse them). */
const V2_WATCH_KEYS = new Set([
  'watch:emirates-group', 'watch:etihad', 'watch:flydubai', 'watch:mubadala', 'watch:qnb', 'watch:ooredoo', 'watch:aramco',
])

function reasonOf(note: string, alert: boolean): string {
  return alert ? `${note} Set up its job alerts; check weekly.` : `${note} Check weekly.`
}

/** One `watch` link per employer that has no polled source yet. */
export const EMPLOYER_WATCH_V3: readonly DefaultSource[] = WATCH_EMPLOYERS.filter(
  (e) => e.sourceKey.startsWith('watch:') && !V2_WATCH_KEYS.has(e.sourceKey),
).map((e) => ({
  key: e.sourceKey,
  name: `${e.name} careers`,
  kind: 'watch',
  config: { url: e.careersUrl, reason: reasonOf(e.note, e.methods.includes('alert')), employer: e.key, cadence: 'weekly' },
  enabled: false,
  since: 3,
}))

export const DEFAULT_SOURCES_V3: readonly DefaultSource[] = [...ENTERPRISE_V3, ...BOARDS_V3, ...EMPLOYER_WATCH_V3]
