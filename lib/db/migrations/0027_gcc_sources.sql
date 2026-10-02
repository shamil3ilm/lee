CREATE TABLE "email_alert_messages" (
	"user_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"site" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"jobs_found" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_alert_messages_user_id_message_id_pk" PRIMARY KEY("user_id","message_id")
);
--> statement-breakpoint
ALTER TABLE "email_alert_messages" ADD CONSTRAINT "email_alert_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_alert_messages_user_site_idx" ON "email_alert_messages" USING btree ("user_id","site","received_at");