import * as profileQ from '@/lib/db/queries/profile'
import * as relQ from '@/lib/db/queries/discoveryRelevance'
import { queueRelevanceReevaluation } from './enqueue'
import { evaluateRelevance } from './gate'
import { learnTitle, normalizeTitle, parseLearnedTitles, type LearnedTitle } from './learned'
import { searchPrefsFromProfile, targetFamilies } from './prefs'

/**
 * Learning titles from what the user does (DB only):
 *   - "Show anyway" on a filtered posting, or saving / applying to an
 *     "Uncertain fit" one → the title is related, with the family the JD
 *     reads as (else the first target family);
 *   - "Not for me → Not my field" → the title is unrelated.
 * The learned list changes the relevance key, so the inbox is re-gated.
 */

function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export async function learnFromDiscoveries(
  userId: string,
  ids: readonly string[],
  related: boolean,
  opts: { requeue?: boolean } = {},
): Promise<number> {
  const [profile, rows] = await Promise.all([profileQ.get(userId), relQ.rowsByIds(userId, ids)])
  if (!profile || rows.length === 0) return 0
  const prefs = searchPrefsFromProfile(profile)
  let learned = parseLearnedTitles(profile.learnedTitles)
  for (const r of rows) {
    if (!r.title) continue
    const family = related
      ? (evaluateRelevance(
          { title: r.title, location: r.location, remoteType: r.remoteType, descriptionMd: r.descriptionMd, techStack: asStrings(r.techStack) },
          prefs,
        ).inferredFamily ?? targetFamilies(prefs)[0] ?? null)
      : null
    learned = learnTitle(learned, r.title, { related, family })
  }
  await profileQ.upsert(userId, { learnedTitles: learned })
  if (opts.requeue !== false) await queueRelevanceReevaluation(userId)
  return rows.length
}

/** Settings › Search preferences › Titles lee learned: flip or forget one. */
export async function setLearnedTitle(userId: string, key: string, value: LearnedTitle['related'] | null): Promise<void> {
  const profile = await profileQ.get(userId)
  const learned = parseLearnedTitles(profile?.learnedTitles)
  const k = normalizeTitle(key)
  if (!learned[k]) return
  const next = { ...learned }
  if (value === null) delete next[k]
  else next[k] = { ...learned[k]!, related: value, family: value ? learned[k]!.family : null }
  await profileQ.upsert(userId, { learnedTitles: next })
  await queueRelevanceReevaluation(userId)
}
