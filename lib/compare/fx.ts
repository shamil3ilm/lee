import { USD_PEGS } from '@/lib/discovery/relevance/pay'
import { shortDay } from '@/lib/ui/date'
import type { Confidence, SourceRef } from './evidence'
import { FLOATING_CURRENCIES, type CompareCurrency, type FloatingCurrency, type FxTable } from './types'

/**
 * Currency conversion for the comparison. GCC currencies convert through
 * their US-dollar pegs (lib/discovery/relevance/pay.ts, central-bank
 * figures); INR, EUR and GBP float, so they convert only through the
 * user's own FX table (Settings › Profile › Current job), never a guess.
 * KWD is pegged to an undisclosed basket, so its rate is an estimate.
 */

export interface Conversion {
  amount: number | null
  confidence: Confidence
  /** null when no conversion was needed. */
  source: SourceRef | null
  /** The floating currency whose rate is missing, if that blocked it. */
  missing: FloatingCurrency | null
}

function isFloating(c: CompareCurrency): c is FloatingCurrency {
  return (FLOATING_CURRENCIES as readonly string[]).includes(c)
}

/** Units of `c` per 1 USD, or null when it floats and the table has no rate. */
export function unitsPerUsd(c: CompareCurrency, fx: FxTable): number | null {
  if (isFloating(c)) return fx.rates[c] ?? null
  return USD_PEGS[c]
}

function fxLabel(fx: FxTable): string {
  const when = fx.updatedAt ? `, updated ${shortDay(fx.updatedAt)}` : ''
  const how = fx.source === 'ecb' ? ' (ECB reference rates)' : ''
  return `Your FX table${how}${when}`
}

export function convertMoney(amount: number, from: CompareCurrency, to: CompareCurrency, fx: FxTable): Conversion {
  if (from === to) return { amount, confidence: 'known', source: null, missing: null }
  const a = unitsPerUsd(from, fx)
  const b = unitsPerUsd(to, fx)
  const missing = a === null && isFloating(from) ? from : b === null && isFloating(to) ? to : null
  if (a === null || b === null) {
    return { amount: null, confidence: 'unknown', source: { kind: 'fx_table', label: fxLabel(fx) }, missing }
  }
  const viaTable = isFloating(from) || isFloating(to)
  const basket = from === 'KWD' || to === 'KWD'
  const source: SourceRef = viaTable
    ? { kind: 'fx_table', label: fxLabel(fx) }
    : { kind: 'peg', label: basket ? 'USD pegs (KWD basket, approximate)' : 'USD pegs (central banks)' }
  return { amount: (amount / a) * b, confidence: viaTable || basket ? 'estimated' : 'known', source, missing: null }
}

/** "1 AED = 22.65 INR" for the settings card; null when a rate is missing. */
export function rateLine(from: CompareCurrency, to: CompareCurrency, fx: FxTable): string | null {
  const c = convertMoney(1, from, to, fx)
  if (c.amount === null) return null
  const digits = c.amount >= 10 ? 2 : 4
  return `1 ${from} = ${c.amount.toFixed(digits)} ${to}`
}

const GROUPING: Readonly<Partial<Record<CompareCurrency, string>>> = { INR: 'en-IN' }

/** "INR 1,85,000" / "AED 18,000"; whole units. */
export function formatMoney(amount: number, currency: CompareCurrency): string {
  const locale = GROUPING[currency] ?? 'en-US'
  return `${currency} ${Math.round(amount).toLocaleString(locale)}`
}
