/**
 * Product identity. The user-facing name is "lee" — from Arabic لي, "mine" /
 * "for me": a personal tool that belongs to one person. Always lowercase, even at
 * the start of a sentence. Code, repo, package and URL still say "employ";
 * only what people read uses APP_NAME. Never hard-code the name elsewhere.
 */
export const APP_NAME = 'lee'
export const APP_TAGLINE = 'Your personal job search, organised'

/** Logo colours — keep in sync with app/icon.svg. */
export const BRAND_COLORS = {
  tile: '#1A2B4C',
  glyph: '#A9BCD6',
} as const
