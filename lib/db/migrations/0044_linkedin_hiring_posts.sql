CREATE TABLE "capture_keys" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rotated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linkedin_post_messages" (
	"user_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"kind" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"posts_found" integer DEFAULT 0 NOT NULL,
	"hiring_found" integer DEFAULT 0 NOT NULL,
	"parse_failed" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "linkedin_post_messages_user_id_message_id_pk" PRIMARY KEY("user_id","message_id")
);
--> statement-breakpoint
CREATE TABLE "post_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "capture_keys" ADD CONSTRAINT "capture_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_post_messages" ADD CONSTRAINT "linkedin_post_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_captures" ADD CONSTRAINT "post_captures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "linkedin_post_messages_user_received_idx" ON "linkedin_post_messages" USING btree ("user_id","received_at");--> statement-breakpoint
CREATE INDEX "post_captures_user_created_idx" ON "post_captures" USING btree ("user_id","created_at");