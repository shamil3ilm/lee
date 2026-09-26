CREATE TABLE "document_pdf_cache" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"cache_key" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_assets" ADD COLUMN "sha256" text;--> statement-breakpoint
ALTER TABLE "document_pdf_cache" ADD CONSTRAINT "document_pdf_cache_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_pdf_cache" ADD CONSTRAINT "document_pdf_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_user_kind_created_idx" ON "activities" USING btree ("user_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "ai_call_logs_user_created_idx" ON "ai_call_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_call_logs_document_idx" ON "ai_call_logs" USING btree ("document_id") WHERE "ai_call_logs"."document_id" is not null;--> statement-breakpoint
CREATE INDEX "company_discoveries_scored_by_call_idx" ON "company_discoveries" USING btree ("scored_by_call_id") WHERE "company_discoveries"."scored_by_call_id" is not null;--> statement-breakpoint
CREATE INDEX "cv_scores_ai_call_idx" ON "cv_scores" USING btree ("ai_call_id") WHERE "cv_scores"."ai_call_id" is not null;--> statement-breakpoint
CREATE INDEX "discoveries_scored_by_call_idx" ON "discoveries" USING btree ("scored_by_call_id") WHERE "discoveries"."scored_by_call_id" is not null;--> statement-breakpoint
CREATE INDEX "interview_stages_user_status_scheduled_idx" ON "interview_stages" USING btree ("user_id","status","scheduled_at");