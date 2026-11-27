ALTER TABLE "lesson" ADD COLUMN "diagrams" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson" ADD COLUMN "video" jsonb;