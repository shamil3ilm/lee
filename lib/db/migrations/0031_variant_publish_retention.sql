ALTER TABLE "resume_variant_versions" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "resume_variants" ADD COLUMN "portfolio_last_sha" text;--> statement-breakpoint
ALTER TABLE "resume_variants" ADD COLUMN "portfolio_last_hash" text;--> statement-breakpoint
ALTER TABLE "resume_variants" ADD COLUMN "portfolio_last_version" text;--> statement-breakpoint
ALTER TABLE "resume_variants" ADD COLUMN "portfolio_commit_url" text;--> statement-breakpoint
ALTER TABLE "resume_variants" ADD COLUMN "portfolio_published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "retention_settings" ADD COLUMN "variant_version_days" smallint;