import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { companies, sources, userDefaults } from '@/lib/db/schema'
import { DEFAULT_SOURCES, DEFAULTS_VERSION, sourceIdentity, type DefaultSource } from './catalog'

export interface ApplyDefaultsResult {
  /** Version recorded for the user after this call. */
  version: number
  addedSources: number
  addedCompanies: number
  /** Newly added sources that are enabled — callers queue their first poll. */
  enabledSourceIds: string[]
}

interface ApplyOptions {
  /** Test seams: a different catalog / version. */
  catalog?: readonly DefaultSource[]
  version?: number
}

/**
 * Give a user the starter defaults they haven't received yet.
 *
 * Applied once per catalog version: only defaults with `since` above the
 * user's recorded version are considered, so a default the user deleted is
 * never re-added, and existing users still get defaults added later. A board
 * the user already has (same kind + slug/URL, case-insensitive) is skipped.
 *
 * The user_defaults row is locked for the transaction so concurrent callers
 * (sign-in, scheduler, Run now) can't apply the same version twice.
 */
export async function applyDefaults(userId: string, opts: ApplyOptions = {}): Promise<ApplyDefaultsResult> {
  const catalog = opts.catalog ?? DEFAULT_SOURCES
  const targetVersion = opts.version ?? DEFAULTS_VERSION

  return db.transaction(async (tx) => {
    await tx.insert(userDefaults).values({ userId, version: 0 }).onConflictDoNothing()
    const [state] = await tx
      .select({ version: userDefaults.version })
      .from(userDefaults)
      .where(eq(userDefaults.userId, userId))
      .for('update')
    const current = state?.version ?? 0
    if (current >= targetVersion) {
      return { version: current, addedSources: 0, addedCompanies: 0, enabledSourceIds: [] }
    }

    const pending = catalog.filter((d) => d.since > current && d.since <= targetVersion)
    const existing = await tx
      .select({ kind: sources.kind, config: sources.config })
      .from(sources)
      .where(eq(sources.userId, userId))
    const have = new Set(existing.map((s) => sourceIdentity(s.kind, s.config as Record<string, unknown>)))
    const toAdd = pending.filter((d) => !have.has(sourceIdentity(d.kind, d.config)))

    const inserted =
      toAdd.length === 0
        ? []
        : await tx
            .insert(sources)
            .values(toAdd.map((d) => ({ userId, name: d.name, kind: d.kind, config: d.config, enabled: d.enabled })))
            .returning()

    const companyRows = pending
      .filter((d): d is DefaultSource & { company: NonNullable<DefaultSource['company']> } => Boolean(d.company))
      .map((d) => ({
        userId,
        name: d.company.name,
        domain: d.company.domain,
        website: d.company.website,
        headquartersCountry: d.company.headquartersCountry ?? null,
        isWatched: d.enabled,
      }))
    const addedCompanies =
      companyRows.length === 0
        ? []
        : await tx
            .insert(companies)
            .values(companyRows)
            .onConflictDoNothing({ target: [companies.userId, companies.domain] })
            .returning()

    await tx
      .update(userDefaults)
      .set({ version: targetVersion, appliedAt: sql`now()` })
      .where(eq(userDefaults.userId, userId))

    return {
      version: targetVersion,
      addedSources: inserted.length,
      addedCompanies: addedCompanies.length,
      enabledSourceIds: inserted.filter((r) => r.enabled).map((r) => r.id),
    }
  })
}
