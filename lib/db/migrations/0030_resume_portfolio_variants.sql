CREATE TABLE "portfolio_publish" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"repo" text DEFAULT '' NOT NULL,
	"branch" text DEFAULT 'main' NOT NULL,
	"path" text DEFAULT 'profile.json' NOT NULL,
	"last_sha" text,
	"last_hash" text,
	"last_version" text,
	"last_commit_sha" text,
	"last_commit_url" text,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_variant_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"recipe" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"region" text NOT NULL,
	"role_family" text,
	"current_version" integer DEFAULT 1 NOT NULL,
	"publish_to_portfolio" boolean DEFAULT false NOT NULL,
	"portfolio_slug" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "resume_variant_id" uuid;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "resume_variant_version" integer;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "resume" jsonb;--> statement-breakpoint
ALTER TABLE "portfolio_publish" ADD CONSTRAINT "portfolio_publish_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_variant_versions" ADD CONSTRAINT "resume_variant_versions_variant_id_resume_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."resume_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_variant_versions" ADD CONSTRAINT "resume_variant_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_variants" ADD CONSTRAINT "resume_variants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resume_variant_versions_variant_version_uq" ON "resume_variant_versions" USING btree ("variant_id","version");--> statement-breakpoint
CREATE INDEX "resume_variants_user_idx" ON "resume_variants" USING btree ("user_id","archived_at");--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_resume_variant_id_resume_variants_id_fk" FOREIGN KEY ("resume_variant_id") REFERENCES "public"."resume_variants"("id") ON DELETE set null ON UPDATE no action;