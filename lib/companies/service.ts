import * as companiesQ from '@/lib/db/queries/companies'
import { db } from '@/lib/db/client'
import { sources } from '@/lib/db/schema'
import { detectATSFromDomain, type DetectedATS } from './ats-detect'
import type { Company, NewCompany } from '@/lib/db/queries/companies'

export interface AddWatchedCompanyArgs {
  userId: string
  name: string
  domain: string
  headquartersCountry?: string
  size?: string
  stage?: string
  interestLevel?: number
}

export interface AddWatchedCompanyResult {
  company: Company
  detectedSource: DetectedATS
}

export async function addWatchedCompany(
  args: AddWatchedCompanyArgs,
): Promise<AddWatchedCompanyResult> {
  // ATS detection is a network probe and cannot participate in the DB
  // transaction, so run it up-front. All DB writes then commit atomically.
  const detected = await detectATSFromDomain(args.domain)

  const { company } = await db.transaction(async (tx) => {
    const c = await companiesQ.findOrCreateByDomain(args.userId, args.domain, args.name, tx)
    const updated = await companiesQ.update(
      args.userId,
      c.id,
      {
        isWatched: true,
        stance: 'watching',
        headquartersCountry: args.headquartersCountry ?? c.headquartersCountry ?? null,
        size: args.size ?? c.size ?? null,
        stage: args.stage ?? c.stage ?? null,
        interestLevel: args.interestLevel ?? c.interestLevel ?? null,
      },
      tx,
    )

    if (detected) {
      await tx
        .insert(sources)
        .values({
          userId: args.userId,
          name: `${args.name} — ${detected.kind}`,
          kind: detected.kind,
          config: { company: detected.slug, companyId: c.id },
          enabled: false, // v1 keeps disabled; v1.5 flips to true
        })
        .onConflictDoNothing()
    }

    return { company: updated ?? c }
  })

  return { company, detectedSource: detected }
}

// ---------------------------------------------------------------------------
// Detail-page mutations (thin service wrappers so callers don't touch queries
// directly and revalidation stays route-local in the action layer).
// ---------------------------------------------------------------------------

export async function updateCompanyDetails(
  userId: string,
  id: string,
  patch: Partial<NewCompany>,
): Promise<Company | undefined> {
  return companiesQ.update(userId, id, patch)
}

export async function setInterestLevel(
  userId: string,
  id: string,
  level: number,
): Promise<Company | undefined> {
  const clamped = Math.max(0, Math.min(5, Math.round(level)))
  return companiesQ.update(userId, id, {
    interestLevel: clamped === 0 ? null : clamped,
  })
}

const ALLOWED_STANCES = new Set(['watching', 'target', 'passive', 'not_interested'])

export async function setStance(
  userId: string,
  id: string,
  stance: string,
): Promise<Company | undefined> {
  if (!ALLOWED_STANCES.has(stance)) throw new Error('invalid stance')
  return companiesQ.update(userId, id, { stance })
}

export async function removeFromWatchlist(
  userId: string,
  id: string,
): Promise<Company | undefined> {
  return companiesQ.update(userId, id, { isWatched: false })
}

export type DeleteCompanyResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'has_applications'; count: number }

/**
 * Delete a company — refused while any application still points at one of
 * its jobs. Jobs' company_id is `set null` on delete, so allowing it would
 * silently strip the company from live applications. The user reassigns
 * (Edit details on the application) or deletes those applications first.
 * Contacts are unlinked (set null) and discovery sources stay.
 */
export async function deleteCompany(userId: string, id: string): Promise<DeleteCompanyResult> {
  // One transaction so an application created between the check and the
  // delete can't slip through.
  return db.transaction(async (tx): Promise<DeleteCompanyResult> => {
    const count = await companiesQ.countApplications(userId, id, tx)
    if (count > 0) return { ok: false, reason: 'has_applications', count }
    const ok = await companiesQ.remove(userId, id, tx)
    return ok ? { ok: true } : { ok: false, reason: 'not_found' }
  })
}
