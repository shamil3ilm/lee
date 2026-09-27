CREATE TABLE "system_event_counts" (
	"day" date PRIMARY KEY NOT NULL,
	"n" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"level" text NOT NULL,
	"category" text NOT NULL,
	"event" text NOT NULL,
	"message" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"job_id" uuid,
	"source_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "queue_jobs" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "queue_jobs" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "queue_jobs" ADD COLUMN "result" jsonb;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "last_result" jsonb;--> statement-breakpoint
ALTER TABLE "system_events" ADD CONSTRAINT "system_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "system_events_user_created_idx" ON "system_events" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "system_events_category_created_idx" ON "system_events" USING btree ("category","created_at" DESC NULLS LAST);