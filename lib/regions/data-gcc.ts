import { area, city, node, type RegionNode } from './types'

/**
 * The GCC: the group, its six countries, emirates / provinces and the cities
 * job boards name, with free zones and business districts as areas of their
 * city and Arabic spellings of the main places.
 */

const UAE: readonly RegionNode[] = [
  node({
    id: 'ae',
    name: 'United Arab Emirates',
    short: 'UAE',
    kind: 'country',
    parents: ['gcc'],
    aliases: ['uae', 'u.a.e', 'the emirates', 'emirates', 'الإمارات', 'الامارات', 'الإمارات العربية المتحدة', 'دولة الإمارات'],
    codes: ['UAE', 'U.A.E', 'AE', 'ARE'],
  }),
  city('dubai', 'Dubai', ['ae'], ['dubayy', 'dxb', 'دبي'], {
    areas: [
      area('Dubai Internet City', 'internet city'),
      area('DIFC', 'dubai international financial centre', 'dubai international financial center'),
      area('Dubai Silicon Oasis', 'silicon oasis'),
      area('JLT', 'jumeirah lakes towers', 'jumeirah lake towers'),
      area('Business Bay'),
      area('DMCC', 'dubai multi commodities centre'),
      area('Jebel Ali', 'jafza', 'jebel ali free zone'),
      area('Dubai Media City', 'media city'),
      area('Dubai Marina'),
      area('Dubai South'),
      area('Al Quoz'),
      area('Deira'),
    ],
    codes: ['DXB'],
  }),
  city('abu-dhabi', 'Abu Dhabi', ['ae'], ['abudhabi', 'abu-dhabi', 'abu zabi', 'أبوظبي', 'أبو ظبي', 'ابوظبي'], {
    areas: [
      area('ADGM', 'abu dhabi global market', 'al maryah island'),
      area('Masdar City', 'masdar'),
      area('Khalifa City'),
      area('Mussafah'),
      area('MBZ City', 'mohammed bin zayed city'),
      area('Yas Island'),
      area('Hub71', 'hub 71'),
    ],
    codes: ['AUH'],
  }),
  city('al-ain', 'Al Ain', ['abu-dhabi'], ['العين']),
  city('sharjah', 'Sharjah', ['ae'], ['الشارقة'], { areas: [area('SAIF Zone', 'sharjah airport free zone'), area('Shams', 'sharjah media city')] }),
  city('ajman', 'Ajman', ['ae'], ['عجمان']),
  city('ras-al-khaimah', 'Ras Al Khaimah', ['ae'], ['ras al-khaimah', 'rak', 'رأس الخيمة'], { areas: [area('RAKEZ')] }),
  city('fujairah', 'Fujairah', ['ae'], ['الفجيرة']),
  city('umm-al-quwain', 'Umm Al Quwain', ['ae'], ['umm al qaiwain', 'أم القيوين']),
]

const SAUDI: readonly RegionNode[] = [
  node({
    id: 'sa',
    name: 'Saudi Arabia',
    kind: 'country',
    parents: ['gcc'],
    aliases: [
      'saudi', 'ksa', 'k.s.a', 'kingdom of saudi arabia', 'saudia', 'qassim', 'kaec', 'king abdullah economic city',
      'السعودية', 'المملكة العربية السعودية',
    ],
    codes: ['KSA', 'SA', 'SAU'],
  }),
  city('riyadh', 'Riyadh', ['sa'], ['riyad', 'ar riyad', 'الرياض'], {
    areas: [area('KAFD', 'king abdullah financial district'), area('Diriyah')],
    codes: ['RUH'],
  }),
  city('jeddah', 'Jeddah', ['sa'], ['jiddah', 'jedda', 'جدة'], { codes: ['JED'] }),
  node({ id: 'eastern-province', name: 'Eastern Province', kind: 'state', parents: ['sa'], aliases: ['ash sharqiyah', 'المنطقة الشرقية'] }),
  city('dammam', 'Dammam', ['eastern-province'], ['الدمام']),
  city('al-khobar', 'Al Khobar', ['eastern-province'], ['al-khobar', 'alkhobar', 'khobar', 'الخبر']),
  city('dhahran', 'Dhahran', ['eastern-province'], ['الظهران']),
  city('jubail', 'Jubail', ['eastern-province'], ['al jubail', 'الجبيل']),
  city('makkah', 'Makkah', ['sa'], ['mecca', 'مكة', 'مكة المكرمة'], { ambiguous: true }),
  city('madinah', 'Madinah', ['sa'], ['medina', 'al madinah', 'المدينة المنورة'], { ambiguous: true }),
  city('tabuk', 'Tabuk', ['sa'], ['تبوك']),
  city('neom', 'NEOM', ['tabuk'], ['نيوم']),
  city('yanbu', 'Yanbu', ['sa'], ['ينبع']),
  city('abha', 'Abha', ['sa']),
  city('taif', 'Taif', ['sa']),
  city('buraidah', 'Buraidah', ['sa']),
]

const QATAR: readonly RegionNode[] = [
  node({
    id: 'qa',
    name: 'Qatar',
    kind: 'country',
    parents: ['gcc'],
    aliases: ['ras laffan', 'mesaieed', 'قطر'],
    codes: ['QA', 'QAT'],
  }),
  city('doha', 'Doha', ['qa'], ['الدوحة'], {
    areas: [area('QSTP', 'qatar science and technology park', 'qatar science & technology park'), area('Msheireb')],
    codes: ['DOH'],
  }),
  city('lusail', 'Lusail', ['qa'], ['لوسيل']),
  city('al-rayyan', 'Al Rayyan', ['qa'], ['الريان'], { areas: [area('Education City')] }),
  city('al-wakrah', 'Al Wakrah', ['qa']),
]

const KUWAIT: readonly RegionNode[] = [
  node({
    id: 'kw',
    name: 'Kuwait',
    kind: 'country',
    parents: ['gcc'],
    aliases: ['al kuwait', 'farwaniya', 'jahra', 'الكويت'],
    codes: ['KW', 'KWT'],
  }),
  city('kuwait-city', 'Kuwait City', ['kw'], ['مدينة الكويت'], { areas: [area('Shuwaikh'), area('Sharq')] }),
  city('salmiya', 'Salmiya', ['kw']),
  city('hawalli', 'Hawalli', ['kw']),
  city('ahmadi', 'Ahmadi', ['kw']),
]

const BAHRAIN: readonly RegionNode[] = [
  node({
    id: 'bh',
    name: 'Bahrain',
    kind: 'country',
    parents: ['gcc'],
    aliases: ['kingdom of bahrain', 'isa town', 'sitra', 'البحرين'],
    codes: ['BH', 'BHR'],
  }),
  city('manama', 'Manama', ['bh'], ['المنامة'], { areas: [area('Seef'), area('Bahrain Financial Harbour')] }),
  city('muharraq', 'Muharraq', ['bh'], ['المحرق']),
  city('riffa', 'Riffa', ['bh']),
]

const OMAN: readonly RegionNode[] = [
  node({
    id: 'om',
    name: 'Oman',
    kind: 'country',
    parents: ['gcc'],
    aliases: ['sultanate of oman', 'عمان', 'عُمان', 'سلطنة عمان'],
    codes: ['OM', 'OMN'],
  }),
  city('muscat', 'Muscat', ['om'], ['masqat', 'مسقط'], {
    areas: [area('Knowledge Oasis Muscat'), area('Seeb')],
    codes: ['MCT'],
  }),
  city('sohar', 'Sohar', ['om'], ['صحار']),
  city('salalah', 'Salalah', ['om'], ['صلالة']),
  city('nizwa', 'Nizwa', ['om']),
  city('duqm', 'Duqm', ['om']),
]

export const GCC_NODES: readonly RegionNode[] = [
  node({
    id: 'gcc',
    name: 'GCC',
    kind: 'group',
    aliases: ['gulf cooperation council', 'gcc countries', 'gcc region'],
  }),
  ...UAE,
  ...SAUDI,
  ...QATAR,
  ...KUWAIT,
  ...BAHRAIN,
  ...OMAN,
]
