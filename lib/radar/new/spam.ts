/**
 * Spam, NSFW and mirror guards for "what's new". Pure.
 *
 *   - Hub repos tagged `not-for-all-audiences` / `nsfw`, or named with
 *     obvious adult words, are dropped;
 *   - GitHub forks, archived repos, mirrors and "awesome-list"/star-bait
 *     repos without a description are dropped.
 */

const NSFW_TAGS: ReadonlySet<string> = new Set(['not-for-all-audiences', 'nsfw', 'porn', 'hentai'])
const NSFW_WORDS = /(?:^|[^a-z])(?:nsfw|porn|porno|hentai|nude|nudity|xxx|lewd|erotic|onlyfans|sexy)(?:[^a-z]|$)/i
const SPAM_WORDS = /(?:^|[^a-z])(?:free[- ]?(?:followers|robux|v-?bucks)|crack(?:ed)?|keygen|airdrop|giveaway|casino|betting)(?:[^a-z]|$)/i

export function isSpam(name: string, tags: readonly string[] = [], description = ''): boolean {
  if (tags.some((t) => NSFW_TAGS.has(t.toLowerCase()))) return true
  const text = `${name} ${description}`
  return NSFW_WORDS.test(text) || SPAM_WORDS.test(text)
}

const MIRROR = /\bmirror(?:ed)? (?:of|from|for)\b|\bmirror repo(?:sitory)?\b|\bread-only mirror\b|\bunofficial mirror\b/i

export function isMirror(name: string, description: string): boolean {
  return /[-_]mirror$/i.test(name) || MIRROR.test(description)
}
