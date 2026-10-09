import type { SeedCompany } from './types'

/**
 * GCC tech employers: UAE, Kuwait, Saudi Arabia and Qatar. Public facts;
 * verified live with `pnpm tsx scripts/company-seed-verify.ts`. talabat is
 * listed once, in Dubai (its headquarters) and Kuwait (where it started).
 */

const S = 'seed' as const
const D = '2026-10-09'

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
  { name: 'Dar Al Shifa Hospital', website: 'https://www.daralshifa.com', regionIds: ['hawalli'], industries: [], source: S, checkedOn: D },
  { name: 'Al Seef Hospital', website: 'https://www.alseefhospital.com', regionIds: ['salmiya'], industries: [], note: 'The home page answers but carries no descriptive title.', source: S, checkedOn: D },
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
