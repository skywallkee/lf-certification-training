CREATE TABLE "discussion_follow" (
	"user_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discussion_follow_user_id_target_type_target_id_pk" PRIMARY KEY("user_id","target_type","target_id")
);
--> statement-breakpoint
CREATE TABLE "discussion_post" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "discussion_post_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"parent_id" integer,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"spoiler" boolean DEFAULT false NOT NULL,
	"accepted" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'visible' NOT NULL,
	"hidden_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "discussion_report" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "discussion_report_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"post_id" integer NOT NULL,
	"user_id" text,
	"reason" text NOT NULL,
	"details" text,
	"status" "flag_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "discussion_vote" (
	"post_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discussion_vote_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "notify_discussions" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "discussion_follow" ADD CONSTRAINT "discussion_follow_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_post" ADD CONSTRAINT "discussion_post_parent_id_discussion_post_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."discussion_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_post" ADD CONSTRAINT "discussion_post_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_report" ADD CONSTRAINT "discussion_report_post_id_discussion_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."discussion_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_report" ADD CONSTRAINT "discussion_report_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_vote" ADD CONSTRAINT "discussion_vote_post_id_discussion_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."discussion_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_vote" ADD CONSTRAINT "discussion_vote_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discussion_follow_target_idx" ON "discussion_follow" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "discussion_post_target_idx" ON "discussion_post" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "discussion_post_parent_idx" ON "discussion_post" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "discussion_post_user_idx" ON "discussion_post" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "discussion_report_status_idx" ON "discussion_report" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "discussion_report_once_idx" ON "discussion_report" USING btree ("post_id","user_id");