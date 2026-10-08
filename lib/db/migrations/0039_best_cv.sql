CREATE TABLE "cv_tailorings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"jd_hash" text NOT NULL,
	"base_variant_id" uuid,
	"base_version" integer,
	"accepted" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outcome" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "best_cv" jsonb;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "best_cv_key" text;--> statement-breakpoint
ALTER TABLE "discoveries" ADD COLUMN "best_cv" jsonb;--> statement-breakpoint
ALTER TABLE "discoveries" ADD COLUMN "best_cv_key" text;--> statement-breakpoint
ALTER TABLE "cv_tailorings" ADD CONSTRAINT "cv_tailorings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_tailorings" ADD CONSTRAINT "cv_tailorings_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_tailorings" ADD CONSTRAINT "cv_tailorings_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_tailorings" ADD CONSTRAINT "cv_tailorings_base_variant_id_resume_variants_id_fk" FOREIGN KEY ("base_variant_id") REFERENCES "public"."resume_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cv_tailorings_user_app_idx" ON "cv_tailorings" USING btree ("user_id","application_id","created_at");--> statement-breakpoint
CREATE INDEX "cv_tailorings_document_idx" ON "cv_tailorings" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "cv_tailorings_variant_idx" ON "cv_tailorings" USING btree ("base_variant_id");