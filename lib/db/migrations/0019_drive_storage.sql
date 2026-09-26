CREATE TABLE "drive_folders" (
	"user_id" uuid NOT NULL,
	"folder_key" text NOT NULL,
	"folder_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drive_folders_user_id_folder_key_pk" PRIMARY KEY("user_id","folder_key")
);
--> statement-breakpoint
ALTER TABLE "document_assets" ALTER COLUMN "bytes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "document_pdf_cache" ALTER COLUMN "bytes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cv_scores" ADD COLUMN "drive_file_id" text;--> statement-breakpoint
ALTER TABLE "document_assets" ADD COLUMN "drive_file_id" text;--> statement-breakpoint
ALTER TABLE "document_assets" ADD COLUMN "drive_picked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "document_pdf_cache" ADD COLUMN "drive_file_id" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "drive_storage_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "drive_folders" ADD CONSTRAINT "drive_folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_assets" ADD CONSTRAINT "document_assets_has_copy" CHECK ("document_assets"."bytes" is not null or "document_assets"."drive_file_id" is not null);--> statement-breakpoint
ALTER TABLE "document_pdf_cache" ADD CONSTRAINT "document_pdf_cache_has_copy" CHECK ("document_pdf_cache"."bytes" is not null or "document_pdf_cache"."drive_file_id" is not null);