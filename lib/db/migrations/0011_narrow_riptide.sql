ALTER TABLE "ai_call_logs" ADD COLUMN "document_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD COLUMN "user_rating" smallint;--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD COLUMN "user_action" text;--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD COLUMN "signal_check_passed" boolean;--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD COLUMN "signal_check_code" text;--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD CONSTRAINT "ai_call_logs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;