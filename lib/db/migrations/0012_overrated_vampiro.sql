ALTER TABLE "ai_call_logs" ADD COLUMN "prompt_hash" text;--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD COLUMN "prompt_version" text;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "scored_by_call_id" uuid;--> statement-breakpoint
ALTER TABLE "discoveries" ADD COLUMN "scored_by_call_id" uuid;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD CONSTRAINT "company_discoveries_scored_by_call_id_ai_call_logs_id_fk" FOREIGN KEY ("scored_by_call_id") REFERENCES "public"."ai_call_logs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discoveries" ADD CONSTRAINT "discoveries_scored_by_call_id_ai_call_logs_id_fk" FOREIGN KEY ("scored_by_call_id") REFERENCES "public"."ai_call_logs"("id") ON DELETE set null ON UPDATE no action;