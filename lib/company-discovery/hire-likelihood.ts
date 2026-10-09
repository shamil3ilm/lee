import type { Industry } from './industry'
import { SECTOR_LABELS, SECTOR_PRIOR, isSector, type Sector } from './sectors'
import type { CompanyEvidence, SizeBand } from './types'

/**
 * "Does this employer hire software, data, analyst, ERP or BI people?" — a
 * 0–100 likelihood for EVERY kind of employer (a bank or an airline hires
 * them as much as a software house), with a one-line explanation for the
 * card ("Likely hires: data/IT (bank, 1,000+ staff)"). Deterministic, pure,
 * client-safe. It ranks noisy map and register listings and explains them;
 * it is NOT part of the company fit and adds no fame or growth points.
 *
 *   job postings seen with your roles   +35  (the strongest signal)
 *   a job board / careers page          +15 / +10
 *   sector prior                        2…35 (lib/company-discovery/sectors)
 *   size: staff 1000+ / 200+ / 50+ / 10+ +30 / +22 / +12 / +5
 *         paid-up capital ≥ ₹10 cr / ₹1 cr / ₹10 lakh  +18 / +10 / +4
 *         branches (map) 5+ / 2+        +12 / +6
 *   an LEI (regulated, transacting)     +8
 *   a website that answers              +8
 *
 * Unknown parts add nothing and take nothing away. A company is never
 * dropped for its sector alone: only `isObviousNonEmployer` drops (single
 * shops, restaurants, ATMs, homes).
 */

export type LikelihoodBand = 'high' | 'medium' | 'low'

export interface HireLikelihood {
  score: number
  band: LikelihoodBand
  /** "Likely hires: data/IT (bank, 1,000+ staff)". */
  why: string
}

export interface LikelihoodInput {
  sector?: Sector | string | null
  industries?: readonly string[]
  sizeBand?: SizeBand | string | null
  evidence: Pick<CompanyEvidence, 'employees' | 'paidUpCapital' | 'branches' | 'lei' | 'jobsSeen' | 'openRoles' | 'siteLive'>
  careersUrl?: string | null
  atsKind?: string | null
  website?: string | null
}

const INDUSTRY_SECTOR: Readonly<Record<Industry, Sector>> = {
  payments: 'finance',
  fintech: 'finance',
  banking: 'bank',
  einvoicing: 'software',
  erp: 'software',
  saas: 'software',
  software: 'software',
  it_services: 'it',
  ecommerce: 'ecommerce',
  data: 'software',
  telecom: 'telecom',
}

const BAND_STAFF: Readonly<Record<string, number>> = { '1-10': 5, '11-50': 30, '51-200': 120, '201-1000': 500, '1000+': 1000 }

function sectorOf(input: LikelihoodInput): Sector | null {
  if (isSector(input.sector)) return input.sector
  for (const i of input.industries ?? []) {
    const s = INDUSTRY_SECTOR[i as Industry]
    if (s) return s
  }
  return null
}

function staffOf(input: LikelihoodInput): number | null {
  const n = input.evidence.employees
  if (typeof n === 'number' && n > 0) return n
  return input.sizeBand ? (BAND_STAFF[input.sizeBand] ?? null) : null
}

function staffPoints(n: number | null): number {
  if (n === null) return 0
  if (n >= 1000) return 30
  if (n >= 200) return 22
  if (n >= 50) return 12
  return n >= 10 ? 5 : 0
}

function capitalPoints(inr: number | undefined): number {
  if (typeof inr !== 'number' || !(inr > 0)) return 0
  if (inr >= 1e8) return 18
  if (inr >= 1e7) return 10
  return inr >= 1e6 ? 4 : 0
}

function staffText(n: number | null, input: LikelihoodInput): string | null {
  if (n !== null && n >= 1000) return '1,000+ staff'
  if (n !== null && n >= 200) return '200+ staff'
  if (n !== null && n >= 50) return '50+ staff'
  const b = input.evidence.branches
  if (typeof b === 'number' && b >= 2) return `${b} branches`
  const cap = input.evidence.paidUpCapital
  if (typeof cap === 'number' && cap >= 1e7) return `paid-up capital ₹${Math.round(cap / 1e7)} cr`
  return null
}

export function hireLikelihood(input: LikelihoodInput): HireLikelihood {
  const ev = input.evidence
  const sector = sectorOf(input)
  const staff = staffOf(input)
  const jobs = (ev.jobsSeen ?? 0) > 0
  const branches = typeof ev.branches === 'number' ? (ev.branches >= 5 ? 12 : ev.branches >= 2 ? 6 : 0) : 0
  const parts = [
    jobs ? 35 : 0,
    input.atsKind || (ev.openRoles ?? 0) > 0 ? 15 : input.careersUrl ? 10 : 0,
    sector ? SECTOR_PRIOR[sector] : 0,
    Math.max(staffPoints(staff), capitalPoints(ev.paidUpCapital), branches),
    ev.lei ? 8 : 0,
    ev.siteLive === true || (ev.siteLive === undefined && input.careersUrl) ? 8 : 0,
  ]
  const score = Math.max(0, Math.min(100, Math.round(parts.reduce((a, b) => a + b, 0))))
  const band: LikelihoodBand = score >= 55 || jobs ? 'high' : score >= 30 ? 'medium' : 'low'
  const facts = [
    jobs ? `posted ${ev.jobsSeen} job${ev.jobsSeen === 1 ? '' : 's'} you saw` : null,
    sector ? SECTOR_LABELS[sector] : null,
    staffText(staff, input),
    !jobs && (input.atsKind || input.careersUrl) ? 'has a careers page' : null,
    ev.lei && !staffText(staff, input) ? 'registered LEI' : null,
  ].filter((x): x is string => !!x)
  const detail = facts.length > 0 ? ` (${facts.slice(0, 3).join(', ')})` : ''
  const lead = band === 'high' ? 'Likely hires: data/IT' : band === 'medium' ? 'May hire: data/IT' : 'Unlikely to hire data/IT'
  return { score, band, why: `${lead}${detail}` }
}

/** OSM tag values that are never an employer worth listing (a single outlet or a home). */
const NON_EMPLOYER_AMENITY = /^(atm|restaurant|cafe|fast_food|bar|pub|ice_cream|food_court|vending_machine|fuel|parking|toilets|place_of_worship|bureau_de_change|money_transfer|car_wash)$/
const NON_EMPLOYER_SHOP = /^(?!mall$|department_store$|supermarket$|wholesale$).+/
const RESIDENTIAL_BUILDING = /^(house|residential|apartments|detached|semidetached_house|terrace|hut|bungalow|dormitory)$/

/**
 * Obvious non-employers in OpenStreetMap: ATMs, restaurants and cafés,
 * single shops (malls, department stores, supermarkets and wholesale stay),
 * homes, and anything without a name. Everything else is kept and ranked.
 */
export function isObviousNonEmployer(tags: Readonly<Record<string, string>>): boolean {
  if (!(tags.name ?? tags['name:en'] ?? '').trim()) return true
  if (tags.amenity && NON_EMPLOYER_AMENITY.test(tags.amenity)) return true
  if (tags.shop && NON_EMPLOYER_SHOP.test(tags.shop) && !tags.office) return true
  if (tags.building && RESIDENTIAL_BUILDING.test(tags.building) && !tags.office) return true
  if (tags.office === 'diplomatic' || tags.office === 'religion' || tags.office === 'political_party') return true
  return false
}
