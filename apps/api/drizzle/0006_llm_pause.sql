CREATE TABLE "llm_pause" (
	"name" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"paused_at" timestamp with time zone DEFAULT now() NOT NULL,
	"probed_at" timestamp with time zone
);
