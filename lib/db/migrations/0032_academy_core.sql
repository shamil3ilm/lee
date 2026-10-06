CREATE TABLE "academy_achievements" (
	"user_id" uuid NOT NULL,
	"achievement_id" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_id" uuid,
	CONSTRAINT "academy_achievements_user_id_achievement_id_pk" PRIMARY KEY("user_id","achievement_id")
);
--> statement-breakpoint
CREATE TABLE "academy_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"format" text NOT NULL,
	"mode" text DEFAULT 'practice' NOT NULL,
	"plan_date" date,
	"plan_item_id" text,
	"content_version" text NOT NULL,
	"engine_version" text NOT NULL,
	"seed" integer DEFAULT 0 NOT NULL,
	"difficulty" smallint NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"elapsed_sec" integer,
	"submission" jsonb,
	"evaluation" jsonb,
	"composite" smallint,
	"xp_awarded" smallint DEFAULT 0 NOT NULL,
	"rating_before" real,
	"rating_after" real,
	"compacted_at" timestamp with time zone,
	CONSTRAINT "academy_attempts_composite_ck" CHECK ("academy_attempts"."composite" is null or "academy_attempts"."composite" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "academy_plans" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"signature" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT 'generated' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"compacted_at" timestamp with time zone,
	CONSTRAINT "academy_plans_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "academy_rating_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"skill_id" text NOT NULL,
	"attempt_id" uuid,
	"kind" text NOT NULL,
	"rating" real NOT NULL,
	"deviation" real NOT NULL,
	"level" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academy_reviews" (
	"user_id" uuid NOT NULL,
	"card_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"ease" real DEFAULT 2.5 NOT NULL,
	"interval_days" smallint DEFAULT 0 NOT NULL,
	"repetitions" smallint DEFAULT 0 NOT NULL,
	"lapses" smallint DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academy_reviews_user_id_card_id_pk" PRIMARY KEY("user_id","card_id")
);
--> statement-breakpoint
CREATE TABLE "academy_skill_ratings" (
	"user_id" uuid NOT NULL,
	"skill_id" text NOT NULL,
	"rating" real NOT NULL,
	"deviation" real NOT NULL,
	"level" smallint DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_practiced_at" timestamp with time zone,
	"seed" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academy_skill_ratings_user_id_skill_id_pk" PRIMARY KEY("user_id","skill_id"),
	CONSTRAINT "academy_skill_ratings_level_ck" CHECK ("academy_skill_ratings"."level" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "academy_user_state" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"rank" text DEFAULT 'intern' NOT NULL,
	"streak_days" smallint DEFAULT 0 NOT NULL,
	"best_streak" smallint DEFAULT 0 NOT NULL,
	"last_active_date" date,
	"time_budget_min" smallint DEFAULT 20 NOT NULL,
	"mode" text DEFAULT 'balanced' NOT NULL,
	"reviews_done" integer DEFAULT 0 NOT NULL,
	"placement_started_at" timestamp with time zone,
	"placement_completed_at" timestamp with time zone,
	"placement_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"profile_signature" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academy_achievements" ADD CONSTRAINT "academy_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_achievements" ADD CONSTRAINT "academy_achievements_attempt_id_academy_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."academy_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_attempts" ADD CONSTRAINT "academy_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_plans" ADD CONSTRAINT "academy_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_rating_history" ADD CONSTRAINT "academy_rating_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_rating_history" ADD CONSTRAINT "academy_rating_history_attempt_id_academy_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."academy_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_reviews" ADD CONSTRAINT "academy_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_skill_ratings" ADD CONSTRAINT "academy_skill_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_user_state" ADD CONSTRAINT "academy_user_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "academy_attempts_user_started_idx" ON "academy_attempts" USING btree ("user_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "academy_attempts_user_skill_idx" ON "academy_attempts" USING btree ("user_id","skill_id","submitted_at");--> statement-breakpoint
CREATE INDEX "academy_rating_history_user_skill_idx" ON "academy_rating_history" USING btree ("user_id","skill_id","created_at");--> statement-breakpoint
CREATE INDEX "academy_reviews_user_due_idx" ON "academy_reviews" USING btree ("user_id","due_at");