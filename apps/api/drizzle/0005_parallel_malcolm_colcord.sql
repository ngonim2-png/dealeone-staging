CREATE TYPE "public"."payment_kind" AS ENUM('listing_fee', 'boost', 'featured');--> statement-breakpoint
CREATE TABLE "listing_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"seller_id" text NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"amount" integer NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "fee_paid_until" timestamp with time zone DEFAULT (now() + interval '1 month') NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "sponsored_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "featured_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listing_payments" ADD CONSTRAINT "listing_payments_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_payments" ADD CONSTRAINT "listing_payments_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_payments_listing_idx" ON "listing_payments" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_payments_seller_idx" ON "listing_payments" USING btree ("seller_id");