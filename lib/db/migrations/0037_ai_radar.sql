CREATE TABLE "radar_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"sections" jsonb NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"timeline" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"module" jsonb,
	"prompt_version" text NOT NULL,
	"prompt_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "radar_briefs_entry_id_unique" UNIQUE("entry_id"),
	CONSTRAINT "radar_briefs_sections_ck" CHECK (octet_length("radar_briefs"."sections"::text) <= 16384)
);
--> statement-breakpoint
CREATE TABLE "radar_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"keys" text[] DEFAULT '{}' NOT NULL,
	"sources" text[] DEFAULT '{}' NOT NULL,
	"matched_terms" text[] DEFAULT '{}' NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"saved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "radar_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"matched_terms" text[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "radar_items_excerpt_ck" CHECK (char_length("radar_items"."excerpt") <= 500),
	CONSTRAINT "radar_items_metrics_ck" CHECK (octet_length("radar_items"."metrics"::text) <= 1024)
);
--> statement-breakpoint
CREATE TABLE "radar_watch_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"term" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"kind" text DEFAULT 'term' NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "radar_watch_terms_term_ck" CHECK (char_length("radar_watch_terms"."term") between 2 and 80)
);
--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "radar_notify" text DEFAULT 'weekly' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "radar_sources_off" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "radar_briefs" ADD CONSTRAINT "radar_briefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radar_briefs" ADD CONSTRAINT "radar_briefs_entry_id_radar_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."radar_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radar_entries" ADD CONSTRAINT "radar_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radar_items" ADD CONSTRAINT "radar_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radar_items" ADD CONSTRAINT "radar_items_entry_id_radar_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."radar_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radar_watch_terms" ADD CONSTRAINT "radar_watch_terms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "radar_briefs_user_idx" ON "radar_briefs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "radar_entries_user_last_seen_idx" ON "radar_entries" USING btree ("user_id","last_seen_at");--> statement-breakpoint
CREATE INDEX "radar_entries_keys_idx" ON "radar_entries" USING gin ("keys");--> statement-breakpoint
CREATE UNIQUE INDEX "radar_items_user_source_external_uq" ON "radar_items" USING btree ("user_id","source","external_id");--> statement-breakpoint
CREATE INDEX "radar_items_entry_idx" ON "radar_items" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "radar_items_user_fetched_idx" ON "radar_items" USING btree ("user_id","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "radar_watch_terms_user_term_uq" ON "radar_watch_terms" USING btree ("user_id",lower("term"));