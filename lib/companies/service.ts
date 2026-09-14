import * as companiesQ from '@/lib/db/queries/companies'
import { db } from '@/lib/db/client'
import { sources } from '@/lib/db/schema'
import { detectATSFromDomain, type DetectedATS } from './ats-detect'
import type { Company } from '@/lib/db/queries/companies'

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
