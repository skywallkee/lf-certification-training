CREATE TYPE "public"."lab_check_kind" AS ENUM('check', 'final');--> statement-breakpoint
CREATE TYPE "public"."lab_session_status" AS ENUM('requested', 'booting', 'ready', 'finished', 'expired', 'failed', 'killed');--> statement-breakpoint
CREATE TABLE "lab_check_run" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lab_check_run_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"session_id" uuid NOT NULL,
	"kind" "lab_check_kind" NOT NULL,
	"results" jsonb NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_hint_use" (
	"session_id" uuid NOT NULL,
	"task_id" text NOT NULL,
	"hint_index" integer NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lab_hint_use_session_id_task_id_hint_index_pk" PRIMARY KEY("session_id","task_id","hint_index")
);
--> statement-breakpoint
CREATE TABLE "lab_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"lab_id" text NOT NULL,
	"cert_code" text NOT NULL,
	"status" "lab_session_status" DEFAULT 'requested' NOT NULL,
	"provider" text NOT NULL,
	"boot_step" integer DEFAULT 0 NOT NULL,
	"status_message" text,
	"resources" jsonb,
	"minutes" integer NOT NULL,
	"extended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"score" integer,
	"cost_cents" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lab_check_run" ADD CONSTRAINT "lab_check_run_session_id_lab_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."lab_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_hint_use" ADD CONSTRAINT "lab_hint_use_session_id_lab_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."lab_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_session" ADD CONSTRAINT "lab_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lab_check_run_session_idx" ON "lab_check_run" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "lab_session_user_idx" ON "lab_session" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "lab_session_status_idx" ON "lab_session" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "lab_session_one_active_idx" ON "lab_session" USING btree ("user_id") WHERE "lab_session"."status" in ('requested', 'booting', 'ready');