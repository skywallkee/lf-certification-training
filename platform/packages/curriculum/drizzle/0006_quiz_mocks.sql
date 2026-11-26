CREATE TABLE "quiz_mock" (
	"id" text PRIMARY KEY NOT NULL,
	"cert_code" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"minutes" integer NOT NULL,
	"question_count" integer NOT NULL,
	"pass_percent" integer NOT NULL,
	"question_ids" text[],
	"mock" boolean DEFAULT false NOT NULL,
	"origin" text DEFAULT 'file' NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"file" text NOT NULL,
	"content_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quiz_mock" ADD CONSTRAINT "quiz_mock_cert_code_certification_code_fk" FOREIGN KEY ("cert_code") REFERENCES "public"."certification"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quiz_mock_cert_idx" ON "quiz_mock" USING btree ("cert_code");