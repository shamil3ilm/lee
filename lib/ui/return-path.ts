/**
 * A `?from=` value that is safe to link back to: a same-origin path only.
 * Rejects protocol-relative (`//evil`), backslash tricks (`/\evil`),
 * absolute URLs and anything with control characters.
 */
export function safeReturnPath(raw: string | string[] | undefined | null): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (typeof v !== 'string' || v.length === 0 || v.length > 200) return null
  if (!v.startsWith('/')) return null
  if (v.startsWith('//') || v.startsWith('/\\')) return null
  if (/[\u0000-\u001f\u007f\\]/.test(v)) return null
  return v
}
