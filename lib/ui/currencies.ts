/** Currencies offered for pay fields: the user's markets first, then majors. */
export const COMMON_CURRENCIES = [
  'INR', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'USD', 'EUR', 'GBP', 'SGD', 'CAD', 'AUD', 'CHF', 'JPY',
] as const

function currencyName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'currency' }).of(code) ?? code
  } catch {
    return code
  }
}

/**
 * `{ code, label }` options ("INR · Indian Rupee"). A saved code that is not
 * in the common list stays selectable, so an existing value never renders blank.
 */
export function currencyOptions(current?: string | null): Array<{ code: string; label: string }> {
  const codes: string[] = [...COMMON_CURRENCIES]
  const cur = (current ?? '').trim().toUpperCase()
  if (/^[A-Z]{3}$/.test(cur) && !codes.includes(cur)) codes.unshift(cur)
  return codes.map((code) => ({ code, label: `${code} · ${currencyName(code)}` }))
}
