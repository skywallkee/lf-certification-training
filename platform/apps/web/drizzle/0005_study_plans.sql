CREATE TABLE "reminder_sent" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_sent_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "study_target" (
	"user_id" text NOT NULL,
	"cert_code" text NOT NULL,
	"exam_on" date NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_target_user_id_cert_code_pk" PRIMARY KEY("user_id","cert_code")
);
--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "remind_weekly" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "remind_nudge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "remind_exam" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "remind_day" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "remind_hour" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_sent" ADD CONSTRAINT "reminder_sent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_target" ADD CONSTRAINT "study_target_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;