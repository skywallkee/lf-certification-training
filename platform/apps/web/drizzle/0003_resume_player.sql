ALTER TABLE "lab_session" ADD COLUMN "player_state" jsonb;--> statement-breakpoint
ALTER TABLE "lab_session" ADD COLUMN "ending_at" timestamp with time zone;