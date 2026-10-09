ALTER TABLE "user_profile" ALTER COLUMN "followup_days" SET DEFAULT 5;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "followup_second_days" smallint DEFAULT 10 NOT NULL;--> statement-breakpoint
-- The first follow-up is now counted in business days: the old default (7 calendar days) becomes 5.
UPDATE "user_profile" SET "followup_days" = 5 WHERE "followup_days" = 7;
