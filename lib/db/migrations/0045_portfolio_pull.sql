ALTER TABLE "portfolio_publish" ADD COLUMN "pulled_sha" text;--> statement-breakpoint
ALTER TABLE "portfolio_publish" ADD COLUMN "pulled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "portfolio_publish" ADD COLUMN "pull_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "portfolio_publish" ADD COLUMN "pull_source" text;--> statement-breakpoint
ALTER TABLE "portfolio_publish" ADD COLUMN "pull_error" text;--> statement-breakpoint
ALTER TABLE "portfolio_publish" ADD COLUMN "last_pull_diff" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "portfolio_publish" ADD COLUMN "orphans" jsonb DEFAULT '[]'::jsonb NOT NULL;