CREATE TABLE "job_comparison" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"current_job" jsonb,
	"assumptions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"narratives" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"factor_shortlist" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discoveries" ADD COLUMN "pasted_jd" text;--> statement-breakpoint
ALTER TABLE "job_comparison" ADD CONSTRAINT "job_comparison_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;