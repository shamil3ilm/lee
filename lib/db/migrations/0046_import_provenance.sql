CREATE TABLE "profile_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"mode" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"intentions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "linkedin_connections" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "profile_import_batches" ADD CONSTRAINT "profile_import_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_import_batches_user_imported_idx" ON "profile_import_batches" USING btree ("user_id","imported_at" DESC NULLS LAST);