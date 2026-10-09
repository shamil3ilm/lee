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
  state('kerala', 'Kerala', ['keralam']),
  state('karnataka', 'Karnataka'),
  state('telangana', 'Telangana'),
  state('tamil-nadu', 'Tamil Nadu', ['tamilnadu']),
  state('maharashtra', 'Maharashtra'),
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
  city('kochi', 'Kochi', ['kerala'], ['cochin', 'ernakulam', 'kakkanad', 'kalamassery', 'edappally'], {
    areas: [area('Infopark', 'info park', 'infopark kochi', 'infopark kakkanad'), area('SmartCity Kochi', 'smart city kochi', 'smartcity')],
    codes: ['COK'],
    ambiguous: true,
  }),
  city('thiruvananthapuram', 'Thiruvananthapuram', ['kerala'], ['trivandrum', 'thiruvanthapuram', 'tvm'], {
    areas: [area('Technopark', 'techno park', 'technopark trivandrum'), area('Technocity', 'techno city')],
    codes: ['TRV'],
    short: 'Trivandrum',
  }),
  city('kozhikode', 'Kozhikode', ['kerala'], ['calicut'], {
    areas: [area('UL Cyberpark', 'ul cyber park'), area('Cyberpark', 'cyber park', 'kerala cyberpark', 'govt cyberpark')],
    codes: ['CCJ'],
  }),
  city('thrissur', 'Thrissur', ['kerala'], ['trichur']),
  city('kannur', 'Kannur', ['kerala'], ['cannanore']),
  city('kollam', 'Kollam', ['kerala'], ['quilon']),
  city('palakkad', 'Palakkad', ['kerala'], ['palghat']),
  city('kottayam', 'Kottayam', ['kerala']),
  city('alappuzha', 'Alappuzha', ['kerala'], ['alleppey']),
  city('malappuram', 'Malappuram', ['kerala']),
]

const SOUTH: readonly RegionNode[] = [
  city('bengaluru', 'Bengaluru', ['karnataka'], ['bangalore', 'banglore', 'bengalore', 'blr'], {
    areas: [
      area('Electronic City', 'electronics city'),
      area('Whitefield'),
      area('Outer Ring Road'),
      area('Manyata Tech Park', 'manyata'),
      area('Koramangala'),
      area('HSR Layout'),
      area('Bellandur'),
    ],
    codes: ['BLR'],
  }),
  city('mysuru', 'Mysuru', ['karnataka'], ['mysore']),
  city('mangaluru', 'Mangaluru', ['karnataka'], ['mangalore']),
  city('hubballi', 'Hubballi', ['karnataka'], ['hubli', 'hubli-dharwad']),
  city('manipal', 'Manipal', ['karnataka']),
  city('hyderabad', 'Hyderabad', ['telangana'], ['secunderabad'], {
    areas: [
      area('HITEC City', 'hitech city', 'hi-tech city', 'hi tech city'),
      area('Gachibowli'),
      area('Madhapur'),
      area('Kondapur'),
    ],
    codes: ['HYD'],
    ambiguous: true,
  }),
  city('warangal', 'Warangal', ['telangana']),
  city('chennai', 'Chennai', ['tamil-nadu'], ['madras'], {
    areas: [area('Sholinganallur'), area('Siruseri'), area('Tidel Park'), area('Guindy')],
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
  city('mumbai', 'Mumbai', ['maharashtra'], ['bombay'], {
    areas: [area('Navi Mumbai'), area('Thane'), area('Powai'), area('Andheri'), area('BKC', 'bandra kurla complex'), area('Lower Parel')],
    codes: ['BOM'],
  }),
  city('pune', 'Pune', ['maharashtra'], ['poona'], {
    areas: [area('Hinjewadi', 'hinjawadi'), area('Kharadi'), area('Magarpatta'), area('Baner')],
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
  city('delhi', 'Delhi', ['delhi-ncr'], ['new delhi'], { codes: ['DEL'] }),
  city('gurugram', 'Gurugram', ['delhi-ncr', 'haryana'], ['gurgaon'], { areas: [area('DLF Cyber City', 'cyber hub')] }),
  city('noida', 'Noida', ['delhi-ncr', 'uttar-pradesh'], ['greater noida']),
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
