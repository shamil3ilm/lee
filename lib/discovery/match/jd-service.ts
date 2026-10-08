import * as profileQ from '@/lib/db/queries/profile'
import * as matchQ from '@/lib/db/queries/discoveryMatch'
import * as relQ from '@/lib/db/queries/discoveryRelevance'
import { gateColumns, relevanceContext } from '../relevance/service'
import { fetchJd, jdTarget } from './jd-fetch'
import { fitColumns, matchContext, rowToJob } from './service'

/**
 * "Paste the JD to score properly" and "Fetch the full JD": store the JD on
 * the discovery, then re-score it and re-gate it with the same rules as
 * ingest. DB-only apart from the one user-initiated ATS fetch.
 */

export const JD_MAX_CHARS = 20_000
export const JD_MIN_CHARS = 80

export type JdResult = { ok: true; score: number } | { ok: false; error: string }

async function rescoreOne(userId: string, id: string): Promise<JdResult> {
  const [profile, row] = await Promise.all([profileQ.get(userId), matchQ.rowForMatch(userId, id)])
  if (!row) return { ok: false, error: 'That posting is gone.' }
  const job = rowToJob(row)
  const fit = fitColumns(job, matchContext(profile))
  await matchQ.applyFitBatch(userId, [{ id, fit }])
  const rel = relevanceContext(profile)
  await relQ.applyGateBatch(userId, rel.key, [{ id, gate: gateColumns(job, rel) }])
  return { ok: true, score: fit.fitScore }
}

export async function saveJd(userId: string, id: string, text: string, source: 'pasted' | 'fetched'): Promise<JdResult> {
  const clean = text.replace(/\r\n/g, '\n').trim().slice(0, JD_MAX_CHARS)
  if (clean.length < JD_MIN_CHARS) return { ok: false, error: 'Paste the whole job description (a few paragraphs).' }
  if (!(await matchQ.setDescription(userId, id, clean, source))) return { ok: false, error: 'That posting is gone.' }
  return rescoreOne(userId, id)
}

export async function fetchAndSaveJd(userId: string, id: string): Promise<JdResult> {
  const row = await matchQ.rowForMatch(userId, id)
  if (!row) return { ok: false, error: 'That posting is gone.' }
  const target = jdTarget(row.applyUrl)
  if (!target) return { ok: false, error: 'This site has no public job API. Paste the JD instead.' }
  const text = await fetchJd(target).catch(() => null)
  if (!text) return { ok: false, error: 'Could not fetch the JD. Paste it instead.' }
  return saveJd(userId, id, text, 'fetched')
}
