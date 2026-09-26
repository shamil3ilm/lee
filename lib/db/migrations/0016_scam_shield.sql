CREATE TABLE "job_risk_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"score" smallint NOT NULL,
	"level" text NOT NULL,
	"signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rules_version" text NOT NULL,
	"net" jsonb,
	"allow_listed" boolean DEFAULT false NOT NULL,
	"user_verdict" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scam_allow_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scam_domain_cache" (
	"domain" text PRIMARY KEY NOT NULL,
	"registered_at" timestamp with time zone,
	"age_status" text,
	"age_checked_at" timestamp with time zone,
	"has_mx" boolean,
	"mx_status" text,
	"mx_checked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "scam_net_checks" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job_risk_assessments" ADD CONSTRAINT "job_risk_assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scam_allow_list" ADD CONSTRAINT "scam_allow_list_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_risk_assessments_user_target_uq" ON "job_risk_assessments" USING btree ("user_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "job_risk_assessments_user_level_idx" ON "job_risk_assessments" USING btree ("user_id","target_type","level");--> statement-breakpoint
CREATE UNIQUE INDEX "scam_allow_list_user_kind_value_uq" ON "scam_allow_list" USING btree ("user_id","kind","value");