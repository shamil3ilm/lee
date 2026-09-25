CREATE TABLE "cv_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"document_id" uuid,
	"application_id" uuid,
	"source_kind" text NOT NULL,
	"source_label" text DEFAULT '' NOT NULL,
	"overall" smallint NOT NULL,
	"grade" text NOT NULL,
	"mode" text DEFAULT 'general' NOT NULL,
	"scores" jsonb NOT NULL,
	"dimensions" jsonb NOT NULL,
	"findings" jsonb NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scorer_version" text NOT NULL,
	"ai_call_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cv_scores" ADD CONSTRAINT "cv_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_scores" ADD CONSTRAINT "cv_scores_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_scores" ADD CONSTRAINT "cv_scores_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_scores" ADD CONSTRAINT "cv_scores_ai_call_id_ai_call_logs_id_fk" FOREIGN KEY ("ai_call_id") REFERENCES "public"."ai_call_logs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cv_scores_user_app_created_idx" ON "cv_scores" USING btree ("user_id","application_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cv_scores_user_doc_created_idx" ON "cv_scores" USING btree ("user_id","document_id","created_at" DESC NULLS LAST);