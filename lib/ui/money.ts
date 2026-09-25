/**
 * Format an integer-minor-units amount as a currency-prefixed string.
 * Defaults to AED (Shamil's home currency) and 2 decimal places. Kept
 * ISO-4217-symbol-agnostic — we print the code, not a locale-specific
 * symbol, so budget vs actual bars always read the same regardless of
 * where the app renders.
 */
export function formatMoney(amountCents: number, currency = 'AED'): string {
  const absMajor = Math.abs(amountCents / 100)
  const sign = amountCents < 0 ? '-' : ''
  const body = absMajor.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${sign}${currency} ${body}`
}

/**
 * Compact variant for chart axis labels — 12500 cents → "125", 1234500
 * cents → "12,345". Never renders decimals since the axis needs to stay
 * scan-friendly.
 */
export function formatMoneyCompact(amountCents: number): string {
  const major = Math.round(amountCents / 100)
  return major.toLocaleString('en-US')
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
