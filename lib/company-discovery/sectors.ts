/**
 * Sectors: what kind of organisation a company is, for every employer
 * (banks, hospitals, airlines, retailers…), not only tech firms. The hiring
 * likelihood (./hire-likelihood.ts) reads a prior per sector: how likely an
 * organisation of that kind employs software, data, analyst, ERP or BI
 * people. Client-safe, pure.
 */

export const SECTORS = [
  'software',
  'it',
  'telecom',
  'bank',
  'insurance',
  'finance',
  'airline',
  'logistics',
  'ecommerce',
  'healthcare',
  'conglomerate',
  'government',
  'consulting',
  'research',
  'university',
  'energy',
  'retail',
  'manufacturing',
  'real_estate',
  'engineering',
  'education',
  'hospitality',
  'media',
  'other',
  'shop',
  'restaurant',
] as const
export type Sector = (typeof SECTORS)[number]

export const SECTOR_LABELS: Readonly<Record<Sector, string>> = {
  software: 'software company',
  it: 'IT company',
  telecom: 'telecom',
  bank: 'bank',
  insurance: 'insurer',
  finance: 'financial firm',
  airline: 'airline',
  logistics: 'logistics',
  ecommerce: 'e-commerce',
  healthcare: 'healthcare group',
  conglomerate: 'group / conglomerate',
  government: 'government body',
  consulting: 'consulting / audit',
  research: 'research organisation',
  university: 'university',
  energy: 'oil, gas and energy',
  retail: 'retail',
  manufacturing: 'manufacturing',
  real_estate: 'real estate',
  engineering: 'engineering firm',
  education: 'school / training',
  hospitality: 'hospitality',
  media: 'media',
  other: 'company',
  shop: 'shop',
  restaurant: 'restaurant',
}

export function isSector(v: unknown): v is Sector {
  return typeof v === 'string' && (SECTORS as readonly string[]).includes(v)
}

/**
 * Prior (0–35) that an organisation of this kind employs software, data,
 * analyst, ERP or BI people. High: banks, insurers, telecoms, airlines,
 * logistics, e-commerce, healthcare groups, conglomerates, government
 * digital units, consulting; low: single shops and restaurants. Never used
 * to drop a company on its own.
 */
export const SECTOR_PRIOR: Readonly<Record<Sector, number>> = {
  software: 35,
  it: 35,
  telecom: 30,
  bank: 30,
  insurance: 28,
  finance: 26,
  airline: 28,
  logistics: 26,
  ecommerce: 30,
  healthcare: 24,
  conglomerate: 28,
  government: 22,
  consulting: 28,
  research: 24,
  university: 22,
  energy: 24,
  retail: 18,
  manufacturing: 18,
  real_estate: 14,
  engineering: 20,
  education: 12,
  hospitality: 12,
  media: 18,
  other: 12,
  shop: 3,
  restaurant: 2,
}

/** Words in a legal or map name that name the sector, first match wins. */
const NAME_RULES: ReadonlyArray<readonly [Sector, RegExp]> = [
  ['bank', /\b(bank|banking|bancorp)\b|مصرف|بنك/i],
  ['insurance', /\b(insurance|takaful|assurance|reinsurance)\b|تأمين/i],
  ['telecom', /\b(telecom\w*|communications?|mobile|zain|ooredoo|etisalat|stc)\b/i],
  ['airline', /\b(airways|airlines?|aviation|air cargo)\b/i],
  ['logistics', /\b(logistics|shipping|freight|cargo|courier|warehous\w*|express|transport\w*)\b/i],
  ['healthcare', /\b(hospitals?|clinics?|medical|healthcare|health|pharma\w*|diagnostic\w*)\b|مستشفى/i],
  ['finance', /\b(financ\w*|investments?|capital|securities|exchange|brokerage|leasing|payments?|fintech)\b/i],
  ['software', /\b(software|saas|apps?|digital|technolog\w*|tech)\b/i],
  ['it', /\b(it|infotech|information technology|systems|computer\w*|data|cloud|cyber\w*)\b/i],
  ['consulting', /\b(consult\w*|advisory|audit\w*|accountants?|chartered)\b/i],
  ['energy', /\b(oil|gas|petroleum|petrochemical\w*|energy|power|refin\w*)\b|نفط/i],
  ['university', /\b(university|college|institute of technology)\b|جامعة/i],
  ['research', /\b(research|laboratory|laboratories|science park)\b/i],
  ['government', /\b(ministry|authority|municipality|government|public institution)\b|وزارة|هيئة/i],
  ['ecommerce', /\b(e-?commerce|online|marketplace)\b/i],
  ['conglomerate', /\b(group|holding|holdings|industries|enterprises)\b/i],
  ['manufacturing', /\b(manufactur\w*|factory|industrial|steel|cement|plastics?|foods?|beverages?)\b/i],
  ['real_estate', /\b(real estate|properties|realty|developers?)\b|عقار/i],
  ['engineering', /\b(engineering|construction|contracting|contractors?)\b/i],
  ['retail', /\b(retail|stores|supermarkets?|hypermarkets?|mall|trading)\b/i],
  ['education', /\b(school|academy|training|education\w*)\b/i],
  ['hospitality', /\b(hotels?|resorts?|hospitality)\b/i],
  ['media', /\b(media|publishing|advertising|broadcast\w*)\b/i],
  ['restaurant', /\b(restaurant|cafe|café|catering|bakery)\b/i],
]

/** The sector a company name implies, or null. */
export function sectorFromName(name: string): Sector | null {
  for (const [s, re] of NAME_RULES) if (re.test(name)) return s
  return null
}
