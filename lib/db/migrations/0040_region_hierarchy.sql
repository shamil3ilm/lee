ALTER TABLE "discoveries" ADD COLUMN "region_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "target_regions" text[];--> statement-breakpoint
CREATE INDEX "discoveries_region_ids_gin" ON "discoveries" USING gin ("region_ids");--> statement-breakpoint
-- Coarse start for existing rows: the old filter tags (ae, gcc, in, remote) are valid
-- region node ids with their ancestors, so the Region filter keeps working until the
-- relevance backfill (RELEVANCE_RULES_VERSION r5) re-tags each row with the deepest places.
UPDATE "discoveries" SET "region_ids" = "regions" WHERE cardinality("regions") > 0;
