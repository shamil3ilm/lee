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
