import { db, type DbClient } from '@/lib/db/client'
import * as ratingsQ from '@/lib/db/queries/academyRatings'
import * as stateQ from '@/lib/db/queries/academyState'
import { logger } from '@/lib/logger'
import { readStoredProfile } from '@/lib/resume/service'
import type { AcademyContent } from '@/lib/academy/content/catalog'
import { evidenceSignature, seedWrites } from '@/lib/academy/placement/apply'
import { evidenceUnits } from '@/lib/academy/placement/evidence'
import { placeFromProfile, type Placement } from '@/lib/academy/placement/seed'
import { capJson, SEED_MAX_BYTES } from './caps'
import { readSeed } from './skill-states'

/**
 * Keep placement seeds in step with the master profile (user_profile.resume).
 * Reads the profile and its private readiness flags; never writes them.
 * Re-seeds only when the evidence fingerprint changes, and only skills with
 * no attempts (practice outranks the profile). Each change is snapshotted in
 * academy_rating_history (kind "placement").
 */

const EMPTY: Placement = { seeds: [], studyTargets: [], unmappedStudy: [] }

export async function loadPlacement(userId: string, content: AcademyContent): Promise<{ placement: Placement; signature: string }> {
  const profile = await readStoredProfile(userId)
  if (!profile) return { placement: EMPTY, signature: 'none' }
  return {
    placement: placeFromProfile(profile, content.graph),
    signature: evidenceSignature(evidenceUnits(profile), content.graph.version),
  }
}

export async function syncPlacement(userId: string, content: AcademyContent, client: DbClient = db): Promise<Placement> {
  const { placement, signature } = await loadPlacement(userId, content)
  const state = await stateQ.ensure(userId, client)
  if (state.profileSignature === signature) return placement
  const existing = await ratingsQ.list(userId, client)
  const planned = seedWrites(
    existing.map((r) => ({ skillId: r.skillId, attempts: r.attempts, seeded: r.seed !== null })),
    placement.seeds,
  )
  // Skip seeds that are already stored as is (no duplicate history rows).
  const byId = new Map(existing.map((r) => [r.skillId, r]))
  const writes = {
    ...planned,
    upserts: planned.upserts.filter((s) => {
      const row = byId.get(s.skillId)
      return !row || row.rating !== s.rating || row.deviation !== s.deviation || readSeed(row.seed)?.explanation !== s.explanation
    }),
  }
  await client.transaction(async (tx) => {
    for (const s of writes.upserts) {
      const seed = capJson({ explanation: s.explanation, sources: s.sources }, SEED_MAX_BYTES, { explanation: s.explanation, sources: [] })
      await ratingsQ.upsert(
        userId,
        { skillId: s.skillId, rating: s.rating, deviation: s.deviation, level: s.level, attempts: 0, lastPracticedAt: null, seed },
        tx,
      )
    }
    await ratingsQ.removeUnpracticed(userId, writes.removals, tx)
    await ratingsQ.addHistory(
      userId,
      writes.upserts.map((s) => ({ skillId: s.skillId, attemptId: null, kind: 'placement' as const, rating: s.rating, deviation: s.deviation, level: s.level })),
      tx,
    )
    await stateQ.update(userId, { profileSignature: signature }, tx)
  })
  logger.info('academy_placement_seeded', {
    seeds: writes.upserts.length,
    removed: writes.removals.length,
    studyTargets: placement.studyTargets.length,
  })
  return placement
}
