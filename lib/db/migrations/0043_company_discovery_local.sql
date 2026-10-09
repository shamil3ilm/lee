ALTER TABLE "company_discoveries" ADD COLUMN "region_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "industry" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "size_band" text;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "stage" text;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "source_tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "domain" text;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "careers_url" text;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "ats_kind" text;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "ats_slug" text;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "fit_score" smallint;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "fit_detail" jsonb;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "enrich_status" text;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "enriched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "watch" text;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "watch_source_id" uuid;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "careers_hash" text;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "careers_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "careers_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "dismiss_reason" text;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "application_id" uuid;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD CONSTRAINT "company_discoveries_watch_source_id_sources_id_fk" FOREIGN KEY ("watch_source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD CONSTRAINT "company_discoveries_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_discoveries_user_domain_idx" ON "company_discoveries" USING btree ("user_id","domain") WHERE "company_discoveries"."domain" is not null;--> statement-breakpoint
CREATE INDEX "company_discoveries_user_status_fit_idx" ON "company_discoveries" USING btree ("user_id","status","fit_score");--> statement-breakpoint
CREATE INDEX "company_discoveries_user_enrich_idx" ON "company_discoveries" USING btree ("user_id","enrich_status") WHERE "company_discoveries"."enrich_status" = 'pending';--> statement-breakpoint
CREATE INDEX "company_discoveries_watch_source_idx" ON "company_discoveries" USING btree ("watch_source_id") WHERE "company_discoveries"."watch_source_id" is not null;--> statement-breakpoint
CREATE INDEX "company_discoveries_application_idx" ON "company_discoveries" USING btree ("application_id") WHERE "company_discoveries"."application_id" is not null;