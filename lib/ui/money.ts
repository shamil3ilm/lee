import { DEFAULT_CURRENCY, localeForCurrency } from '@/lib/money/currency'

export { DEFAULT_CURRENCY } from '@/lib/money/currency'

/**
 * Format an integer-minor-units amount as a currency-prefixed string with
 * 2 decimal places. Digit grouping follows the currency's locale — INR uses
 * Indian grouping (INR 12,34,567.00). We print the ISO code rather than a
 * symbol so budget vs actual bars read the same everywhere.
 */
export function formatMoney(amountCents: number, currency: string = DEFAULT_CURRENCY): string {
  const absMajor = Math.abs(amountCents / 100)
  const sign = amountCents < 0 ? '-' : ''
  const body = absMajor.toLocaleString(localeForCurrency(currency), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${sign}${currency} ${body}`
}

/**
 * Compact variant for chart axis labels — 12500 cents → "125", 1234500
 * cents → "12,345" (or "12,345" / "1,23,450" per currency grouping). Never
 * renders decimals since the axis needs to stay scan-friendly.
 */
export function formatMoneyCompact(amountCents: number, currency: string = DEFAULT_CURRENCY): string {
  const major = Math.round(amountCents / 100)
  return major.toLocaleString(localeForCurrency(currency))
}

/**
 * Axis-tick variant: compact notation so labels fit the fixed 40px chart
 * gutter — 4000000 cents → "40K", INR 1.25 lakh → "1.3L". Grouped digits
 * ("40,000") were clipped to ",000" on every expense chart (v17 §9.1).
 */
export function formatMoneyAxis(amountCents: number, currency: string = DEFAULT_CURRENCY): string {
  return new Intl.NumberFormat(localeForCurrency(currency), {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amountCents / 100)
}

/**
 * Palette used by every expense category chart / card. Colours are
 * distinct enough at small chart sizes and reuse the app's existing
 * status palette hue-range so cards feel consistent.
 */
export const CATEGORY_COLOURS: Record<string, string> = {
  subscription: 'hsl(258 90% 66%)',
  food: 'hsl(30 88% 55%)',
  groceries: 'hsl(38 92% 50%)',
  dining: 'hsl(15 84% 55%)',
  electricity: 'hsl(45 96% 55%)',
  utilities: 'hsl(220 70% 55%)',
  water: 'hsl(200 90% 60%)',
  internet: 'hsl(217 91% 60%)',
  transport: 'hsl(180 68% 45%)',
  fuel: 'hsl(12 78% 50%)',
  housing: 'hsl(275 60% 55%)',
  rent: 'hsl(288 65% 55%)',
  mortgage: 'hsl(300 55% 50%)',
  health: 'hsl(340 82% 60%)',
  insurance: 'hsl(210 55% 60%)',
  entertainment: 'hsl(320 80% 65%)',
  education: 'hsl(240 60% 65%)',
  shopping: 'hsl(280 65% 60%)',
  travel: 'hsl(190 75% 55%)',
  gifts: 'hsl(350 78% 65%)',
  fees: 'hsl(0 70% 55%)',
  tax: 'hsl(0 60% 45%)',
  other: 'hsl(215 20% 55%)',
}

export function colourFor(category: string): string {
  return CATEGORY_COLOURS[category] ?? 'hsl(215 20% 55%)'
}
