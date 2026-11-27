CREATE TABLE "lab_queue" (
	"user_id" text PRIMARY KEY NOT NULL,
	"lab_id" text NOT NULL,
	"mode" text DEFAULT 'lab' NOT NULL,
	"clusters" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lab_queue" ADD CONSTRAINT "lab_queue_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lab_queue_order_idx" ON "lab_queue" USING btree ("created_at");