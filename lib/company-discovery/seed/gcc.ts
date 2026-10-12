import type { SeedCompany } from './types'

/**
 * GCC tech employers: UAE, Kuwait, Saudi Arabia and Qatar. Public facts;
 * verified live with `pnpm tsx scripts/company-seed-verify.ts`. talabat is
 * listed once, in Dubai (its headquarters) and Kuwait (where it started).
 */

const S = 'seed' as const
const D = '2026-10-09'
const D12 = '2026-10-12'

export const UAE_SEED: readonly SeedCompany[] = [
  { name: 'Careem', website: 'https://www.careem.com', regionIds: ['dubai'], industries: ['software', 'payments'], source: S, checkedOn: D },
  { name: 'Tabby', website: 'https://tabby.ai', regionIds: ['dubai', 'riyadh'], industries: ['fintech', 'payments'], source: S, checkedOn: D },
  { name: 'Kitopi', website: 'https://www.kitopi.com', regionIds: ['dubai'], industries: ['software'], source: S, checkedOn: D },
  { name: 'talabat', website: 'https://www.talabat.com', regionIds: ['dubai', 'kw'], industries: ['ecommerce', 'software'], source: S, checkedOn: D },
  { name: 'noon', website: 'https://www.noon.com', regionIds: ['dubai', 'riyadh'], industries: ['ecommerce'], note: 'The site refuses automated clients (robots.txt Disallow: /); checked by name and domain only.', source: S, checkedOn: D },
  { name: 'Anghami', website: 'https://www.anghami.com', regionIds: ['abu-dhabi'], industries: ['software'], source: S, checkedOn: D },
  { name: 'Ziina', website: 'https://ziina.com', regionIds: ['dubai'], industries: ['fintech', 'payments'], source: S, checkedOn: D },
  { name: 'Sarwa', website: 'https://www.sarwa.co', regionIds: ['dubai'], industries: ['fintech'], source: S, checkedOn: D },
  { name: 'YAP', website: 'https://www.yap.com', regionIds: ['dubai'], industries: ['fintech', 'banking'], source: S, checkedOn: D },
  { name: 'Property Finder', website: 'https://www.propertyfinder.ae', regionIds: ['dubai'], industries: ['software', 'data'], source: S, checkedOn: D },
  { name: 'Dubizzle Group', website: 'https://www.dubizzlegroup.com', regionIds: ['dubai'], industries: ['ecommerce', 'software'], aliases: ['Bayut', 'dubizzle'], source: S, checkedOn: D },
  { name: 'Huspy', website: 'https://huspy.com', regionIds: ['dubai'], industries: ['fintech', 'software'], source: S, checkedOn: D },
  { name: 'Bayzat', website: 'https://www.bayzat.com', regionIds: ['dubai'], industries: ['saas'], source: S, checkedOn: D },
  { name: 'Wio Bank', website: 'https://www.wio.io', regionIds: ['abu-dhabi'], industries: ['banking', 'fintech'], aliases: ['Wio'], source: S, checkedOn: D },
  { name: 'Qashio', website: 'https://www.qashio.com', regionIds: ['dubai'], industries: ['fintech', 'payments'], source: S, checkedOn: D },
  { name: 'Alaan', website: 'https://www.alaan.com', regionIds: ['dubai'], industries: ['fintech', 'payments'], source: S, checkedOn: D },
  { name: 'Network International', website: 'https://www.network.ae', regionIds: ['dubai'], industries: ['payments'], source: S, checkedOn: D },
  { name: 'G42', website: 'https://www.g42.ai', regionIds: ['abu-dhabi'], industries: ['data', 'it_services'], source: S, checkedOn: D },
  // Universities and hospital groups with verified boards (2026-10-12, lib/defaults/catalog-v7.ts).
  { name: 'NMC Healthcare', website: 'https://nmc.ae', regionIds: ['abu-dhabi', 'dubai'], industries: [], aliases: ['NMC'], note: 'Oracle Recruiting board (146 jobs).', source: S, checkedOn: D12 },
  { name: 'Aster DM Healthcare', website: 'https://www.asterdmhealthcare.com', regionIds: ['dubai'], industries: [], aliases: ['Aster'], note: 'Oracle Recruiting board (640 jobs, 223 in the UAE).', source: S, checkedOn: D12 },
  { name: 'Zayed University', website: 'https://www.zu.ac.ae', regionIds: ['dubai', 'abu-dhabi'], industries: [], aliases: ['ZU'], note: 'Oracle Recruiting board (14 jobs).', source: S, checkedOn: D12 },
  { name: 'Canadian University Dubai', website: 'https://www.cud.ac.ae', regionIds: ['dubai'], industries: [], aliases: ['CUD'], note: 'Oracle Recruiting board (6 faculty jobs).', source: S, checkedOn: D12 },
]

export const KUWAIT_SEED: readonly SeedCompany[] = [
  { name: 'Tap Payments', website: 'https://www.tap.company', regionIds: ['kw'], industries: ['payments', 'fintech'], source: S, checkedOn: D },
  { name: 'Boubyan Bank', website: 'https://www.bankboubyan.com', regionIds: ['kw'], industries: ['banking', 'fintech'], aliases: ['Boubyan Digital', 'Boubyan'], source: S, checkedOn: D },
  { name: 'MyFatoorah', website: 'https://www.myfatoorah.com', regionIds: ['kw'], industries: ['payments', 'einvoicing'], source: S, checkedOn: D },
  { name: 'Ottu', website: 'https://ottu.com', regionIds: ['kw'], industries: ['payments'], source: S, checkedOn: D },
  { name: 'UPayments', website: 'https://upayments.com', regionIds: ['kw'], industries: ['payments'], source: S, checkedOn: D },
  { name: 'KNET', website: 'https://www.knet.com.kw', regionIds: ['kw'], industries: ['payments', 'banking'], aliases: ['Shared Electronic Banking Services Company'], source: S, checkedOn: D },
  { name: 'Zain', website: 'https://www.zain.com', regionIds: ['kw'], industries: ['telecom'], source: S, checkedOn: D },
  { name: 'Kuwait Finance House', website: 'https://www.kfh.com', regionIds: ['kw'], industries: ['banking'], aliases: ['KFH'], source: S, checkedOn: D },
  { name: 'National Bank of Kuwait', website: 'https://www.nbk.com', regionIds: ['kw'], industries: ['banking'], aliases: ['NBK'], source: S, checkedOn: D },
  { name: 'Cofe', website: 'https://www.cofeapp.com', regionIds: ['kw'], industries: ['ecommerce', 'software'], aliases: ['COFE App'], source: S, checkedOn: D },
  // Non-tech employers with in-house IT, data and analyst teams (banks,
  // insurance, airlines, retail, hospitals, logistics). Homepages checked
  // live on 2026-10-09; careers routes are in lib/defaults/watch-employers.ts.
  { name: 'Gulf Bank', website: 'https://www.e-gulfbank.com', regionIds: ['kuwait-city'], industries: ['banking'], aliases: ['Gulf Bank K.S.C.P.'], source: S, checkedOn: D },
  { name: 'Burgan Bank', website: 'https://burgan.com', regionIds: ['kuwait-city'], industries: ['banking'], aliases: ['Burgan Bank K.P.S.C.'], source: S, checkedOn: D },
  { name: 'Warba Bank', website: 'https://www.warbabank.com', regionIds: ['kuwait-city'], industries: ['banking'], source: S, checkedOn: D },
  { name: 'Commercial Bank of Kuwait', website: 'https://www.cbk.com', regionIds: ['kuwait-city'], industries: ['banking'], aliases: ['CBK'], source: S, checkedOn: D },
  { name: 'Bank of Kuwait and the Middle East', website: 'https://www.eahli.com', regionIds: ['kuwait-city'], industries: ['banking'], aliases: ['ABK', 'Al Ahli Bank of Kuwait'], source: S, checkedOn: D },
  { name: 'Kuwait International Bank', website: 'https://www.kib.com.kw', regionIds: ['kuwait-city'], industries: ['banking'], aliases: ['KIB'], source: S, checkedOn: D },
  { name: 'Gulf Insurance Group', website: 'https://www.gig.com.kw', regionIds: ['kw'], industries: [], aliases: ['GIG', 'GIG Kuwait'], source: S, checkedOn: D },
  { name: 'Agility', website: 'https://agility.com', regionIds: ['kw'], industries: [], aliases: ['Agility Public Warehousing Company', 'Agility Logistics'], source: S, checkedOn: D },
  { name: 'Alghanim Industries', website: 'https://www.alghanim.com', regionIds: ['kw'], industries: [], aliases: ['Ali Alghanim & Sons'], source: S, checkedOn: D },
  { name: 'X-cite', website: 'https://www.xcite.com', regionIds: ['kw'], industries: ['ecommerce'], aliases: ['Xcite', 'X-cite by Alghanim Electronics'], source: S, checkedOn: D },
  { name: 'Alshaya Group', website: 'https://www.alshaya.com', regionIds: ['kw'], industries: ['ecommerce'], aliases: ['M.H. Alshaya', 'Alshaya'], note: 'The site refuses automated clients (403); checked by name and domain only.', source: S, checkedOn: D },
  { name: 'The Sultan Center', website: 'https://www.sultan-center.com', regionIds: ['kw'], industries: ['ecommerce'], aliases: ['TSC', 'Sultan Center'], source: S, checkedOn: D },
  { name: 'Americana Restaurants', website: 'https://www.americanarestaurants.com', regionIds: ['kw'], industries: [], aliases: ['Americana', 'Kuwait Food Company'], source: S, checkedOn: D },
  { name: 'Mabanee', website: 'https://www.mabanee.com', regionIds: ['kw'], industries: [], aliases: ['Mabanee Company'], source: S, checkedOn: D },
  { name: 'Kuwait Airways', website: 'https://kuwaitairways.com', regionIds: ['farwaniya'], industries: [], source: S, checkedOn: D },
  { name: 'Jazeera Airways', website: 'https://www.jazeeraairways.com', regionIds: ['farwaniya'], industries: [], note: 'The site refuses automated clients (403); checked by name and domain only.', source: S, checkedOn: D },
  { name: 'Ooredoo Kuwait', website: 'https://www.ooredoo.com.kw', regionIds: ['kw'], industries: ['telecom'], aliases: ['Wataniya Telecom', 'National Mobile Telecommunications Company'], source: S, checkedOn: D },
  { name: 'stc Kuwait', website: 'https://www.stc.com.kw', regionIds: ['kw'], industries: ['telecom'], aliases: ['Kuwait Telecommunications Company', 'VIVA'], note: 'The site refuses automated clients (403); checked by name and domain only.', source: S, checkedOn: D },
  { name: 'Dar Al Shifa Hospital', website: 'https://www.daralshifa.com', regionIds: ['hawalli'], industries: [], note: 'Careers on SAP SuccessFactors (career2.successfactors.eu); no job feed found.', source: S, checkedOn: D12 },
  { name: 'Al Seef Hospital', website: 'https://www.alseef-hospital.com', regionIds: ['salmiya'], industries: [], note: 'alseefhospital.com (no hyphen) is a parked domain; the hospital is alseef-hospital.com (careers: a CV form, no board).', source: S, checkedOn: D12 },
  // Education and healthcare employers with IT, web and data staff, checked
  // live on 2026-10-12 (boards in lib/defaults/catalog-v7.ts; what each
  // careers site runs is in the note when lee can't read it).
  { name: 'American International University', website: 'https://www.aiu.edu.kw', regionIds: ['jahra'], industries: [], aliases: ['AIU', 'AIU Kuwait'], note: 'BambooHR board aiu (41 jobs); campus in Saad Al Abdullah, Jahra.', source: S, checkedOn: D12 },
  { name: 'American University of Kuwait', website: 'https://www.auk.edu.kw', regionIds: ['salmiya'], industries: [], aliases: ['AUK'], note: 'Careers on a Bayt white-label site; robots.txt disallows its job pages.', source: S, checkedOn: D12 },
  { name: 'Gulf University for Science and Technology', website: 'https://www.gust.edu.kw', regionIds: ['hawalli'], industries: [], aliases: ['GUST'], note: 'The site refuses automated clients (Cloudflare, 403 on robots.txt); checked by name and domain only.', source: S, checkedOn: D12 },
  { name: 'Australian University', website: 'https://www.au.edu.kw', regionIds: ['hawalli'], industries: [], aliases: ['Australian College of Kuwait', 'ACK'], note: 'Formerly the Australian College of Kuwait (West Mishref); careers on a MenaITech portal.', source: S, checkedOn: D12 },
  { name: 'American University of the Middle East', website: 'https://www.aum.edu.kw', regionIds: ['ahmadi'], industries: [], aliases: ['AUM'], note: 'robots.txt disallows all robots (User-agent: * Disallow: /); not read.', source: S, checkedOn: D12 },
  { name: 'Box Hill College Kuwait', website: 'https://bhck.edu.kw', regionIds: ['ahmadi'], industries: [], aliases: ['BHCK'], note: 'HR page only, no listings.', source: S, checkedOn: D12 },
  { name: 'Kuwait College of Science and Technology', website: 'https://www.kcst.edu.kw', regionIds: ['kw'], industries: [], aliases: ['KCST'], note: 'Custom employment page.', source: S, checkedOn: D12 },
  { name: 'Arab Open University Kuwait', website: 'https://www.aou.edu.kw', regionIds: ['farwaniya'], industries: [], aliases: ['AOU Kuwait'], note: 'Careers as news posts (Ardiya).', source: S, checkedOn: D12 },
  { name: 'American School of Kuwait', website: 'https://www.ask.edu.kw', regionIds: ['hawalli'], industries: [], aliases: ['ASK'], note: 'robots.txt disallows all robots; not read.', source: S, checkedOn: D12 },
  { name: 'American Baccalaureate School', website: 'https://www.abs.edu.kw', regionIds: ['farwaniya'], industries: [], aliases: ['ABS Kuwait'], note: 'BambooHR board absedu (3 jobs, Khaitan).', source: S, checkedOn: D12 },
  { name: 'New Mowasat Hospital', website: 'https://www.newmowasat.com', regionIds: ['salmiya'], industries: [], note: 'Custom job listing.', source: S, checkedOn: D12 },
  { name: 'Royale Hayat Hospital', website: 'https://www.royalehayat.com', regionIds: ['hawalli'], industries: [], note: 'Job application form inside a single-page app; no board.', source: S, checkedOn: D12 },
  { name: 'Taiba Hospital', website: 'https://www.taibahospital.com', regionIds: ['mubarak-al-kabeer'], industries: [], note: 'Teamtailor on careers.taibahospital.com (19 jobs, Sabah Al Salem).', source: S, checkedOn: D12 },
  { name: 'EQUATE Petrochemical', website: 'https://www.equate.com', regionIds: ['ahmadi'], industries: [], aliases: ['EQUATE'], source: S, checkedOn: D },
]

export const KSA_SEED: readonly SeedCompany[] = [
  { name: 'Tamara', website: 'https://tamara.co', regionIds: ['riyadh'], industries: ['fintech', 'payments'], source: S, checkedOn: D },
  { name: 'Lean Technologies', website: 'https://www.leantech.me', regionIds: ['riyadh', 'dubai'], industries: ['fintech', 'payments'], source: S, checkedOn: D },
  { name: 'Foodics', website: 'https://www.foodics.com', regionIds: ['riyadh'], industries: ['saas', 'payments'], source: S, checkedOn: D },
  { name: 'Salla', website: 'https://salla.com', regionIds: ['jeddah', 'riyadh'], industries: ['ecommerce', 'saas'], source: S, checkedOn: D },
  { name: 'Unifonic', website: 'https://www.unifonic.com', regionIds: ['riyadh'], industries: ['saas', 'telecom'], source: S, checkedOn: D },
  { name: 'HyperPay', website: 'https://www.hyperpay.com', regionIds: ['riyadh'], industries: ['payments'], source: S, checkedOn: D },
  { name: 'Moyasar', website: 'https://moyasar.com', regionIds: ['riyadh'], industries: ['payments'], source: S, checkedOn: D },
  { name: 'Rewaa', website: 'https://www.rewaatech.com', regionIds: ['riyadh'], industries: ['saas', 'erp'], source: S, checkedOn: D },
  { name: 'Zid', website: 'https://zid.sa', regionIds: ['riyadh'], industries: ['ecommerce', 'saas'], source: S, checkedOn: D },
  { name: 'Mrsool', website: 'https://mrsool.co', regionIds: ['riyadh'], industries: ['ecommerce', 'software'], source: S, checkedOn: D },
  { name: 'Jahez', website: 'https://www.jahez.net', regionIds: ['riyadh'], industries: ['ecommerce', 'software'], source: S, checkedOn: D },
  { name: 'Lucidya', website: 'https://lucidya.com', regionIds: ['riyadh'], industries: ['data', 'saas'], source: S, checkedOn: D },
  { name: 'Mozn', website: 'https://www.mozn.ai', regionIds: ['riyadh'], industries: ['data', 'fintech'], source: S, checkedOn: D },
  { name: 'Wafeq', website: 'https://www.wafeq.com', regionIds: ['riyadh'], industries: ['einvoicing', 'erp', 'saas'], note: 'The site answered HTTP 500 on 2026-10-09.', source: S, checkedOn: D },
  { name: 'Qoyod', website: 'https://www.qoyod.com', regionIds: ['riyadh'], industries: ['einvoicing', 'erp', 'saas'], source: S, checkedOn: D },
]

export const QATAR_SEED: readonly SeedCompany[] = [
  { name: 'Snoonu', website: 'https://snoonu.com', regionIds: ['doha'], industries: ['ecommerce', 'software'], source: S, checkedOn: D },
  { name: 'SkipCash', website: 'https://skipcash.app', regionIds: ['doha'], industries: ['payments', 'fintech'], source: S, checkedOn: D },
  { name: 'Dibsy', website: 'https://dibsy.one', regionIds: ['doha'], industries: ['payments'], source: S, checkedOn: D },
  { name: 'Fatora', website: 'https://fatora.io', regionIds: ['doha'], industries: ['payments', 'einvoicing'], source: S, checkedOn: D },
  { name: 'Ooredoo', website: 'https://www.ooredoo.qa', regionIds: ['doha'], industries: ['telecom'], source: S, checkedOn: D },
]
