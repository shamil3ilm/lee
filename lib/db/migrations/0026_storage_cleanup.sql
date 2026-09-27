CREATE TABLE "retention_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"stale_discovery_days" smallint,
	"dismissed_discovery_days" smallint,
	"ai_call_log_days" smallint,
	"cv_score_days" smallint,
	"lab_run_days" smallint,
	"web_vitals_days" smallint,
	"last_run_trigger" text,
	"last_run_at" timestamp with time zone,
	"last_run_result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retention_settings" ADD CONSTRAINT "retention_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_discoveries_added_company_idx" ON "company_discoveries" USING btree ("added_company_id") WHERE "company_discoveries"."added_company_id" is not null;--> statement-breakpoint
CREATE INDEX "discoveries_saved_application_idx" ON "discoveries" USING btree ("saved_application_id") WHERE "discoveries"."saved_application_id" is not null;--> statement-breakpoint
CREATE INDEX "processed_gmail_threads_matched_application_idx" ON "processed_gmail_threads" USING btree ("matched_application_id") WHERE "processed_gmail_threads"."matched_application_id" is not null;--> statement-breakpoint
CREATE INDEX "todos_stage_idx" ON "todos" USING btree ("stage_id") WHERE "todos"."stage_id" is not null;--> statement-breakpoint
CREATE INDEX "todos_contact_idx" ON "todos" USING btree ("contact_id") WHERE "todos"."contact_id" is not null;--> statement-breakpoint
CREATE INDEX "todos_company_idx" ON "todos" USING btree ("company_id") WHERE "todos"."company_id" is not null;--> statement-breakpoint
CREATE INDEX "usage_alerts_todo_idx" ON "usage_alerts" USING btree ("todo_id") WHERE "usage_alerts"."todo_id" is not null;