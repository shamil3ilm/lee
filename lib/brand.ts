/**
 * Product identity. The user-facing name is "lee" — from Arabic لي, "mine" /
 * "for me": a personal tool that belongs to one person. Always lowercase, even at
 * the start of a sentence. Package, repo and deployment are "lee" too; only
 * internal identifiers keep "employ" on purpose (localStorage keys — renaming
 * would reset saved preferences — and private Drive appProperties tags).
 * Never hard-code the name elsewhere: use APP_NAME.
 */
export const APP_NAME = 'lee'
export const APP_TAGLINE = 'Your personal job search, organised'

/** Logo colours — keep in sync with app/icon.svg. */
export const BRAND_COLORS = {
  tile: '#1A2B4C',
  glyph: '#A9BCD6',
} as const
