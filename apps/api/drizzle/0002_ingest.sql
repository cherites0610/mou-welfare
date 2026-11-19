CREATE TABLE "ingest_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_key" text,
	"source_url" text NOT NULL,
	"action" text NOT NULL,
	"content_hash" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "welfare_sources" (
	"url" text PRIMARY KEY NOT NULL,
	"program_id" uuid NOT NULL,
	"site_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "welfare_programs" DROP CONSTRAINT "welfare_status_check";--> statement-breakpoint
ALTER TABLE "welfare_programs" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "welfare_programs" ADD COLUMN "site_id" text;--> statement-breakpoint
ALTER TABLE "welfare_programs" ADD COLUMN "source_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "welfare_programs" ADD COLUMN "structured_hash" text;--> statement-breakpoint
ALTER TABLE "welfare_programs" ADD COLUMN "structured_by" text;--> statement-breakpoint
ALTER TABLE "welfare_programs" ADD COLUMN "structured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "welfare_programs" ADD COLUMN "structure_error" text;--> statement-breakpoint
ALTER TABLE "welfare_sources" ADD CONSTRAINT "welfare_sources_program_id_welfare_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."welfare_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingest_log_received_idx" ON "ingest_log" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "ingest_log_key_idx" ON "ingest_log" USING btree ("program_key");--> statement-breakpoint
CREATE INDEX "welfare_sources_program_idx" ON "welfare_sources" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "welfare_sources_site_idx" ON "welfare_sources" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "welfare_site_idx" ON "welfare_programs" USING btree ("site_id");--> statement-breakpoint
ALTER TABLE "welfare_programs" ADD CONSTRAINT "welfare_status_check" CHECK ("welfare_programs"."status" in ('pending', 'active', 'rejected', 'expired', 'removed'));