import { convertMoney, formatMoney } from './fx'
import {
  PLACE_CURRENCY,
  PLACE_LABELS,
  placeAssumption,
  type Assumptions,
  type CompareCurrency,
  type Place,
} from './types'

/**
 * The "equivalent take-home" estimate. Always an estimate, with every
 * assumption listed:
 *
 *   net        = gross × (1 − effective tax rate for the place)
 *   disposable = net − housing − other living costs (the place's own
 *                currency, converted); housing is 0 when the employer
 *                provides it
 *
 * GCC places default to 0% tax (no personal income tax); India and
 * "elsewhere" have no default, so their net stays unknown until the user
 * sets a rate. Unknown inputs leave the result unknown, never zero.
 */

export interface TakeHomeInput {
  grossMonthly: number
  currency: CompareCurrency
  place: Place
  /** The employer provides housing or a housing allowance. */
  housingProvided?: boolean
  assumptions: Assumptions
}

export interface TakeHome {
  gross: number
  taxRate: number | null
  net: number | null
  housing: number | null
  living: number | null
  disposable: number | null
  /** Human lines, in order, for the "assumptions" list. */
  assumptions: string[]
}

function costIn(amount: number | null, place: Place, to: CompareCurrency, a: Assumptions): number | null {
  if (amount === null) return null
  return convertMoney(amount, PLACE_CURRENCY[place], to, a.fx).amount
}

export function takeHome(input: TakeHomeInput): TakeHome {
  const { grossMonthly: gross, currency, place, assumptions: a } = input
  const p = placeAssumption(a, place)
  const where = PLACE_LABELS[place]
  const lines: string[] = []
  const net = p.taxRate === null ? null : gross * (1 - p.taxRate / 100)
  if (p.taxRate === null) lines.push(`${where}: effective tax not set, so take-home is unknown.`)
  else if (p.taxDefault) lines.push(`${where}: ${p.taxRate}% income tax (no personal income tax on salaries).`)
  else lines.push(`${where}: ${p.taxRate}% effective tax (your assumption).`)

  const housing = input.housingProvided ? 0 : costIn(p.housing, place, currency, a)
  if (input.housingProvided) lines.push('Housing: provided or paid as an allowance, per the posting.')
  else if (housing === null) lines.push(`${where}: housing cost not set.`)
  else lines.push(`${where}: housing ${formatMoney(housing, currency)}/mo (your assumption).`)

  const living = costIn(p.living, place, currency, a)
  if (living === null) lines.push(`${where}: other living costs not set.`)
  else lines.push(`${where}: other living costs ${formatMoney(living, currency)}/mo (your assumption).`)

  const disposable = net !== null && housing !== null && living !== null ? net - housing - living : null
  return { gross, taxRate: p.taxRate, net, housing, living, disposable, assumptions: lines }
}

export type PayBasis = 'disposable' | 'net' | 'gross'

export interface PayRatio {
  ratio: number
  basis: PayBasis
}

/**
 * Compare like with like: after living costs when both sides have them,
 * else after tax, else gross (the caller labels which).
 */
export function payRatio(job: TakeHome, current: TakeHome): PayRatio | null {
  if (job.disposable !== null && current.disposable !== null && current.disposable > 0) {
    return { ratio: job.disposable / current.disposable, basis: 'disposable' }
  }
  if (job.net !== null && current.net !== null && current.net > 0) return { ratio: job.net / current.net, basis: 'net' }
  if (current.gross > 0) return { ratio: job.gross / current.gross, basis: 'gross' }
  return null
}

export const BASIS_LABELS: Readonly<Record<PayBasis, string>> = {
  disposable: 'take-home after living costs',
  net: 'take-home after tax',
  gross: 'gross pay (tax and costs not set)',
}
