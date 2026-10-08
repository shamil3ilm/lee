import { requestJson, type HttpDeps } from '@/lib/reputation/http'
import { FLOATING_CURRENCIES, type FloatingCurrency } from './types'

/**
 * Optional free FX source: Frankfurter (frankfurter.dev), an open-source,
 * keyless API serving the European Central Bank's daily reference rates.
 * Only fetched when the user clicks "Fetch ECB rates"; the numbers fill the
 * form and are saved only when the user saves (they can edit them first).
 * No paid FX API is ever used. See docs/job-comparison.md.
 */

export const FX_SOURCE_URL = `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${FLOATING_CURRENCIES.join(',')}`

export interface FetchedRates {
  rates: Record<FloatingCurrency, number | null>
  /** yyyy-mm-dd of the ECB reference rates. */
  date: string
}

function rateOf(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

export async function fetchEcbRates(deps: HttpDeps = {}): Promise<FetchedRates> {
  const body = (await requestJson('Frankfurter', FX_SOURCE_URL, deps)) as { date?: unknown; rates?: Record<string, unknown> }
  const rates = body.rates ?? {}
  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : ''
  if (!date || !rateOf(rates.INR)) throw new Error('Frankfurter: unexpected response')
  return { rates: { INR: rateOf(rates.INR), EUR: rateOf(rates.EUR), GBP: rateOf(rates.GBP) }, date }
}
