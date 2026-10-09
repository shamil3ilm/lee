/**
 * Portfolio → lee sync switches. Client-safe (no I/O).
 *
 * The portfolio's profile.json is the source of the PUBLIC profile facts
 * (basics, work, projects, skills, education, languages, certifications,
 * links, the portfolio page). lee pulls it and keeps a lee-only overlay on
 * top: readiness / depth flags, alternate wordings, skill kinds, private
 * items and variant settings.
 *
 * `PROFILE_EDIT_IN_LEE` is the one switch for editing public facts in lee.
 * Off (today): once the portfolio has been synced, public facts are
 * read-only in lee — the server refuses a save that changes them
 * (lib/portfolio/lock.ts) and the editor shows them read-only with an
 * "Edit in your portfolio" link. Turning it on later means adding a
 * write-through (commit to profile.json, then re-pull) behind this flag.
 */

export const PROFILE_EDIT_IN_LEE = false

/**
 * Whether public profile facts may be edited in lee at all (the global
 * switch). Importers (URL, LinkedIn export, CV) should not add public facts
 * while this is false. For one user, `canEditPublicFacts(userId)` in
 * lib/portfolio/lock.ts also allows it when no portfolio has been synced.
 */
export function profileEditableInLee(): boolean {
  return PROFILE_EDIT_IN_LEE
}

/** How often opening Profile / Résumé / Portfolio re-checks the source. */
export const PULL_THROTTLE_MS = 10 * 60 * 1000

/** Effective throttle; `PORTFOLIO_PULL_THROTTLE_MS` overrides it (e2e uses 0). */
export function pullThrottleMs(): number {
  const raw = process.env.PORTFOLIO_PULL_THROTTLE_MS
  const n = raw === undefined || raw === '' ? Number.NaN : Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : PULL_THROTTLE_MS
}

export const LOCKED_MESSAGE = 'Your portfolio is the source. Edit there; lee syncs automatically.'

const REPO = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/

/** GitHub's web editor for the configured file, or null when no repository is set. */
export function portfolioEditUrl(config: { repo: string; branch: string; path: string } | null): string | null {
  if (!config || !REPO.test(config.repo) || !config.path) return null
  const enc = (s: string): string => s.split('/').map(encodeURIComponent).join('/')
  return `https://github.com/${config.repo}/edit/${enc(config.branch || 'main')}/${enc(config.path)}`
}
