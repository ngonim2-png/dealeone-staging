ALTER TYPE "public"."report_target_type" ADD VALUE 'status';--> statement-breakpoint
CREATE TABLE "status_views" (
	"id" text PRIMARY KEY NOT NULL,
	"status_id" text NOT NULL,
	"viewer_id" text NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statuses" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"image_url" text NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "status_views" ADD CONSTRAINT "status_views_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_views" ADD CONSTRAINT "status_views_viewer_id_users_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "status_views_status_viewer_idx" ON "status_views" USING btree ("status_id","viewer_id");--> statement-breakpoint
CREATE INDEX "statuses_user_idx" ON "statuses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "statuses_expires_idx" ON "statuses" USING btree ("expires_at");