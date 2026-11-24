CREATE TYPE "public"."exam_style" AS ENUM('performance', 'multiple-choice');--> statement-breakpoint
CREATE TYPE "public"."curriculum_verification" AS ENUM('text', 'visual', 'pending');--> statement-breakpoint
CREATE TABLE "certification" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"exam_style" "exam_style" NOT NULL,
	"duration_minutes" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competency" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "competency_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"domain_id" integer NOT NULL,
	"ref" text NOT NULL,
	"statement" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_version" (
	"id" text PRIMARY KEY NOT NULL,
	"cert_code" text NOT NULL,
	"version" text,
	"source_url" text NOT NULL,
	"source_commit" text,
	"source_blob_sha" text,
	"retrieved_at" date NOT NULL,
	"effective_from" date,
	"verification" "curriculum_verification" NOT NULL,
	"content_hash" text NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"loaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "domain_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"version_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"weight" integer NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"source_url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_member" (
	"program_key" text NOT NULL,
	"cert_code" text NOT NULL,
	"required_from" date,
	"retired_at" date,
	CONSTRAINT "program_member_program_key_cert_code_pk" PRIMARY KEY("program_key","cert_code")
);
--> statement-breakpoint
ALTER TABLE "competency" ADD CONSTRAINT "competency_domain_id_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_version" ADD CONSTRAINT "curriculum_version_cert_code_certification_code_fk" FOREIGN KEY ("cert_code") REFERENCES "public"."certification"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain" ADD CONSTRAINT "domain_version_id_curriculum_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."curriculum_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_member" ADD CONSTRAINT "program_member_program_key_program_key_fk" FOREIGN KEY ("program_key") REFERENCES "public"."program"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_member" ADD CONSTRAINT "program_member_cert_code_certification_code_fk" FOREIGN KEY ("cert_code") REFERENCES "public"."certification"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competency_domain_ref_idx" ON "competency" USING btree ("domain_id","ref");--> statement-breakpoint
CREATE INDEX "competency_ref_idx" ON "competency" USING btree ("ref");--> statement-breakpoint
CREATE INDEX "curriculum_version_cert_idx" ON "curriculum_version" USING btree ("cert_code");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_version_one_current_idx" ON "curriculum_version" USING btree ("cert_code") WHERE "curriculum_version"."is_current";--> statement-breakpoint
CREATE UNIQUE INDEX "domain_version_key_idx" ON "domain" USING btree ("version_id","key");