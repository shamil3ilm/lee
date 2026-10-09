ALTER TABLE "company_discoveries" ADD COLUMN "growth_score" smallint;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "growth_confidence" text;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "growth_detail" jsonb;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "growth_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "role_snapshots" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "company_discoveries" ADD COLUMN "hidden_gem" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "discoveries" ADD COLUMN "company_growth" smallint;--> statement-breakpoint
ALTER TABLE "discoveries" ADD COLUMN "company_growth_confidence" text;--> statement-breakpoint
CREATE INDEX "company_discoveries_user_status_growth_idx" ON "company_discoveries" USING btree ("user_id","status","growth_score");