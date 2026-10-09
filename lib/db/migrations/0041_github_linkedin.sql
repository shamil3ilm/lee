CREATE TABLE "action_throttle" (
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "action_throttle_user_id_action_pk" PRIMARY KEY("user_id","action")
);
--> statement-breakpoint
CREATE TABLE "github_repo_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"html_url" text NOT NULL,
	"description" text,
	"topics" text[] DEFAULT '{}' NOT NULL,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stars" integer DEFAULT 0 NOT NULL,
	"pushed_at" timestamp with time zone,
	"last_commit_at" timestamp with time zone,
	"user_commits" integer DEFAULT 0 NOT NULL,
	"user_prs" integer DEFAULT 0 NOT NULL,
	"linked_project_id" text,
	"follow_deps" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_connections" (
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"account_id" text NOT NULL,
	"login" text,
	"display_name" text,
	"email" text,
	"avatar_url" text,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"tokens" text NOT NULL,
	"access_expires_at" timestamp with time zone,
	"refresh_expires_at" timestamp with time zone,
	"installation_id" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_connections_user_id_provider_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "linkedin_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"company_key" text DEFAULT '' NOT NULL,
	"position" text DEFAULT '' NOT NULL,
	"connected_on" date,
	"email" text
);
--> statement-breakpoint
CREATE TABLE "linkedin_imports" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"positions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linkedin_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_kind" text NOT NULL,
	"text" text NOT NULL,
	"post_urn" text,
	"url" text,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"secret" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "action_throttle" ADD CONSTRAINT "action_throttle_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_repo_stats" ADD CONSTRAINT "github_repo_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_connections" ADD CONSTRAINT "linkedin_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_imports" ADD CONSTRAINT "linkedin_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_posts" ADD CONSTRAINT "linkedin_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "github_repo_stats_user_repo_uq" ON "github_repo_stats" USING btree ("user_id","full_name");--> statement-breakpoint
CREATE UNIQUE INDEX "linkedin_connections_user_name_company_uq" ON "linkedin_connections" USING btree ("user_id","name","company_key");--> statement-breakpoint
CREATE INDEX "linkedin_connections_user_company_idx" ON "linkedin_connections" USING btree ("user_id","company_key");--> statement-breakpoint
CREATE INDEX "linkedin_posts_user_posted_idx" ON "linkedin_posts" USING btree ("user_id","posted_at");--> statement-breakpoint
CREATE INDEX "oauth_states_user_idx" ON "oauth_states" USING btree ("user_id","created_at");