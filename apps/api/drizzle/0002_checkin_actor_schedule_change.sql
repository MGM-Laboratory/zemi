ALTER TABLE "checkins" ADD COLUMN "actor_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "schedule_changed_at" timestamp with time zone;