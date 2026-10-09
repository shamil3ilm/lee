/**
 * The areas the map and register sources read, as DATA (no logic): one
 * bounding box per target city for OpenStreetMap (Overpass), one search per
 * country or city for GLEIF, one state per India MCA read. `places` are the
 * region-taxonomy nodes (lib/regions) that switch an area on; `regionId` is
 * where a listing lands when its own address names no deeper place.
 *
 * Boxes are [south, west, north, east] in degrees, drawn round each city's
 * built-up area (checked against openstreetmap.org on 2026-10-09); they are
 * deliberately tight, so one Overpass query stays small.
 */

export type Bbox = readonly [south: number, west: number, north: number, east: number]

export interface OsmArea {
  id: string
  label: string
  regionId: string
  places: readonly string[]
  bbox: Bbox
}

export const OSM_AREAS: readonly OsmArea[] = [
  // Kuwait: the city and the three dense governorate centres
  { id: 'kuwait-city', label: 'Kuwait City', regionId: 'kuwait-city', places: ['kw', 'kuwait-city'], bbox: [29.33, 47.9, 29.4, 48.02] },
  { id: 'salmiya', label: 'Salmiya', regionId: 'salmiya', places: ['kw', 'salmiya'], bbox: [29.31, 48.04, 29.35, 48.1] },
  { id: 'hawalli', label: 'Hawalli', regionId: 'hawalli', places: ['kw', 'hawalli'], bbox: [29.3, 47.99, 29.35, 48.04] },
  { id: 'farwaniya', label: 'Farwaniya', regionId: 'kw', places: ['kw'], bbox: [29.24, 47.9, 29.3, 47.99] },
  // UAE
  { id: 'dubai', label: 'Dubai', regionId: 'dubai', places: ['ae', 'dubai'], bbox: [24.95, 55.05, 25.35, 55.45] },
  { id: 'abu-dhabi', label: 'Abu Dhabi', regionId: 'abu-dhabi', places: ['ae', 'abu-dhabi'], bbox: [24.3, 54.3, 24.55, 54.7] },
  { id: 'sharjah', label: 'Sharjah', regionId: 'sharjah', places: ['ae', 'sharjah'], bbox: [25.25, 55.35, 25.4, 55.55] },
  // Saudi Arabia
  { id: 'riyadh', label: 'Riyadh', regionId: 'riyadh', places: ['sa', 'riyadh'], bbox: [24.5, 46.5, 24.95, 46.95] },
  { id: 'jeddah', label: 'Jeddah', regionId: 'jeddah', places: ['sa', 'jeddah'], bbox: [21.4, 39.1, 21.75, 39.3] },
  { id: 'dammam', label: 'Dammam', regionId: 'dammam', places: ['sa', 'dammam', 'eastern-province'], bbox: [26.35, 49.95, 26.5, 50.2] },
  { id: 'al-khobar', label: 'Al Khobar', regionId: 'al-khobar', places: ['sa', 'al-khobar', 'dammam', 'eastern-province'], bbox: [26.2, 50.15, 26.35, 50.25] },
  // Qatar, Bahrain, Oman
  { id: 'doha', label: 'Doha', regionId: 'doha', places: ['qa', 'doha'], bbox: [25.2, 51.4, 25.4, 51.62] },
  { id: 'manama', label: 'Manama', regionId: 'manama', places: ['bh', 'manama'], bbox: [26.18, 50.52, 26.25, 50.62] },
  { id: 'muscat', label: 'Muscat', regionId: 'muscat', places: ['om', 'muscat'], bbox: [23.55, 58.15, 23.65, 58.6] },
  // India
  { id: 'kochi', label: 'Kochi', regionId: 'kochi', places: ['kerala', 'kochi'], bbox: [9.9, 76.24, 10.1, 76.4] },
  { id: 'kozhikode', label: 'Kozhikode', regionId: 'kozhikode', places: ['kerala', 'kozhikode'], bbox: [11.2, 75.74, 11.32, 75.85] },
  { id: 'thiruvananthapuram', label: 'Thiruvananthapuram', regionId: 'thiruvananthapuram', places: ['kerala', 'thiruvananthapuram'], bbox: [8.45, 76.85, 8.6, 77.0] },
  { id: 'bengaluru', label: 'Bengaluru', regionId: 'bengaluru', places: ['bengaluru'], bbox: [12.85, 77.45, 13.1, 77.75] },
  { id: 'hyderabad', label: 'Hyderabad', regionId: 'hyderabad', places: ['hyderabad'], bbox: [17.3, 78.3, 17.55, 78.55] },
  { id: 'chennai', label: 'Chennai', regionId: 'chennai', places: ['chennai'], bbox: [12.9, 80.15, 13.15, 80.3] },
  { id: 'pune', label: 'Pune', regionId: 'pune', places: ['pune'], bbox: [18.45, 73.75, 18.62, 73.95] },
  { id: 'mumbai', label: 'Mumbai', regionId: 'mumbai', places: ['mumbai'], bbox: [18.9, 72.8, 19.25, 73.0] },
  { id: 'gurugram', label: 'Gurugram', regionId: 'gurugram', places: ['delhi-ncr', 'gurugram'], bbox: [28.38, 76.95, 28.52, 77.12] },
  { id: 'noida', label: 'Noida', regionId: 'noida', places: ['delhi-ncr', 'noida'], bbox: [28.5, 77.3, 28.65, 77.45] },
  { id: 'delhi', label: 'Delhi', regionId: 'delhi', places: ['delhi-ncr', 'delhi'], bbox: [28.5, 77.05, 28.75, 77.3] },
]

export interface GleifArea {
  id: string
  label: string
  /** ISO-2 country of the legal address. */
  country: string
  /** Full-text term for a city inside a large country (GLEIF has no city filter); none = the whole country. */
  fulltext?: string
  regionId: string
  places: readonly string[]
}

export const GLEIF_AREAS: readonly GleifArea[] = [
  { id: 'kw', label: 'Kuwait', country: 'KW', regionId: 'kw', places: ['kw', 'kuwait-city', 'salmiya', 'hawalli'] },
  { id: 'bh', label: 'Bahrain', country: 'BH', regionId: 'bh', places: ['bh', 'manama'] },
  { id: 'qa', label: 'Qatar', country: 'QA', regionId: 'qa', places: ['qa', 'doha'] },
  { id: 'om', label: 'Oman', country: 'OM', regionId: 'om', places: ['om', 'muscat'] },
  { id: 'dubai', label: 'Dubai', country: 'AE', fulltext: 'Dubai', regionId: 'dubai', places: ['ae', 'dubai'] },
  { id: 'abu-dhabi', label: 'Abu Dhabi', country: 'AE', fulltext: 'Abu Dhabi', regionId: 'abu-dhabi', places: ['ae', 'abu-dhabi'] },
  { id: 'sharjah', label: 'Sharjah', country: 'AE', fulltext: 'Sharjah', regionId: 'sharjah', places: ['ae', 'sharjah'] },
  { id: 'riyadh', label: 'Riyadh', country: 'SA', fulltext: 'Riyadh', regionId: 'riyadh', places: ['sa', 'riyadh'] },
  { id: 'jeddah', label: 'Jeddah', country: 'SA', fulltext: 'Jeddah', regionId: 'jeddah', places: ['sa', 'jeddah'] },
  { id: 'dammam', label: 'Dammam / Khobar', country: 'SA', fulltext: 'Dammam', regionId: 'dammam', places: ['sa', 'dammam', 'al-khobar', 'eastern-province'] },
  { id: 'kochi', label: 'Kochi (Ernakulam)', country: 'IN', fulltext: 'Ernakulam', regionId: 'kochi', places: ['kerala', 'kochi'] },
  { id: 'thiruvananthapuram', label: 'Thiruvananthapuram', country: 'IN', fulltext: 'Thiruvananthapuram', regionId: 'thiruvananthapuram', places: ['kerala', 'thiruvananthapuram'] },
  { id: 'kozhikode', label: 'Kozhikode', country: 'IN', fulltext: 'Kozhikode', regionId: 'kozhikode', places: ['kerala', 'kozhikode'] },
  { id: 'bengaluru', label: 'Bengaluru', country: 'IN', fulltext: 'Bengaluru', regionId: 'bengaluru', places: ['bengaluru'] },
  { id: 'hyderabad', label: 'Hyderabad', country: 'IN', fulltext: 'Hyderabad', regionId: 'hyderabad', places: ['hyderabad'] },
  { id: 'chennai', label: 'Chennai', country: 'IN', fulltext: 'Chennai', regionId: 'chennai', places: ['chennai'] },
  { id: 'pune', label: 'Pune', country: 'IN', fulltext: 'Pune', regionId: 'pune', places: ['pune'] },
  { id: 'mumbai', label: 'Mumbai', country: 'IN', fulltext: 'Mumbai', regionId: 'mumbai', places: ['mumbai'] },
  { id: 'gurugram', label: 'Gurugram', country: 'IN', fulltext: 'Gurugram', regionId: 'gurugram', places: ['delhi-ncr', 'gurugram'] },
  { id: 'noida', label: 'Noida', country: 'IN', fulltext: 'Noida', regionId: 'noida', places: ['delhi-ncr', 'noida'] },
]

export interface McaState {
  id: string
  /** The state as the data set names it. */
  state: string
  /** The two letters a CIN carries for the state (U72200KL2010PTC012345 → KL). */
  cinState: string
  regionId: string
  places: readonly string[]
}

export const MCA_STATES: readonly McaState[] = [
  { id: 'kerala', state: 'Kerala', cinState: 'KL', regionId: 'kerala', places: ['kerala', 'kochi', 'thiruvananthapuram', 'kozhikode'] },
  { id: 'karnataka', state: 'Karnataka', cinState: 'KA', regionId: 'karnataka', places: ['bengaluru'] },
  { id: 'telangana', state: 'Telangana', cinState: 'TG', regionId: 'telangana', places: ['hyderabad'] },
  { id: 'tamil-nadu', state: 'Tamil Nadu', cinState: 'TN', regionId: 'tamil-nadu', places: ['chennai'] },
  { id: 'maharashtra', state: 'Maharashtra', cinState: 'MH', regionId: 'maharashtra', places: ['pune', 'mumbai'] },
]

/** The areas the user's target places switch on (places from lib/company-discovery/targets or the region tree). */
export function areasFor<T extends { places: readonly string[] }>(areas: readonly T[], placeIds: ReadonlySet<string>): T[] {
  return areas.filter((a) => a.places.some((p) => placeIds.has(p)))
}
