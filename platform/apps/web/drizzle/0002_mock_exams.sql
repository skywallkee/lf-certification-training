ALTER TABLE "lab_session" ADD COLUMN "mode" text DEFAULT 'lab' NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_session" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lab_session" ADD COLUMN "window_leaves" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "lab_session_mode_idx" ON "lab_session" USING btree ("user_id","mode","cert_code","started_at");