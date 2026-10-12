ALTER TABLE "queue_jobs" ADD COLUMN IF NOT EXISTS "coalesce_key" text;--> statement-breakpoint
-- Hand-written (incident 2026-10-12: a poll backlog starved new sources and a
-- stale poll blocked the daily chain). Backfill the coalesce key of every
-- pending job exactly as lib/queue/coalesce.ts computes it, then keep only
-- the newest pending job per (type, coalesce_key): the older ones become
-- `superseded` (terminal, never ran). The unique index below needs this.
UPDATE "queue_jobs" SET "coalesce_key" = CASE
    WHEN "type" = 'discovery-source:user+source' THEN
      CASE WHEN "user_id" IS NOT NULL AND jsonb_typeof("payload"->'sourceId') = 'string' AND "payload"->>'sourceId' <> ''
        THEN "user_id"::text || ':' || ("payload"->>'sourceId') END
    WHEN "type" = 'radar-source:user+source' THEN
      CASE WHEN "user_id" IS NOT NULL AND jsonb_typeof("payload"->'source') = 'string' AND "payload"->>'source' <> ''
        THEN "user_id"::text || ':' || ("payload"->>'source') END
    WHEN "type" = 'company-reputation:user+company' THEN
      CASE WHEN "user_id" IS NOT NULL AND jsonb_typeof("payload"->'companyId') = 'string' AND "payload"->>'companyId' <> ''
        THEN "user_id"::text || ':' || ("payload"->>'companyId') END
    WHEN "type" = 'radar-new:source' THEN
      CASE WHEN jsonb_typeof("payload"->'source') = 'string' AND "payload"->>'source' <> '' THEN "payload"->>'source' END
    WHEN "type" IN ('reminders:all', 'usage-snapshot:all') THEN 'all'
    WHEN "type" IN (
      'followups:user', 'gmail-sync:user', 'digest:user', 'discovery-email:user', 'scam-reassess:user',
      'shortlist:user', 'discovery-relevance:user', 'discovery-match:user', 'discovery-benefits:user',
      'portfolio-pull:user', 'company-discovery:user', 'company-growth:user', 'company-boards:user'
    ) THEN "user_id"::text
  END
WHERE "status" IN ('queued', 'failed') AND "coalesce_key" IS NULL;--> statement-breakpoint
UPDATE "queue_jobs" j SET
    "status" = 'superseded',
    "finished_at" = now(),
    "updated_at" = now(),
    "locked_by" = NULL,
    "locked_until" = NULL,
    "result" = coalesce(j."result", '{}'::jsonb) || '{"superseded": true, "by": "0051_coalesce_source_polls"}'::jsonb
FROM (
  SELECT "id", row_number() OVER (
      PARTITION BY "type", "coalesce_key"
      ORDER BY "created_at" DESC, "run_after" DESC, "id" DESC
    ) AS rn
  FROM "queue_jobs"
  WHERE "status" IN ('queued', 'failed') AND "coalesce_key" IS NOT NULL
) older
WHERE j."id" = older."id" AND older.rn > 1;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "queue_jobs_pending_coalesce_uq" ON "queue_jobs" USING btree ("type","coalesce_key") WHERE "queue_jobs"."status" in ('queued', 'failed') and "queue_jobs"."coalesce_key" is not null;
