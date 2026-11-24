CREATE TYPE "public"."question_kind" AS ENUM('single', 'multiple');--> statement-breakpoint
CREATE TABLE "ingest_run" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ingest_run_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"curriculum_versions_added" integer DEFAULT 0 NOT NULL,
	"lessons" integer DEFAULT 0 NOT NULL,
	"questions" integer DEFAULT 0 NOT NULL,
	"include_sample" boolean NOT NULL,
	"ok" boolean DEFAULT false NOT NULL,
	"message" text
);
--> statement-breakpoint
CREATE TABLE "lesson" (
	"id" text PRIMARY KEY NOT NULL,
	"cert_code" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"minutes" integer NOT NULL,
	"body" text NOT NULL,
	"docs" jsonb NOT NULL,
	"competency_refs" text[] NOT NULL,
	"mock" boolean DEFAULT false NOT NULL,
	"file" text NOT NULL,
	"content_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question" (
	"id" text PRIMARY KEY NOT NULL,
	"cert_code" text NOT NULL,
	"kind" "question_kind" NOT NULL,
	"stem" text NOT NULL,
	"options" jsonb NOT NULL,
	"explanation" text NOT NULL,
	"source_title" text NOT NULL,
	"source_url" text NOT NULL,
	"competency_refs" text[] NOT NULL,
	"mock" boolean DEFAULT false NOT NULL,
	"known_issue" text,
	"file" text NOT NULL,
	"content_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_cert_code_certification_code_fk" FOREIGN KEY ("cert_code") REFERENCES "public"."certification"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_cert_code_certification_code_fk" FOREIGN KEY ("cert_code") REFERENCES "public"."certification"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_cert_idx" ON "lesson" USING btree ("cert_code");--> statement-breakpoint
CREATE INDEX "lesson_refs_idx" ON "lesson" USING gin ("competency_refs");--> statement-breakpoint
CREATE INDEX "question_cert_idx" ON "question" USING btree ("cert_code");--> statement-breakpoint
CREATE INDEX "question_refs_idx" ON "question" USING gin ("competency_refs");