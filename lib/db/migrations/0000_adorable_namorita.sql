CREATE TABLE "accounts" (
	"userId" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_call_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"latency_ms" integer,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_contacts" (
	"application_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_contacts_application_id_contact_id_role_pk" PRIMARY KEY("application_id","contact_id","role")
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"status" text DEFAULT 'saved' NOT NULL,
	"source" text,
	"referred_by_contact_id" uuid,
	"interest_level" smallint,
	"applied_at" timestamp with time zone,
	"next_action_at" timestamp with time zone,
	"priority" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"headquarters_city" text,
	"headquarters_country" text,
	"office_locations" text[] DEFAULT '{}' NOT NULL,
	"remote_friendly" boolean,
	"size" text,
	"stage" text,
	"website" text,
	"tech_stack" text[] DEFAULT '{}' NOT NULL,
	"is_watched" boolean DEFAULT false NOT NULL,
	"stance" text,
	"interest_level" smallint,
	"notes_md" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_discoveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"source_company_id" text NOT NULL,
	"raw" jsonb NOT NULL,
	"normalized" jsonb NOT NULL,
	"match_score" smallint,
	"match_reasoning" jsonb,
	"status" text DEFAULT 'new' NOT NULL,
	"added_company_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"linkedin_url" text,
	"role" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discoveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"source_job_id" text NOT NULL,
	"raw" jsonb NOT NULL,
	"normalized" jsonb NOT NULL,
	"match_score" smallint,
	"benefits_score" smallint,
	"match_reasoning" jsonb,
	"status" text DEFAULT 'new' NOT NULL,
	"saved_application_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"scheduled_at" timestamp with time zone,
	"duration_minutes" integer,
	"location" text,
	"meeting_url" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"outcome" text,
	"prep_notes_md" text,
	"debrief_notes_md" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid,
	"title" text NOT NULL,
	"source_url" text NOT NULL,
	"location" text,
	"remote_type" text,
	"employment_type" text,
	"salary_min" integer,
	"salary_max" integer,
	"salary_currency" text,
	"description_md" text,
	"parsed_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"benefits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_polled_at" timestamp with time zone,
	"last_error" text,
	"error_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"headline" text,
	"summary_md" text,
	"career_narrative_md" text,
	"skills" text[] DEFAULT '{}' NOT NULL,
	"industries" text[] DEFAULT '{}' NOT NULL,
	"role_types" text[] DEFAULT '{}' NOT NULL,
	"seniority" text,
	"years_experience" integer,
	"employment_types" text[] DEFAULT '{}' NOT NULL,
	"remote_pref" text DEFAULT 'any' NOT NULL,
	"location_prefs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accept_relocation" boolean DEFAULT false NOT NULL,
	"willing_to_relocate_to" text[] DEFAULT '{}' NOT NULL,
	"comp_floor_annual" integer,
	"comp_currency" text,
	"stack_weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"company_size_weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"benefit_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"must_haves" text[] DEFAULT '{}' NOT NULL,
	"dealbreakers" text[] DEFAULT '{}' NOT NULL,
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profile_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" timestamp with time zone,
	"image" text,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificationTokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verificationTokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD CONSTRAINT "ai_call_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_contacts" ADD CONSTRAINT "application_contacts_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_contacts" ADD CONSTRAINT "application_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_referred_by_contact_id_contacts_id_fk" FOREIGN KEY ("referred_by_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD CONSTRAINT "company_discoveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD CONSTRAINT "company_discoveries_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD CONSTRAINT "company_discoveries_added_company_id_companies_id_fk" FOREIGN KEY ("added_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discoveries" ADD CONSTRAINT "discoveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discoveries" ADD CONSTRAINT "discoveries_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discoveries" ADD CONSTRAINT "discoveries_saved_application_id_applications_id_fk" FOREIGN KEY ("saved_application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_stages" ADD CONSTRAINT "interview_stages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_stages" ADD CONSTRAINT "interview_stages_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_app_created_idx" ON "activities" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "applications_user_status_idx" ON "applications" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "applications_user_next_action_idx" ON "applications" USING btree ("user_id","next_action_at");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_user_domain_uq" ON "companies" USING btree ("user_id","domain");--> statement-breakpoint
CREATE INDEX "companies_user_watched_idx" ON "companies" USING btree ("user_id","is_watched");--> statement-breakpoint
CREATE UNIQUE INDEX "company_discoveries_source_company_uq" ON "company_discoveries" USING btree ("source_id","source_company_id");--> statement-breakpoint
CREATE INDEX "company_discoveries_user_status_score_idx" ON "company_discoveries" USING btree ("user_id","status","match_score");--> statement-breakpoint
CREATE INDEX "contacts_user_company_idx" ON "contacts" USING btree ("user_id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discoveries_source_job_uq" ON "discoveries" USING btree ("source_id","source_job_id");--> statement-breakpoint
CREATE INDEX "discoveries_user_status_score_idx" ON "discoveries" USING btree ("user_id","status","match_score");--> statement-breakpoint
CREATE INDEX "interview_stages_app_scheduled_idx" ON "interview_stages" USING btree ("application_id","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_user_source_url_uq" ON "jobs" USING btree ("user_id","source_url");--> statement-breakpoint
CREATE INDEX "jobs_user_company_idx" ON "jobs" USING btree ("user_id","company_id");--> statement-breakpoint
CREATE INDEX "sources_user_enabled_idx" ON "sources" USING btree ("user_id","enabled");