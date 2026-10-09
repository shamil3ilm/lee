import { resolveLocation } from '@/lib/regions/normalize'
import { countryOf } from '@/lib/regions/tree'
import type { PageResult } from '../cursors'
import { companyJson, type CompanyHttpDeps } from '../http'
import { sectorFromName, type Sector } from '../sectors'
import type { CompanyCandidate } from '../types'
import type { Industry } from '../industry'
import type { McaState } from './register-areas'

/**
 * India: the Ministry of Corporate Affairs company master data published
 * on the Open Government Data platform (api.data.gov.in; Government Open
 * Data License – India, which allows use, adaptation and redistribution,
 * commercial or not, with attribution). The API needs a data.gov.in key
 * (free on sign-up): the source runs only when the user saved one in
 * Settings › AI ("data.gov.in"), and is skipped otherwise.
 *
 * ALL activity codes are read (a bank, a hospital or a retailer hires
 * software and data people too); the NIC code inside the CIN only sets the
 * sector the hiring likelihood ranks by. Companies that are not Active
 * (struck off, dissolved, under liquidation) are dropped. Never stored: the
 * e-mail address and the full registered-office address.
 */

export const MCA_API = 'https://api.data.gov.in/resource'
/** "Registrars of Companies (RoC)-wise Company Master Data" (Ministry of Corporate Affairs). */
export const MCA_RESOURCE_ID = '4dbe5667-7b6b-41d7-82af-211562424d9a'
/** The state filter field (not verified live: api.data.gov.in was unreachable from the audit network; the CIN state check below guards it). */
export const MCA_STATE_FILTER = 'filters[CompanyStateCode]'
export const MCA_PAGE_SIZE = 500
export const MCA_PAGES_PER_RUN = 4

export function mcaUrl(state: Pick<McaState, 'state'>, page: number, key: string, size = MCA_PAGE_SIZE): string {
  const n = Math.max(1, Math.min(1000, Math.floor(size)))
  const p = new URLSearchParams({ 'api-key': key, format: 'json', limit: String(n), offset: String((Math.max(1, Math.floor(page)) - 1) * n) })
  p.set(MCA_STATE_FILTER, state.state)
  return `${MCA_API}/${MCA_RESOURCE_ID}?${p.toString()}`
}

/** CIN: L/U + 5-digit NIC + 2-letter state + year + 3-letter type + 6-digit number. */
const CIN = /^[LU](\d{5})([A-Z]{2})(\d{4})([A-Z]{3})(\d{6})$/

export function parseCin(cin: string): { nic: string; state: string; year: number } | null {
  const m = CIN.exec(cin.trim().toUpperCase())
  return m ? { nic: m[1]!, state: m[2]!, year: Number(m[3]) } : null
}

/** NIC 2004 division → sector (CINs issued before NIC 2008 was adopted, about 2011, carry NIC 2004 codes). */
function sectorOfNic2004(d: number): Sector {
  if (d === 72) return 'it'
  if (d === 64) return 'telecom'
  if (d === 65) return 'bank'
  if (d === 66) return 'insurance'
  if (d === 67) return 'finance'
  if (d === 62) return 'airline'
  if (d >= 60 && d <= 63) return 'logistics'
  if (d === 85) return 'healthcare'
  if (d === 80) return 'education'
  if (d === 73) return 'research'
  if (d === 74) return 'consulting'
  if (d === 70) return 'real_estate'
  if (d === 75) return 'government'
  if (d === 45) return 'engineering'
  if (d >= 50 && d <= 52) return 'retail'
  if (d === 55) return 'hospitality'
  if (d === 92 || d === 22) return 'media'
  if (d === 40 || d === 41 || d === 11 || d === 23) return 'energy'
  if (d >= 15 && d <= 37) return 'manufacturing'
  return 'other'
}

/** NIC division (first two digits) → sector: NIC 2008, or NIC 2004 for a CIN registered before 2011. */
export function sectorOfNic(nic: string, year?: number): Sector {
  const d = Number(nic.slice(0, 2))
  if (year !== undefined && year < 2011) return sectorOfNic2004(d)
  if (d === 62) return 'software'
  if (d === 63) return 'it'
  if (d === 61) return 'telecom'
  if (d === 64) return nic.startsWith('6419') ? 'bank' : 'finance'
  if (d === 65) return 'insurance'
  if (d === 66) return 'finance'
  if (d === 51) return 'airline'
  if (d >= 49 && d <= 53) return 'logistics'
  if (d >= 86 && d <= 88) return 'healthcare'
  if (d === 85) return 'education'
  if (d === 84) return 'government'
  if (d === 72) return 'research'
  if (d === 71 || (d >= 41 && d <= 43)) return 'engineering'
  if (d === 69 || d === 70 || d === 73 || d === 74 || d === 78 || d === 82) return 'consulting'
  if (d === 68) return 'real_estate'
  if (d >= 58 && d <= 60) return 'media'
  if (d === 55) return 'hospitality'
  if (d === 56) return 'restaurant'
  if (d === 46 || d === 47) return 'retail'
  if (d === 35 || d === 6 || d === 19) return 'energy'
  if (d >= 10 && d <= 33) return 'manufacturing'
  return 'other'
}

const NIC_INDUSTRY: Readonly<Record<string, Industry>> = { '62': 'software', '63': 'it_services', '61': 'telecom', '64': 'banking' }

/** Lenient field lookup: "Company_Name", "COMPANY_NAME" and "CompanyName" are the same key. */
function fields(rec: unknown): (...names: string[]) => string {
  const m = new Map<string, string>()
  if (rec && typeof rec === 'object') {
    for (const [k, v] of Object.entries(rec as Record<string, unknown>)) {
      if (typeof v === 'string' || typeof v === 'number') m.set(k.toLowerCase().replace(/[^a-z0-9]/g, ''), String(v).replace(/\s+/g, ' ').trim())
    }
  }
  return (...names) => names.map((n) => m.get(n) ?? '').find((v) => v.length > 0) ?? ''
}

function numberOf(v: string): number | undefined {
  const n = Number(v.replace(/[^0-9.]/g, ''))
  return v && Number.isFinite(n) && n > 0 ? n : undefined
}

function regionOf(address: string, state: Pick<McaState, 'regionId'>): string {
  const hit = resolveLocation(address).places.map((p) => p.id).find((id) => countryOf(id) === 'in' && id !== 'in')
  return hit ?? state.regionId
}

/** data.gov.in JSON → active companies registered in the state, and the last page. */
export function parseMcaPage(body: unknown, state: Pick<McaState, 'cinState' | 'regionId'>, size = MCA_PAGE_SIZE): PageResult<CompanyCandidate> & { inState: number } {
  const b = (body ?? {}) as { records?: unknown; total?: unknown }
  const total = Number(b.total)
  const lastPage = Number.isFinite(total) && total > 0 ? Math.ceil(total / size) : 1
  const items: CompanyCandidate[] = []
  let inState = 0
  for (const rec of Array.isArray(b.records) ? b.records : []) {
    const f = fields(rec)
    const name = f('companyname', 'name').slice(0, 200)
    const cin = f('cin', 'corporateidentificationnumber')
    const parsed = parseCin(cin)
    if (parsed && parsed.state !== state.cinState) continue
    inState += 1
    const status = f('companystatus', 'status')
    if (name.length < 2 || (status && !/^active$/i.test(status))) continue
    const nic = parsed?.nic ?? f('niccode', 'industrialclass').replace(/\D/g, '').slice(0, 5)
    const sector: Sector = nic ? sectorOfNic(nic, parsed?.year) : (sectorFromName(name) ?? 'other')
    const industry = nic && (!parsed || parsed.year >= 2011) ? NIC_INDUSTRY[nic.slice(0, 2)] : nic && sector === 'it' ? 'it_services' : undefined
    const paid = numberOf(f('paidupcapital', 'paidupcapitalrs'))
    const address = f('registeredofficeaddress', 'registeredaddress')
    items.push({
      name,
      regionIds: [regionOf(address, state)],
      industries: industry ? [industry] : [],
      sourceTags: ['register:mca'],
      evidence: {
        sector,
        ...(parsed ? { cin: cin.toUpperCase(), founded: parsed.year } : {}),
        ...(nic ? { nic } : {}),
        ...(paid ? { paidUpCapital: paid } : {}),
      },
    })
  }
  return { items, lastPage, inState }
}

/** One page of a state's companies. Throws when the state filter is evidently ignored (a page with no company of the state). */
export async function fetchMcaPage(state: McaState, page: number, key: string, deps: CompanyHttpDeps = {}): Promise<PageResult<CompanyCandidate>> {
  const body = await companyJson('mca-ogd', mcaUrl(state, page, key), { ...deps, timeoutMs: deps.timeoutMs ?? 30_000 }, { maxBytes: 8 * 1024 * 1024 })
  const r = parseMcaPage(body, state)
  const records = (body as { records?: unknown[] } | null)?.records
  if (Array.isArray(records) && records.length > 0 && r.inState === 0) throw new Error('mca-ogd: state filter not applied')
  return { items: r.items, lastPage: r.lastPage }
}
