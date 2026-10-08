ALTER TABLE "discoveries" ADD COLUMN "fit_score" smallint;--> statement-breakpoint
ALTER TABLE "discoveries" ADD COLUMN "fit_detail" jsonb;--> statement-breakpoint
ALTER TABLE "discoveries" ADD COLUMN "fit_key" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "match_applied_key" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "learned_titles" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "discoveries_user_status_fit_idx" ON "discoveries" USING btree ("user_id","status","fit_score");