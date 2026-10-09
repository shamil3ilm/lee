import type { SeedCompany } from './types'

/**
 * Kerala tech employers (Technopark Thiruvananthapuram, Infopark Kochi,
 * Cyberparks Kozhikode). Public facts; verified live with
 * `pnpm tsx scripts/company-seed-verify.ts` (website reachable, careers page
 * or job board where robots.txt allows).
 */

const S = 'seed' as const
const D = '2026-10-09'

export const KERALA_SEED: readonly SeedCompany[] = [
  { name: 'CareStack', website: 'https://carestack.com', regionIds: ['thiruvananthapuram'], industries: ['saas', 'software'], aliases: ['Good Methods Software Solutions', 'Good Methods Global'], source: S, checkedOn: D },
  { name: 'QBurst', website: 'https://www.qburst.com', regionIds: ['thiruvananthapuram', 'kochi', 'kozhikode'], industries: ['it_services', 'software'], aliases: ['QBurst Technologies'], source: S, checkedOn: D },
  { name: 'UST', website: 'https://www.ust.com', regionIds: ['thiruvananthapuram', 'kochi'], industries: ['it_services'], aliases: ['UST Global'], source: S, checkedOn: D },
  { name: 'IBS Software', website: 'https://www.ibsplc.com', regionIds: ['thiruvananthapuram', 'kochi'], industries: ['software', 'saas'], source: S, checkedOn: D },
  { name: 'Experion Technologies', website: 'https://experionglobal.com', regionIds: ['thiruvananthapuram', 'kochi'], industries: ['it_services', 'software'], source: S, checkedOn: D },
  { name: 'SunTec Business Solutions', website: 'https://www.suntecgroup.com', regionIds: ['thiruvananthapuram'], industries: ['software', 'banking'], aliases: ['SunTec'], source: S, checkedOn: D },
  { name: 'Tata Elxsi', website: 'https://www.tataelxsi.com', regionIds: ['thiruvananthapuram', 'kozhikode'], industries: ['it_services', 'software'], source: S, checkedOn: D },
  { name: 'Envestnet | Yodlee', website: 'https://www.envestnet.com', regionIds: ['thiruvananthapuram'], industries: ['fintech', 'data'], aliases: ['Envestnet Asset Management India', 'Envestnet', 'Yodlee'], source: S, checkedOn: D },
  { name: 'Guidehouse', website: 'https://guidehouse.com', regionIds: ['thiruvananthapuram'], industries: ['it_services'], aliases: ['Guidehouse India'], source: S, checkedOn: D },
  { name: 'EY GDS', website: 'https://www.ey.com', regionIds: ['thiruvananthapuram', 'kochi'], industries: ['it_services'], aliases: ['EY Global Delivery Services', 'Ernst & Young'], source: S, checkedOn: D },
  { name: 'Nest Digital', website: 'https://nestdigital.com', regionIds: ['thiruvananthapuram', 'kochi'], industries: ['it_services', 'software'], source: S, checkedOn: D },
  { name: 'Quest Global', website: 'https://www.quest-global.com', regionIds: ['thiruvananthapuram'], industries: ['it_services'], aliases: ['Quest Global Engineering Services'], source: S, checkedOn: D },
  { name: 'Allianz Technology', website: 'https://www.allianz.com', regionIds: ['thiruvananthapuram'], industries: ['it_services', 'software'], aliases: ['Allianz Services'], source: S, checkedOn: D },
  { name: 'Litmus7', website: 'https://litmus7.com', regionIds: ['thiruvananthapuram', 'kochi'], industries: ['it_services', 'ecommerce'], aliases: ['Litmus7 Systems Consulting'], source: S, checkedOn: D },
  { name: 'Accubits', website: 'https://accubits.com', regionIds: ['thiruvananthapuram'], industries: ['software', 'data'], aliases: ['Accubits Technologies'], source: S, checkedOn: D },
  { name: 'RapidValue', website: 'https://www.rapidvaluesolutions.com', regionIds: ['kochi'], industries: ['it_services', 'software'], aliases: ['RapidValue Solutions'], source: S, checkedOn: D },
  { name: 'Fingent', website: 'https://www.fingent.com', regionIds: ['kochi', 'thiruvananthapuram'], industries: ['it_services', 'software'], aliases: ['Fingent Global Solutions'], source: S, checkedOn: D },
  { name: 'Toonz Media Group', website: 'https://www.toonz.co', regionIds: ['thiruvananthapuram'], industries: ['software'], aliases: ['Toonz Animation India', 'Toonz'], source: S, checkedOn: D },
  { name: 'Open Financial Technologies', website: 'https://open.money', regionIds: ['kochi'], industries: ['fintech', 'payments'], source: S, checkedOn: D },
  { name: 'Genrobotics', website: 'https://www.genrobotics.com', regionIds: ['thiruvananthapuram'], industries: ['software'], aliases: ['Genrobotic Innovations'], source: S, checkedOn: D },
  { name: 'Techgentsia Software Technologies', website: 'https://www.techgentsia.com', regionIds: ['kochi'], industries: ['software', 'saas'], aliases: ['Techgentsia'], source: S, checkedOn: D },
  { name: 'Speridian Technologies', website: 'https://www.speridian.com', regionIds: ['kochi', 'thiruvananthapuram'], industries: ['it_services', 'erp'], source: S, checkedOn: D },
  { name: 'Cognizant', website: 'https://www.cognizant.com', regionIds: ['kochi'], industries: ['it_services'], aliases: ['Cognizant Technology Solutions'], source: S, checkedOn: D },
  { name: 'Tata Consultancy Services', website: 'https://www.tcs.com', regionIds: ['thiruvananthapuram', 'kochi'], industries: ['it_services'], aliases: ['TCS'], source: S, checkedOn: D },
  { name: 'Infosys', website: 'https://www.infosys.com', regionIds: ['thiruvananthapuram'], industries: ['it_services'], source: S, checkedOn: D },
]
