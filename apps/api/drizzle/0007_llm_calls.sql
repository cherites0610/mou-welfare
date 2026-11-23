CREATE TABLE "llm_calls" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purpose" text NOT NULL,
	"program_id" uuid,
	"model" text NOT NULL,
	"prompt_version" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"thoughts_tokens" integer,
	"total_tokens" integer,
	"input_chars" integer NOT NULL,
	"latency_ms" integer NOT NULL,
	"ok" boolean NOT NULL,
	"error_kind" text,
	"error" text,
	"cost_usd" double precision
);
--> statement-breakpoint
ALTER TABLE "welfare_programs" ADD COLUMN "structured_model" text;--> statement-breakpoint
ALTER TABLE "welfare_programs" ADD COLUMN "structured_prompt_version" text;--> statement-breakpoint
CREATE INDEX "llm_calls_created_idx" ON "llm_calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "llm_calls_program_idx" ON "llm_calls" USING btree ("program_id");