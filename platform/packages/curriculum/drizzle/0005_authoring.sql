ALTER TABLE "lab" ADD COLUMN "origin" text DEFAULT 'file' NOT NULL;--> statement-breakpoint
ALTER TABLE "lab" ADD COLUMN "published" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson" ADD COLUMN "origin" text DEFAULT 'file' NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson" ADD COLUMN "published" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "question" ADD COLUMN "origin" text DEFAULT 'file' NOT NULL;--> statement-breakpoint
ALTER TABLE "question" ADD COLUMN "published" boolean DEFAULT true NOT NULL;