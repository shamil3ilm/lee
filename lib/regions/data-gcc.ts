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
      area('Al Barsha', 'barsha'),
      area('Jumeirah', 'jumeira'),
      area('TECOM', 'dubai knowledge park', 'dubai knowledge village'),
      area('Sheikh Zayed Road', 'shaikh zayed road'),
      area('DAFZA', 'dubai airport free zone', 'dubai airports free zone'),
      area('Motor City', 'dubai motor city'),
      area('Al Qusais', 'qusais'),
      area('Bur Dubai'),
      area('Karama', 'al karama'),
      area('Mirdif', 'mirdiff'),
      area('Dubai Investments Park', 'dubai investment park'),
      area('Dubai Science Park', 'dubiotech'),
      area('Dubai Healthcare City', 'dhcc'),
      area('Dubai Design District'),
      area('Arjan'),
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
      area('Al Reem Island', 'reem island'),
      area('KIZAD', 'khalifa industrial zone', 'khalifa economic zones'),
      area('twofour54', 'two four 54'),
      area('Al Raha Beach', 'al raha'),
      area('ICAD', 'mussafah industrial area'),
    ],
    codes: ['AUH'],
  }),
  city('al-ain', 'Al Ain', ['abu-dhabi'], ['العين']),
  city('sharjah', 'Sharjah', ['ae'], ['الشارقة'], {
    areas: [
      area('SAIF Zone', 'sharjah airport free zone'),
      area('Shams', 'sharjah media city'),
      area('Hamriyah Free Zone', 'hamriyah', 'hfza'),
      area('SRTI Park', 'sharjah research technology and innovation park', 'srtip'),
      area('Muwaileh'),
    ],
  }),
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
    areas: [
      area('KAFD', 'king abdullah financial district'),
      area('Diriyah'),
      area('Olaya', 'al olaya', 'al-olaya', 'العليا'),
      area('King Fahd Road'),
      area('Riyadh Front'),
      area('Al Malqa', 'malqa'),
      area('Riyadh Techno Valley'),
    ],
    codes: ['RUH'],
  }),
  city('jeddah', 'Jeddah', ['sa'], ['jiddah', 'jedda', 'جدة'], { codes: ['JED'] }),
  node({ id: 'eastern-province', name: 'Eastern Province', kind: 'state', parents: ['sa'], aliases: ['ash sharqiyah', 'المنطقة الشرقية'] }),
  city('dammam', 'Dammam', ['eastern-province'], ['الدمام']),
  city('al-khobar', 'Al Khobar', ['eastern-province'], ['al-khobar', 'alkhobar', 'khobar', 'الخبر']),
  city('dhahran', 'Dhahran', ['eastern-province'], ['الظهران'], { areas: [area('Dhahran Techno Valley')] }),
  city('al-ahsa', 'Al Ahsa', ['eastern-province'], ['al-ahsa', 'al hasa', 'al-hasa', 'alahsa', 'hofuf', 'al hofuf', 'hufuf', 'الأحساء', 'الهفوف']),
  city('qatif', 'Qatif', ['eastern-province'], ['al qatif', 'القطيف']),
  city('jubail', 'Jubail', ['eastern-province'], ['al jubail', 'الجبيل']),
  city('makkah', 'Makkah', ['sa'], ['mecca', 'مكة', 'مكة المكرمة'], { ambiguous: true }),
  city('madinah', 'Madinah', ['sa'], ['medina', 'al madinah', 'المدينة المنورة'], { ambiguous: true }),
  city('tabuk', 'Tabuk', ['sa'], ['تبوك']),
  city('neom', 'NEOM', ['tabuk'], ['نيوم']),
  city('yanbu', 'Yanbu', ['sa'], ['ينبع']),
  city('abha', 'Abha', ['sa'], ['أبها']),
  city('khamis-mushait', 'Khamis Mushait', ['sa'], ['khamis mushayt', 'خميس مشيط']),
  city('jazan', 'Jazan', ['sa'], ['jizan', 'gizan', 'جازان']),
  city('najran', 'Najran', ['sa'], ['نجران']),
  city('hail', "Ha'il", ['sa'], ['hail city', 'hail province', 'حائل']),
  city('sakaka', 'Sakaka', ['sa'], ['al jouf', 'al-jouf', 'سكاكا']),
  city('thuwal', 'Thuwal', ['sa'], ['kaust', 'king abdullah university of science and technology']),
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
    areas: [
      area('QSTP', 'qatar science and technology park', 'qatar science & technology park'),
      area('Msheireb'),
      area('West Bay', 'al dafna'),
      area('QFC', 'qatar financial centre', 'qatar financial center'),
      area('Al Sadd', 'al-sadd'),
      area('The Pearl', 'the pearl-qatar', 'pearl qatar'),
    ],
    codes: ['DOH'],
  }),
  city('lusail', 'Lusail', ['qa'], ['لوسيل']),
  city('al-rayyan', 'Al Rayyan', ['qa'], ['الريان'], { areas: [area('Education City')] }),
  city('al-wakrah', 'Al Wakrah', ['qa'], ['الوكرة']),
  city('al-khor', 'Al Khor', ['qa'], ['الخور']),
]

const KUWAIT: readonly RegionNode[] = [
  node({
    id: 'kw',
    name: 'Kuwait',
    kind: 'country',
    parents: ['gcc'],
    aliases: ['al kuwait', 'state of kuwait', 'dawlat al kuwait', 'الكويت', 'دولة الكويت'],
    codes: ['KW', 'KWT'],
  }),
  // Kuwait's six governorates are named after their main towns; each town
  // is a city here and the districts job posts name are its areas.
  city('kuwait-city', 'Kuwait City', ['kw'], ['kuwait capital', 'capital governorate, kuwait', 'al asimah', 'al-asimah', 'asimah', 'مدينة الكويت', 'العاصمة'], {
    areas: [
      area('Shuwaikh', 'shuwaikh industrial area', 'shuwaikh industrial', 'al shuwaikh', 'shuwaik', 'الشويخ'),
      area('Sharq', 'شرق'),
      area('Dasman', 'دسمان'),
      area('Mirqab', 'al mirqab', 'المرقاب'),
      area('Bneid Al Gar', 'bneid al-gar', 'bnaid al qar', 'بنيد القار'),
      area('Qibla', 'jibla', 'قبلة'),
      area('Kuwait Free Trade Zone', 'kuwait free zone', 'shuwaikh free zone'),
      area('Kaifan', 'كيفان'),
      area('Sulaibikhat', 'الصليبيخات'),
    ],
  }),
  city('salmiya', 'Salmiya', ['kw'], ['salmiyah', 'salmiyeh', 'al salmiya', 'السالمية']),
  city('hawalli', 'Hawalli', ['kw'], ['hawally', 'hawalli governorate', 'حولي'], {
    areas: [
      area('Jabriya', 'jabriyah', 'al jabriya', 'الجابرية'),
      area('Rumaithiya', 'rumaithiyah', 'الرميثية'),
      area('Salwa', 'سلوى'),
      area('Bayan', 'بيان'),
      area('Mishref', 'مشرف'),
    ],
  }),
  city('farwaniya', 'Farwaniya', ['kw'], ['farwaniyah', 'al farwaniyah', 'al farwaniya', 'farwaniya governorate', 'الفروانية'], {
    areas: [
      area('Khaitan', 'خيطان'),
      area('Al Rai', 'al-rai', 'rai industrial area'),
      area('Ardiya', 'ardiyah', 'al ardiya', 'العارضية'),
      area('Dajeej', 'al dajeej', 'الضجيج'),
      area('Jleeb Al-Shuyoukh', 'jleeb al shuyoukh', 'jleeb', 'جليب الشيوخ'),
      area('Abbasiya', 'abbasiyah', 'العباسية'),
      area('Kuwait Airport', 'kuwait international airport'),
    ],
  }),
  city('ahmadi', 'Ahmadi', ['kw'], ['al ahmadi', 'al-ahmadi', 'ahmadi governorate', 'الأحمدي'], {
    areas: [
      area('Mangaf', 'al mangaf', 'المنقف'),
      area('Fahaheel', 'fahahil', 'al fahaheel', 'الفحيحيل'),
      area('Fintas', 'الفنطاس'),
      area('Abu Halifa', 'abu halifah', 'أبو حليفة'),
      area('Mahboula', 'mahboulah', 'المهبولة'),
      area('Egaila', 'eqaila', 'al egaila', 'العقيلة'),
      area('Shuaiba', 'shuaiba industrial area', 'الشعيبة'),
      area('Mina Abdullah', 'mina abdulla', 'ميناء عبدالله'),
      area('Mina Al Ahmadi', 'mina al-ahmadi'),
      area('Sabahiya', 'الصباحية'),
    ],
  }),
  city('jahra', 'Jahra', ['kw'], ['al jahra', 'al-jahra', 'jahra governorate', 'الجهراء']),
  city('mubarak-al-kabeer', 'Mubarak Al-Kabeer', ['kw'], ['mubarak al kabeer', 'mubarak al-kabir', 'mubarak al kabir', 'mubarak alkabeer', 'مبارك الكبير'], {
    areas: [area('Qurain', 'al qurain', 'القرين'), area('Sabah Al Salem', 'sabah al-salem', 'صباح السالم'), area('Adan', 'العدان')],
  }),
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
  city('manama', 'Manama', ['bh'], ['المنامة'], {
    areas: [
      area('Seef', 'seef district'),
      area('Bahrain Financial Harbour'),
      area('Bahrain Bay'),
      area('Sanabis', 'sanabes'),
      area('Juffair'),
      area('Diplomatic Area'),
      area('Adliya'),
      area('Hoora', 'hoorah'),
      area('Tubli'),
      area('Salmabad'),
    ],
  }),
  city('muharraq', 'Muharraq', ['bh'], ['المحرق'], { areas: [area('Hidd', 'al hidd'), area('Bahrain International Investment Park'), area('Arad')] }),
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
    areas: [
      area('Knowledge Oasis Muscat'),
      area('Seeb'),
      area('Al Khuwair', 'khuwair'),
      area('Ruwi'),
      area('Qurum', 'al qurum'),
      area('Ghala', 'ghala industrial area'),
      area('Bausher', 'bawshar'),
      area('Madinat Sultan Qaboos'),
      area('Azaiba', 'al azaiba', 'al athaiba'),
      area('Al Ghubra', 'ghubra'),
      area('Mabela', 'mabelah', 'al mabelah'),
      area('Muttrah', 'mutrah'),
    ],
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
