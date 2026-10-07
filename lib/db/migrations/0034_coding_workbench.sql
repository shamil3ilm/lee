CREATE TABLE "academy_daily_problems" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"problem_slug" text NOT NULL,
	"solved_at" timestamp with time zone,
	CONSTRAINT "academy_daily_problems_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "academy_mock_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"problem_slugs" jsonb NOT NULL,
	"duration_min" smallint NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"score" smallint,
	"results" jsonb,
	CONSTRAINT "academy_mock_assessments_score_ck" CHECK ("academy_mock_assessments"."score" is null or "academy_mock_assessments"."score" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "academy_problem_progress" (
	"user_id" uuid NOT NULL,
	"problem_slug" text NOT NULL,
	"status" text DEFAULT 'attempted' NOT NULL,
	"submissions" integer DEFAULT 0 NOT NULL,
	"accepted" integer DEFAULT 0 NOT NULL,
	"best_runtime_ms" integer,
	"best_language" text,
	"hints_used" smallint DEFAULT 0 NOT NULL,
	"gave_up_at" timestamp with time zone,
	"first_solved_at" timestamp with time zone,
	"last_submitted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academy_problem_progress_user_id_problem_slug_pk" PRIMARY KEY("user_id","problem_slug"),
	CONSTRAINT "academy_problem_progress_status_ck" CHECK ("academy_problem_progress"."status" in ('attempted', 'solved'))
);
--> statement-breakpoint
CREATE TABLE "academy_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"problem_slug" text NOT NULL,
	"attempt_id" uuid,
	"mock_id" uuid,
	"language" text NOT NULL,
	"verdict" text NOT NULL,
	"passed" smallint NOT NULL,
	"total" smallint NOT NULL,
	"runtime_ms" integer,
	"memory_kb" integer,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academy_submissions_code_ck" CHECK (octet_length("academy_submissions"."code") <= 16384)
);
--> statement-breakpoint
ALTER TABLE "academy_daily_problems" ADD CONSTRAINT "academy_daily_problems_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_mock_assessments" ADD CONSTRAINT "academy_mock_assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_problem_progress" ADD CONSTRAINT "academy_problem_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_submissions" ADD CONSTRAINT "academy_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_submissions" ADD CONSTRAINT "academy_submissions_attempt_id_academy_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."academy_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "academy_mock_assessments_user_started_idx" ON "academy_mock_assessments" USING btree ("user_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "academy_submissions_user_problem_idx" ON "academy_submissions" USING btree ("user_id","problem_slug","created_at" DESC NULLS LAST);