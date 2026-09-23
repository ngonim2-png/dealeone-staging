CREATE TYPE "public"."verification_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."payment_kind" ADD VALUE 'category_pin';--> statement-breakpoint
ALTER TYPE "public"."payment_kind" ADD VALUE 'banner_ad';--> statement-breakpoint
ALTER TYPE "public"."payment_kind" ADD VALUE 'verification_priority';--> statement-breakpoint
ALTER TYPE "public"."payment_kind" ADD VALUE 'buyer_request_priority';--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"rater_id" text NOT NULL,
	"rated_user_id" text NOT NULL,
	"stars" integer NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"target_level" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"photo" text,
	"priority" boolean DEFAULT false NOT NULL,
	"status" "verification_request_status" DEFAULT 'pending' NOT NULL,
	"resolution_note" text,
	"resolved_by_admin_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "listing_payments" ALTER COLUMN "listing_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "category_pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "category_pinned_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "banner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "banner_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "verification_priority_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "buyer_request_priority_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_rater_id_users_id_fk" FOREIGN KEY ("rater_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_rated_user_id_users_id_fk" FOREIGN KEY ("rated_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_resolved_by_admin_id_users_id_fk" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_listing_idx" ON "ratings" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "ratings_rated_user_idx" ON "ratings" USING btree ("rated_user_id");--> statement-breakpoint
CREATE INDEX "verification_requests_user_idx" ON "verification_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_requests_status_idx" ON "verification_requests" USING btree ("status");