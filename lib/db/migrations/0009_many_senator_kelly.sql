ALTER TABLE "user_profile" ADD COLUMN "notify_discovery_email" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "notify_discovery_browser" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "notify_discovery_min_score" smallint DEFAULT 75 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "discovery_email_last_sent_at" timestamp with time zone;