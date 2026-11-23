CREATE TABLE "alert_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"interval_days" integer,
	"planned" text[] DEFAULT '{}' NOT NULL,
	"current" text,
	"sites" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "scrape_runs_started_idx" ON "scrape_runs" USING btree ("started_at");