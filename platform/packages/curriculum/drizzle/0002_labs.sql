CREATE TABLE "lab" (
	"id" text PRIMARY KEY NOT NULL,
	"cert_code" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"tier" integer NOT NULL,
	"minutes" integer NOT NULL,
	"docs" jsonb NOT NULL,
	"images" text[] NOT NULL,
	"setup" text,
	"solution" text NOT NULL,
	"tasks" jsonb NOT NULL,
	"competency_refs" text[] NOT NULL,
	"mock" boolean DEFAULT false NOT NULL,
	"file" text NOT NULL,
	"content_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingest_run" ADD COLUMN "labs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lab" ADD CONSTRAINT "lab_cert_code_certification_code_fk" FOREIGN KEY ("cert_code") REFERENCES "public"."certification"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lab_cert_idx" ON "lab" USING btree ("cert_code");--> statement-breakpoint
CREATE INDEX "lab_refs_idx" ON "lab" USING gin ("competency_refs");