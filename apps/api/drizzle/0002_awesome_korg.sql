ALTER TYPE "public"."message_type" ADD VALUE 'voice';--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "audio_url" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "audio_duration_sec" integer;