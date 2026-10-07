CREATE TABLE "application_preps" (
	"application_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prepared_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"followup_due_at" timestamp with time zone,
	"followup_status" text,
	"followup_closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"discovery_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"role_family" text,
	"region" text,
	"company_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shortlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" text NOT NULL,
	"discovery_id" uuid NOT NULL,
	"rank" smallint NOT NULL,
	"score" smallint NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"variant_id" uuid,
	"state" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "shortlist_size" smallint DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "followup_days" smallint DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "shortlist_in_emails" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "application_preps" ADD CONSTRAINT "application_preps_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_preps" ADD CONSTRAINT "application_preps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_feedback" ADD CONSTRAINT "discovery_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_entries" ADD CONSTRAINT "shortlist_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_entries" ADD CONSTRAINT "shortlist_entries_discovery_id_discoveries_id_fk" FOREIGN KEY ("discovery_id") REFERENCES "public"."discoveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_entries" ADD CONSTRAINT "shortlist_entries_variant_id_resume_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."resume_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_preps_user_followup_idx" ON "application_preps" USING btree ("user_id","followup_status","followup_due_at");--> statement-breakpoint
CREATE INDEX "application_preps_user_prepared_idx" ON "application_preps" USING btree ("user_id","prepared_at");--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_feedback_user_discovery_uq" ON "discovery_feedback" USING btree ("user_id","discovery_id");--> statement-breakpoint
CREATE INDEX "discovery_feedback_user_created_idx" ON "discovery_feedback" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shortlist_entries_user_day_discovery_uq" ON "shortlist_entries" USING btree ("user_id","day","discovery_id");--> statement-breakpoint
CREATE INDEX "shortlist_entries_user_day_rank_idx" ON "shortlist_entries" USING btree ("user_id","day","rank");--> statement-breakpoint
CREATE INDEX "shortlist_entries_discovery_idx" ON "shortlist_entries" USING btree ("discovery_id");--> statement-breakpoint
CREATE INDEX "shortlist_entries_variant_idx" ON "shortlist_entries" USING btree ("variant_id") WHERE "shortlist_entries"."variant_id" is not null;