CREATE TABLE "favorites" (
	"user_id" text NOT NULL,
	"program_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_program_id_pk" PRIMARY KEY("user_id","program_id")
);
--> statement-breakpoint
CREATE TABLE "welfare_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"text" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "welfare_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_key" text NOT NULL,
	"city" text NOT NULL,
	"name" text NOT NULL,
	"categories" text[] DEFAULT '{}' NOT NULL,
	"identities" text[] DEFAULT '{}' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"requirements" text[] DEFAULT '{}' NOT NULL,
	"rewards" text[] DEFAULT '{}' NOT NULL,
	"content_md" text DEFAULT '' NOT NULL,
	"source_url" text NOT NULL,
	"source_kind" text NOT NULL,
	"published_at" date,
	"deadline" date,
	"status" text DEFAULT 'active' NOT NULL,
	"content_hash" text,
	"embedding" vector(768),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "welfare_programs_program_key_unique" UNIQUE("program_key"),
	CONSTRAINT "welfare_status_check" CHECK ("welfare_programs"."status" in ('active', 'expired', 'removed'))
);
--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_program_id_welfare_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."welfare_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_attachments" ADD CONSTRAINT "welfare_attachments_program_id_welfare_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."welfare_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "favorites_program_idx" ON "favorites" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "welfare_attachments_program_idx" ON "welfare_attachments" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "welfare_identities_gin" ON "welfare_programs" USING gin ("identities");--> statement-breakpoint
CREATE INDEX "welfare_categories_gin" ON "welfare_programs" USING gin ("categories");--> statement-breakpoint
CREATE INDEX "welfare_name_trgm" ON "welfare_programs" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "welfare_summary_trgm" ON "welfare_programs" USING gin ("summary" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "welfare_city_status_idx" ON "welfare_programs" USING btree ("city","status");--> statement-breakpoint
CREATE INDEX "welfare_embedding_hnsw" ON "welfare_programs" USING hnsw ("embedding" vector_cosine_ops);