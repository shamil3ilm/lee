import { area, city, node, type RegionNode } from './types'

/**
 * India: the country, states / union territories, the Delhi NCR group and
 * the cities tech postings name, with old and new spellings ("Cochin" /
 * "Kochi") and IT parks as areas (Technopark = Thiruvananthapuram, Infopark
 * = Kochi, Cyberpark and UL Cyberpark = Kozhikode).
 */

const state = (id: string, name: string, aliases: readonly string[] = []): RegionNode =>
  node({ id, name, kind: 'state', parents: ['in'], aliases })

const STATES: readonly RegionNode[] = [
  state('kerala', 'Kerala', ['keralam', 'കേരളം']),
  state('karnataka', 'Karnataka', ['ಕರ್ನಾಟಕ']),
  state('telangana', 'Telangana', ['తెలంగాణ']),
  state('tamil-nadu', 'Tamil Nadu', ['tamilnadu', 'தமிழ்நாடு']),
  state('maharashtra', 'Maharashtra', ['महाराष्ट्र']),
  state('andhra-pradesh', 'Andhra Pradesh'),
  state('west-bengal', 'West Bengal'),
  state('gujarat', 'Gujarat'),
  state('haryana', 'Haryana'),
  state('uttar-pradesh', 'Uttar Pradesh'),
  state('rajasthan', 'Rajasthan'),
  { ...state('punjab', 'Punjab'), ambiguous: true },
  state('madhya-pradesh', 'Madhya Pradesh'),
  state('odisha', 'Odisha', ['orissa']),
  state('goa', 'Goa', ['panaji', 'panjim']),
  state('uttarakhand', 'Uttarakhand'),
  state('bihar', 'Bihar'),
  state('jharkhand', 'Jharkhand'),
  state('chhattisgarh', 'Chhattisgarh'),
  state('assam', 'Assam'),
  node({ id: 'delhi-ncr', name: 'Delhi NCR', kind: 'group', parents: ['in'], aliases: ['ncr', 'delhi-ncr', 'delhi/ncr', 'national capital region'] }),
]

const KERALA: readonly RegionNode[] = [
  city('kochi', 'Kochi', ['kerala'], ['cochin', 'ernakulam', 'kakkanad', 'kalamassery', 'edappally', 'കൊച്ചി', 'എറണാകുളം', 'कोच्चि'], {
    areas: [
      area('Infopark', 'info park', 'infopark kochi', 'infopark kakkanad'),
      area('SmartCity Kochi', 'smart city kochi', 'smartcity'),
      area('Vyttila', 'vytilla'),
      area('Aluva', 'alwaye'),
      area('Cochin SEZ', 'cochin special economic zone', 'csez'),
      area('Palarivattom'),
    ],
    codes: ['COK'],
    ambiguous: true,
  }),
  city('thiruvananthapuram', 'Thiruvananthapuram', ['kerala'], ['trivandrum', 'thiruvanthapuram', 'tvm', 'തിരുവനന്തപുരം', 'तिरुवनंतपुरम'], {
    areas: [
      area('Technopark', 'techno park', 'technopark trivandrum'),
      area('Technocity', 'techno city'),
      area('Kazhakkoottam', 'kazhakuttam', 'kazhakootam', 'kazhakoottam'),
    ],
    codes: ['TRV'],
    short: 'Trivandrum',
  }),
  city('kozhikode', 'Kozhikode', ['kerala'], ['calicut', 'കോഴിക്കോട്'], {
    areas: [area('UL Cyberpark', 'ul cyber park'), area('Cyberpark', 'cyber park', 'kerala cyberpark', 'govt cyberpark')],
    codes: ['CCJ'],
  }),
  city('thrissur', 'Thrissur', ['kerala'], ['trichur', 'തൃശ്ശൂർ']),
  city('kannur', 'Kannur', ['kerala'], ['cannanore']),
  city('kollam', 'Kollam', ['kerala'], ['quilon']),
  city('palakkad', 'Palakkad', ['kerala'], ['palghat']),
  city('kottayam', 'Kottayam', ['kerala']),
  city('alappuzha', 'Alappuzha', ['kerala'], ['alleppey']),
  city('malappuram', 'Malappuram', ['kerala']),
]

const SOUTH: readonly RegionNode[] = [
  city('bengaluru', 'Bengaluru', ['karnataka'], ['bangalore', 'banglore', 'bengalore', 'blr', 'bangalore urban', 'bengaluru urban', 'ಬೆಂಗಳೂರು', 'बेंगलुरु', 'बैंगलोर'], {
    areas: [
      area('Electronic City', 'electronics city'),
      area('Whitefield'),
      area('Outer Ring Road'),
      area('Manyata Tech Park', 'manyata'),
      area('Koramangala'),
      area('HSR Layout'),
      area('Bellandur'),
      area('Marathahalli', 'marathalli'),
      area('Indiranagar', 'indira nagar'),
      area('Hebbal'),
      area('JP Nagar', 'j p nagar', 'jayaprakash nagar'),
      area('Embassy Tech Village'),
      area('Embassy Golf Links'),
      area('Sarjapur Road', 'sarjapur'),
      area('BTM Layout'),
      area('Yelahanka'),
      area('Jayanagar'),
      area('Bagmane Tech Park', 'bagmane'),
      area('RMZ Ecospace', 'ecospace'),
      area('Domlur'),
    ],
    codes: ['BLR'],
  }),
  city('mysuru', 'Mysuru', ['karnataka'], ['mysore']),
  city('mangaluru', 'Mangaluru', ['karnataka'], ['mangalore']),
  city('hubballi', 'Hubballi', ['karnataka'], ['hubli', 'hubli-dharwad']),
  city('manipal', 'Manipal', ['karnataka']),
  city('hyderabad', 'Hyderabad', ['telangana'], ['secunderabad', 'cyberabad', 'हैदराबाद', 'హైదరాబాద్'], {
    areas: [
      area('HITEC City', 'hitech city', 'hi-tech city', 'hi tech city'),
      area('Gachibowli'),
      area('Madhapur'),
      area('Kondapur'),
      area('Financial District', 'nanakramguda', 'financial district hyderabad'),
      area('Raidurg', 'raidurgam'),
      area('Kokapet'),
      area('Manikonda'),
      area('Begumpet'),
      area('Uppal'),
    ],
    codes: ['HYD'],
    ambiguous: true,
  }),
  city('warangal', 'Warangal', ['telangana']),
  city('chennai', 'Chennai', ['tamil-nadu'], ['madras', 'சென்னை', 'चेन्नई'], {
    areas: [
      area('Sholinganallur'),
      area('Siruseri'),
      area('Tidel Park'),
      area('Guindy'),
      area('OMR', 'old mahabalipuram road', 'rajiv gandhi salai', 'it expressway'),
      area('Taramani'),
      area('Perungudi'),
      area('Thoraipakkam'),
      area('Ambattur'),
      area('Porur'),
      area('Velachery'),
    ],
    codes: ['MAA'],
  }),
  city('coimbatore', 'Coimbatore', ['tamil-nadu'], ['kovai']),
  city('madurai', 'Madurai', ['tamil-nadu']),
  city('tiruchirappalli', 'Tiruchirappalli', ['tamil-nadu'], ['trichy']),
  city('vellore', 'Vellore', ['tamil-nadu']),
  city('visakhapatnam', 'Visakhapatnam', ['andhra-pradesh'], ['vizag'], { short: 'Vizag' }),
  city('vijayawada', 'Vijayawada', ['andhra-pradesh']),
  city('tirupati', 'Tirupati', ['andhra-pradesh']),
]

const WEST: readonly RegionNode[] = [
  city('mumbai', 'Mumbai', ['maharashtra'], ['bombay', 'मुंबई', 'मुम्बई'], {
    areas: [
      area('Navi Mumbai', 'airoli', 'ghansoli', 'cbd belapur', 'belapur', 'vashi', 'mahape', 'rabale'),
      area('Thane'),
      area('Powai'),
      area('Andheri'),
      area('BKC', 'bandra kurla complex'),
      area('Lower Parel'),
      area('Malad'),
      area('Goregaon'),
      area('Vikhroli'),
      area('Worli'),
      area('Nariman Point'),
      area('Bandra'),
    ],
    codes: ['BOM'],
  }),
  city('pune', 'Pune', ['maharashtra'], ['poona', 'पुणे'], {
    areas: [
      area('Hinjewadi', 'hinjawadi', 'rajiv gandhi infotech park'),
      area('Kharadi', 'eon it park', 'eon free zone'),
      area('Magarpatta'),
      area('Baner'),
      area('Viman Nagar'),
      area('Hadapsar'),
      area('Wakad'),
      area('Yerwada', 'yerawada'),
      area('Kalyani Nagar'),
      area('Aundh'),
      area('Balewadi'),
      area('Pimpri-Chinchwad', 'pimpri chinchwad', 'pcmc'),
    ],
  }),
  city('nagpur', 'Nagpur', ['maharashtra']),
  city('nashik', 'Nashik', ['maharashtra'], ['nasik']),
  city('aurangabad', 'Aurangabad', ['maharashtra'], ['chhatrapati sambhajinagar']),
  city('ahmedabad', 'Ahmedabad', ['gujarat'], ['amdavad']),
  city('gandhinagar', 'Gandhinagar', ['gujarat'], [], { areas: [area('GIFT City', 'gift city gandhinagar')] }),
  city('vadodara', 'Vadodara', ['gujarat'], ['baroda']),
  city('surat', 'Surat', ['gujarat'], [], { ambiguous: true }),
  city('rajkot', 'Rajkot', ['gujarat']),
  city('indore', 'Indore', ['madhya-pradesh']),
  city('bhopal', 'Bhopal', ['madhya-pradesh']),
]

const NORTH_EAST: readonly RegionNode[] = [
  city('delhi', 'Delhi', ['delhi-ncr'], ['new delhi', 'दिल्ली', 'नई दिल्ली'], {
    areas: [area('Okhla', 'okhla industrial area'), area('Connaught Place'), area('Nehru Place'), area('Aerocity')],
    codes: ['DEL'],
  }),
  city('gurugram', 'Gurugram', ['delhi-ncr', 'haryana'], ['gurgaon', 'गुरुग्राम', 'गुड़गांव'], {
    areas: [
      area('DLF Cyber City', 'cyber hub', 'cyber city gurgaon', 'dlf cybercity'),
      area('Udyog Vihar'),
      area('Sohna Road'),
      area('Golf Course Road'),
    ],
  }),
  city('noida', 'Noida', ['delhi-ncr', 'uttar-pradesh'], ['greater noida', 'नोएडा'], { areas: [area('Noida Sector 62', 'sector 62 noida'), area('Noida Expressway')] }),
  city('faridabad', 'Faridabad', ['delhi-ncr', 'haryana']),
  city('ghaziabad', 'Ghaziabad', ['delhi-ncr', 'uttar-pradesh']),
  city('panchkula', 'Panchkula', ['haryana']),
  city('lucknow', 'Lucknow', ['uttar-pradesh']),
  city('kanpur', 'Kanpur', ['uttar-pradesh']),
  city('varanasi', 'Varanasi', ['uttar-pradesh']),
  city('prayagraj', 'Prayagraj', ['uttar-pradesh'], ['allahabad']),
  city('agra', 'Agra', ['uttar-pradesh']),
  city('meerut', 'Meerut', ['uttar-pradesh']),
  city('jaipur', 'Jaipur', ['rajasthan']),
  city('jodhpur', 'Jodhpur', ['rajasthan']),
  city('udaipur', 'Udaipur', ['rajasthan']),
  city('chandigarh', 'Chandigarh', ['in']),
  city('mohali', 'Mohali', ['punjab']),
  city('ludhiana', 'Ludhiana', ['punjab']),
  city('amritsar', 'Amritsar', ['punjab']),
  city('kolkata', 'Kolkata', ['west-bengal'], ['calcutta'], { areas: [area('Salt Lake Sector V', 'sector v', 'salt lake sector 5')], codes: ['CCU'] }),
  city('bhubaneswar', 'Bhubaneswar', ['odisha']),
  city('dehradun', 'Dehradun', ['uttarakhand']),
  city('patna', 'Patna', ['bihar']),
  city('ranchi', 'Ranchi', ['jharkhand']),
  city('raipur', 'Raipur', ['chhattisgarh']),
  city('guwahati', 'Guwahati', ['assam']),
]

export const INDIA_NODES: readonly RegionNode[] = [
  node({
    id: 'in',
    name: 'India',
    kind: 'country',
    aliases: ['bharat', 'pan india', 'pan-india', 'anywhere in india', 'remote india', 'भारत'],
    codes: ['IND'],
  }),
  ...STATES,
  ...KERALA,
  ...SOUTH,
  ...WEST,
  ...NORTH_EAST,
]
