import { sql } from 'drizzle-orm'
import { affected, clientOf, cutoff, inBatches, userScope, type BatchOpts } from './batch'
import { DEFAULT_RETENTION_POLICY } from './windows'

/**
 * Old résumé variant versions. A variant appends a version on every recipe
 * change, so a variant edited for months keeps dozens of recipes nobody
 * will open again. Versions older than the window are deleted, except:
 *   - the latest version of each variant (what the editor shows);
 *   - any version an application records (applications.resume_variant_*),
 *     because tailoring for that application starts from it;
 *   - any version that was ever published to the portfolio (published_at
 *     is set on publish and never cleared, not even by Unpublish).
 * Idempotent: a second run finds nothing new to delete.
 */

export const VARIANT_VERSION_RETENTION_DAYS = DEFAULT_RETENTION_POLICY.variantVersionDays

type Opts = BatchOpts & { days?: number }

export async function pruneVariantVersions(now: Date = new Date(), opts: Opts = {}): Promise<number> {
  const client = clientOf(opts)
  const before = cutoff(now, opts.days ?? VARIANT_VERSION_RETENTION_DAYS)
  return inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from resume_variant_versions where id in (
        select v.id from resume_variant_versions v
        join resume_variants rv on rv.id = v.variant_id
        where v.created_at < ${before}${userScope(sql`v.user_id`, opts.userId)}
          and v.published_at is null
          and v.version <> rv.current_version
          and v.version < (
            select max(x.version) from resume_variant_versions x where x.variant_id = v.variant_id
          )
          and not exists (
            select 1 from applications a
            where a.resume_variant_id = v.variant_id and a.resume_variant_version = v.version
          )
        limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
}
