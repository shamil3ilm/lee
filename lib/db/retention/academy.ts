import { sql } from 'drizzle-orm'
import { affected, clientOf, cutoff, inBatches, userScope, type BatchOpts } from './batch'

/**
 * Playground history (v13 §10.1) is kept forever and NEVER deleted here.
 * To stay inside Neon Free's 0.5 GB, old rows are compacted in place:
 *   - attempts older than ACADEMY_ATTEMPT_DETAIL_DAYS keep every score
 *     (composite, each axis score, outcome, XP, rating move, versions, seed)
 *     but drop per-axis detail and the improvement text (they can be
 *     recomputed from the item, the seed and the submission);
 *   - plans older than ACADEMY_PLAN_DETAIL_DAYS keep what was planned and
 *     done, but drop the long reason text (the reason code stays).
 * Rating history rows are tiny and stay as they are. Idempotent: compacted
 * rows are marked and skipped.
 */

export const ACADEMY_ATTEMPT_DETAIL_DAYS = 180
export const ACADEMY_PLAN_DETAIL_DAYS = 60

const AXES = sql`('correctness','time','complexity','performance','quality','effectiveness')`

export async function compactAcademyAttempts(now: Date = new Date(), opts: BatchOpts = {}): Promise<number> {
  const client = clientOf(opts)
  const before = cutoff(now, ACADEMY_ATTEMPT_DETAIL_DAYS).toISOString()
  return inBatches(async (limit) => {
    const res = await client.execute(sql`
      update academy_attempts a set
        evaluation = (
          select jsonb_object_agg(e.k, case
            when e.k in ${AXES} then
              case when e.v->>'status' = 'scored'
                then jsonb_build_object('status', 'scored', 'score', e.v->'score', 'detail', null)
                else jsonb_build_object('status', 'n/a', 'reason', '')
              end
            when e.k = 'improvements' then '[]'::jsonb
            else e.v
          end)
          from jsonb_each(a.evaluation) as e(k, v)
        ),
        compacted_at = ${now.toISOString()}::timestamptz
      where a.id in (
        select id from academy_attempts
        where submitted_at < ${before}::timestamptz
          and compacted_at is null
          and jsonb_typeof(evaluation) = 'object'${userScope(sql`user_id`, opts.userId)}
        limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
}

export async function compactAcademyPlans(now: Date = new Date(), opts: BatchOpts = {}): Promise<number> {
  const client = clientOf(opts)
  const beforeDay = cutoff(now, ACADEMY_PLAN_DETAIL_DAYS).toISOString().slice(0, 10)
  return inBatches(async (limit) => {
    const res = await client.execute(sql`
      update academy_plans p set
        items = coalesce((
          select jsonb_agg(
            i.item
              || jsonb_build_object('title', left(coalesce(i.item->>'title', ''), 60))
              || jsonb_build_object('reasons', coalesce((
                select jsonb_agg(jsonb_build_object('code', r.reason->'code', 'text', ''))
                from (select reason from jsonb_array_elements(case when jsonb_typeof(i.item->'reasons') = 'array' then i.item->'reasons' else '[]'::jsonb end) as x(reason) limit 1) as r
              ), '[]'::jsonb))
            order by i.ord
          )
          from jsonb_array_elements(p.items) with ordinality as i(item, ord)
          where jsonb_typeof(i.item) = 'object'
        ), '[]'::jsonb),
        compacted_at = ${now.toISOString()}::timestamptz
      where (p.user_id, p.date) in (
        select user_id, date from academy_plans
        where date < ${beforeDay}::date
          and compacted_at is null
          and jsonb_typeof(items) = 'array'${userScope(sql`user_id`, opts.userId)}
        limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
}

/** Both compactions; the count is rows compacted (never rows deleted). */
export async function compactAcademyHistory(now: Date = new Date(), opts: BatchOpts = {}): Promise<number> {
  return (await compactAcademyAttempts(now, opts)) + (await compactAcademyPlans(now, opts))
}
