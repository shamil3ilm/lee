CREATE TABLE "processed_gmail_threads" (
	"user_id" uuid NOT NULL,
	"thread_id" text NOT NULL,
	"matched_application_id" uuid,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_gmail_threads_user_id_thread_id_pk" PRIMARY KEY("user_id","thread_id")
);
--> statement-breakpoint
ALTER TABLE "interview_stages" ADD COLUMN "google_event_id" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "synced_gmail_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "synced_calendar_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "processed_gmail_threads" ADD CONSTRAINT "processed_gmail_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processed_gmail_threads" ADD CONSTRAINT "processed_gmail_threads_matched_application_id_applications_id_fk" FOREIGN KEY ("matched_application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;