CREATE TABLE "ai_quota_snapshots" (
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"limit_requests" integer,
	"remaining_requests" integer,
	"reset_requests_at" timestamp with time zone,
	"limit_tokens" integer,
	"remaining_tokens" integer,
	"reset_tokens_at" timestamp with time zone,
	"retry_after_at" timestamp with time zone,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_quota_snapshots_user_id_provider_model_pk" PRIMARY KEY("user_id","provider","model")
);
--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD COLUMN "http_status" smallint;--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD COLUMN "audio_seconds" real;--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD COLUMN "input_bytes" integer;--> statement-breakpoint
ALTER TABLE "ai_quota_snapshots" ADD CONSTRAINT "ai_quota_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;