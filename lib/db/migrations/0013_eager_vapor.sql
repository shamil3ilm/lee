CREATE TABLE "lab_provider_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"encrypted_key" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_last4" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_run_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"model_provider" text NOT NULL,
	"model_id" text NOT NULL,
	"blind_label" text,
	"output" text,
	"output_json" jsonb,
	"metrics" jsonb,
	"schema_valid" boolean,
	"error" text,
	"vote" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "lab_provider_keys" ADD CONSTRAINT "lab_provider_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_run_results" ADD CONSTRAINT "lab_run_results_run_id_lab_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."lab_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_runs" ADD CONSTRAINT "lab_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lab_provider_keys_user_provider_uq" ON "lab_provider_keys" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "lab_run_results_run_idx" ON "lab_run_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "lab_runs_user_created_idx" ON "lab_runs" USING btree ("user_id","created_at");