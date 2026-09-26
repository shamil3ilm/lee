CREATE TABLE "web_vitals_daily" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"route" text NOT NULL,
	"metric" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"sum" double precision DEFAULT 0 NOT NULL,
	"histogram" integer[] NOT NULL,
	"dims" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "web_vitals_daily_user_id_day_route_metric_pk" PRIMARY KEY("user_id","day","route","metric")
);
--> statement-breakpoint
ALTER TABLE "web_vitals_daily" ADD CONSTRAINT "web_vitals_daily_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "web_vitals_daily_day_idx" ON "web_vitals_daily" USING btree ("day");