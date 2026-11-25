ALTER TABLE "lab" ADD COLUMN "kind" text DEFAULT 'lab' NOT NULL;--> statement-breakpoint
ALTER TABLE "lab" ADD COLUMN "pass_percent" integer;