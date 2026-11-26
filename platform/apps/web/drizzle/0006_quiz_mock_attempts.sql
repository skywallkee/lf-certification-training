ALTER TYPE "public"."quiz_kind" ADD VALUE 'mock';--> statement-breakpoint
ALTER TABLE "quiz" ADD COLUMN "mock_id" text;--> statement-breakpoint
ALTER TABLE "quiz" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quiz" ADD COLUMN "draft" jsonb;--> statement-breakpoint
ALTER TABLE "quiz" ADD COLUMN "score" integer;--> statement-breakpoint
ALTER TABLE "quiz" ADD COLUMN "pass_percent" integer;--> statement-breakpoint
CREATE INDEX "quiz_mock_idx" ON "quiz" USING btree ("user_id","mock_id");