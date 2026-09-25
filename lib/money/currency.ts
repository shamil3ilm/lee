/**
 * Single source of truth for the app's default currency. Every fallback that
 * used to hardcode a currency code reads this instead, so switching the
 * default is a one-line change. Pure and client-safe.
 */
export const DEFAULT_CURRENCY = 'INR'

// Locale used for digit grouping per currency. INR uses Indian grouping
// (12,34,567.00); anything unlisted falls back to en-US grouping.
const LOCALE_BY_CURRENCY: Record<string, string> = {
  INR: 'en-IN',
  AED: 'en-AE',
  SAR: 'en-SA',
  QAR: 'en-QA',
  KWD: 'en-KW',
  BHD: 'en-BH',
  OMR: 'en-OM',
  USD: 'en-US',
  EUR: 'en-IE',
  GBP: 'en-GB',
}

export function localeForCurrency(currency: string): string {
  return LOCALE_BY_CURRENCY[currency.toUpperCase()] ?? 'en-US'
}

export function normalizeCurrency(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim().toUpperCase()
  return trimmed.length > 0 ? trimmed : DEFAULT_CURRENCY
}
