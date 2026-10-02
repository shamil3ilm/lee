ALTER TABLE "discoveries" ADD COLUMN "filter_reason" text;--> statement-breakpoint
ALTER TABLE "discoveries" ADD COLUMN "filter_override" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "discoveries" ADD COLUMN "relevance_key" text;--> statement-breakpoint
ALTER TABLE "discoveries" ADD COLUMN "regions" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "discoveries" ADD COLUMN "relevance_notes" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "discoveries" ADD COLUMN "rank_adjust" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "seniority_levels" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "remote_scope" text DEFAULT 'worldwide' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "search_prefs_saved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "discovery_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "links" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "linked_profile" jsonb;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "dismissed_role_suggestions" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "relevance_applied_key" text;--> statement-breakpoint
CREATE INDEX "discoveries_user_status_created_idx" ON "discoveries" USING btree ("user_id","status","created_at");