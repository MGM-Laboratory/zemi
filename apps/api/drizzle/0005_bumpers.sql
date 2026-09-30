CREATE TABLE "bumper_shows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "event_id" uuid REFERENCES "events"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'active' NOT NULL,
  "origin" text DEFAULT 'blank' NOT NULL,
  "theme" jsonb NOT NULL,
  "slides" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "output_key" text NOT NULL UNIQUE,
  "control_key_hash" text NOT NULL UNIQUE,
  "control_key_enc" text NOT NULL,
  "keys_rotated_at" timestamptz DEFAULT now() NOT NULL,
  "live_slide_id" text,
  "live_from_slide_id" text,
  "live_transition" text,
  "live_dir" integer DEFAULT 1 NOT NULL,
  "live_mode" text DEFAULT 'show' NOT NULL,
  "live_autoplay" boolean DEFAULT true NOT NULL,
  "live_advance_at" timestamptz,
  "live_started_at" timestamptz,
  "live_updated_at" timestamptz DEFAULT now() NOT NULL,
  "live_seq" integer DEFAULT 0 NOT NULL,
  "live_cue" integer DEFAULT 0 NOT NULL,
  "live_via" text,
  "live_by" text,
  "last_played_at" timestamptz,
  "archived_at" timestamptz,
  "created_by" text,
  "created_by_name" text,
  "updated_by" text,
  "updated_by_name" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "bumper_show_status_check" CHECK ("status" IN ('active','archived')),
  CONSTRAINT "bumper_show_origin_check" CHECK ("origin" IN ('blank','generated','duplicate','starter','restored')),
  CONSTRAINT "bumper_show_live_mode_check" CHECK ("live_mode" IN ('show','black','clear')),
  CONSTRAINT "bumper_show_live_dir_check" CHECK ("live_dir" IN (-1,1))
);
--> statement-breakpoint
CREATE INDEX "bumper_shows_event_idx" ON "bumper_shows" ("event_id");
--> statement-breakpoint
CREATE INDEX "bumper_shows_status_updated_idx" ON "bumper_shows" ("status", "updated_at");
--> statement-breakpoint
CREATE INDEX "bumper_shows_advance_idx" ON "bumper_shows" ("live_advance_at");
--> statement-breakpoint
CREATE TABLE "bumper_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "show_id" uuid NOT NULL REFERENCES "bumper_shows"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "title" text NOT NULL,
  "theme" jsonb NOT NULL,
  "slides" jsonb NOT NULL,
  "reason" text DEFAULT 'save' NOT NULL,
  "created_by" text,
  "created_by_name" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "bumper_revisions_show_idx" ON "bumper_revisions" ("show_id", "created_at");
