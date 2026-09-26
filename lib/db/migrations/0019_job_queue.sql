CREATE TABLE "queue_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"priority" smallint DEFAULT 100 NOT NULL,
	"wait_for_type" text,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"locked_until" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "queue_user_state" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"last_visit_drain_at" timestamp with time zone,
	"last_manual_drain_at" timestamp with time zone,
	"last_drain_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "queue_jobs" ADD CONSTRAINT "queue_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_user_state" ADD CONSTRAINT "queue_user_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "queue_jobs_status_run_after_idx" ON "queue_jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "queue_jobs_user_status_idx" ON "queue_jobs" USING btree ("user_id","status","run_after");--> statement-breakpoint
CREATE UNIQUE INDEX "queue_jobs_type_key_uq" ON "queue_jobs" USING btree ("type","idempotency_key");