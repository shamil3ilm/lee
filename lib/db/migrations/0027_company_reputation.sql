CREATE TABLE "company_reputation" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_status" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"facts" jsonb,
	"user_ratings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" jsonb,
	"places_place_id" text,
	"fetched_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reputation_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"places_enabled" boolean DEFAULT false NOT NULL,
	"places_monthly_cap" integer DEFAULT 100 NOT NULL,
	"places_month" text,
	"places_calls" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_reputation" ADD CONSTRAINT "company_reputation_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_reputation" ADD CONSTRAINT "company_reputation_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_settings" ADD CONSTRAINT "reputation_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_reputation_user_idx" ON "company_reputation" USING btree ("user_id");