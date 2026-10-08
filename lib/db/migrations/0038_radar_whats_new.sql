CREATE TABLE "radar_new_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_key" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"openness" text,
	"grp" text,
	"url" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"keys" text[] DEFAULT '{}' NOT NULL,
	"sources" text[] DEFAULT '{}' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"variant_count" integer DEFAULT 0 NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "radar_new_entries_category_ck" CHECK ("radar_new_entries"."category" in ('model', 'tool', 'release', 'paper', 'news')),
	CONSTRAINT "radar_new_entries_excerpt_ck" CHECK (char_length("radar_new_entries"."excerpt") <= 500),
	CONSTRAINT "radar_new_entries_metrics_ck" CHECK (octet_length("radar_new_entries"."metrics"::text) <= 1024),
	CONSTRAINT "radar_new_entries_tags_ck" CHECK (cardinality("radar_new_entries"."tags") <= 16)
);
--> statement-breakpoint
CREATE TABLE "radar_new_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"kind" text NOT NULL,
	"role" text DEFAULT 'primary' NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "radar_new_items_excerpt_ck" CHECK (char_length("radar_new_items"."excerpt") <= 500),
	CONSTRAINT "radar_new_items_metrics_ck" CHECK (octet_length("radar_new_items"."metrics"::text) <= 1024)
);
--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "radar_release_projects" text[];--> statement-breakpoint
ALTER TABLE "radar_new_items" ADD CONSTRAINT "radar_new_items_entry_id_radar_new_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."radar_new_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "radar_new_entries_entity_uq" ON "radar_new_entries" USING btree ("entity_key");--> statement-breakpoint
CREATE INDEX "radar_new_entries_first_seen_idx" ON "radar_new_entries" USING btree ("first_seen_at");--> statement-breakpoint
CREATE INDEX "radar_new_entries_keys_idx" ON "radar_new_entries" USING gin ("keys");--> statement-breakpoint
CREATE UNIQUE INDEX "radar_new_items_source_external_uq" ON "radar_new_items" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "radar_new_items_entry_idx" ON "radar_new_items" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "radar_new_items_source_fetched_idx" ON "radar_new_items" USING btree ("source","fetched_at");