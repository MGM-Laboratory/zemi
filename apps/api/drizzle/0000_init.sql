CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"passphrase_lookup" text NOT NULL,
	"passphrase_hash" text NOT NULL,
	"policy" jsonb DEFAULT '{"capabilities":[],"grants":[]}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_passphrase_lookup_unique" UNIQUE("passphrase_lookup")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"error" text,
	"original_filename" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"original_key" text NOT NULL,
	"variants" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"width" integer,
	"height" integer,
	"duration_sec" real,
	"lqip" text,
	"color" text,
	"crop" jsonb,
	"adjust" jsonb,
	"alt" text,
	"caption" text,
	"credit" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"summary" text NOT NULL,
	"meta" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"action" text NOT NULL,
	"method" text NOT NULL,
	"actor_name" text NOT NULL,
	"device" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"topic" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to" text NOT NULL,
	"template" text NOT NULL,
	"subject" text NOT NULL,
	"status" text NOT NULL,
	"provider_id" text,
	"error" text,
	"event_id" uuid,
	"registration_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"caption" text,
	"featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_publications" (
	"event_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "event_publications_event_id_publication_id_pk" PRIMARY KEY("event_id","publication_id")
);
--> statement-breakpoint
CREATE TABLE "event_speakers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"speaker_id" uuid NOT NULL,
	"role" text DEFAULT 'speaker' NOT NULL,
	"organization" text,
	"position" text,
	"talk_title" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_streams" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"stream_key" text NOT NULL,
	"private_key_enc" text NOT NULL,
	"state" text DEFAULT 'idle' NOT NULL,
	"ingest_online" boolean DEFAULT false NOT NULL,
	"ingest_online_at" timestamp with time zone,
	"live_started_at" timestamp with time zone,
	"live_ended_at" timestamp with time zone,
	"current_session_id" uuid,
	"peak_viewers" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_streams_stream_key_unique" UNIQUE("stream_key")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"number" integer,
	"title" text NOT NULL,
	"summary" text,
	"cover_asset_id" uuid,
	"description" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description_text" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"venue_id" uuid,
	"room_note" text,
	"maps_url" text,
	"online_note" text,
	"mode" text DEFAULT 'hybrid' NOT NULL,
	"accent" text DEFAULT 'blue' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"visibility" text DEFAULT 'draft' NOT NULL,
	"registration_open" boolean DEFAULT true NOT NULL,
	"capacity" integer,
	"registration_closes_at" timestamp with time zone,
	"show_registrant_count" boolean DEFAULT true NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"published_at" timestamp with time zone,
	"reminders_scheduled_for" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"visibility" text DEFAULT 'published' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publication_authors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"speaker_id" uuid,
	"full_name" text,
	"avatar_asset_id" uuid,
	"organization" text,
	"url" text,
	"is_corresponding" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"abstract" text,
	"body" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cover_asset_id" uuid,
	"pdf_asset_id" uuid,
	"container_title" text,
	"volume" text,
	"issue" text,
	"pages" text,
	"publisher" text,
	"published_year" integer,
	"published_month" integer,
	"published_day" integer,
	"doi" text,
	"isbn" text,
	"issn" text,
	"arxiv_id" text,
	"url" text,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"language" text,
	"status" text DEFAULT 'published' NOT NULL,
	"license" text,
	"citation_key" text,
	"visibility" text DEFAULT 'published' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publications_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "recording_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stream_key" text NOT NULL,
	"s3_key" text NOT NULL,
	"filename" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_sec" real,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"attendance_mode" text DEFAULT 'in-person' NOT NULL,
	"ticket_code" text NOT NULL,
	"qr_token" text NOT NULL,
	"status" text DEFAULT 'registered' NOT NULL,
	"source" text DEFAULT 'web' NOT NULL,
	"checked_in_at" timestamp with time zone,
	"checked_in_by" text,
	"check_in_method" text,
	"notes" text,
	"email_status" text,
	"ip" text,
	"user_agent" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registrations_ticket_code_unique" UNIQUE("ticket_code"),
	CONSTRAINT "registrations_qr_token_unique" UNIQUE("qr_token")
);
--> statement-breakpoint
CREATE TABLE "rundown_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"time" text NOT NULL,
	"end_time" text,
	"agenda" text NOT NULL,
	"note" text,
	"speaker_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"principal_type" text NOT NULL,
	"admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "slug_redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_type" text NOT NULL,
	"old_slug" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "speakers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"full_name" text NOT NULL,
	"nickname" text,
	"headline" text,
	"bio" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bio_text" text DEFAULT '' NOT NULL,
	"avatar_asset_id" uuid,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_organization" text,
	"default_position" text,
	"email" text,
	"visibility" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "speakers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "stream_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"stream_key" text NOT NULL,
	"title" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"recording_status" text DEFAULT 'recording' NOT NULL,
	"recording_asset_id" uuid,
	"visibility" text DEFAULT 'public' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"peak_viewers" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"bio" text,
	"avatar_asset_id" uuid,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"visibility" text DEFAULT 'published' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"building" text,
	"floor" text,
	"capacity" integer,
	"address" text,
	"maps_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_media" ADD CONSTRAINT "event_media_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_media" ADD CONSTRAINT "event_media_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_publications" ADD CONSTRAINT "event_publications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_publications" ADD CONSTRAINT "event_publications_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_speakers" ADD CONSTRAINT "event_speakers_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_speakers" ADD CONSTRAINT "event_speakers_speaker_id_speakers_id_fk" FOREIGN KEY ("speaker_id") REFERENCES "public"."speakers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_streams" ADD CONSTRAINT "event_streams_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_cover_asset_id_assets_id_fk" FOREIGN KEY ("cover_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_authors" ADD CONSTRAINT "publication_authors_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_authors" ADD CONSTRAINT "publication_authors_speaker_id_speakers_id_fk" FOREIGN KEY ("speaker_id") REFERENCES "public"."speakers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_authors" ADD CONSTRAINT "publication_authors_avatar_asset_id_assets_id_fk" FOREIGN KEY ("avatar_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_cover_asset_id_assets_id_fk" FOREIGN KEY ("cover_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_pdf_asset_id_assets_id_fk" FOREIGN KEY ("pdf_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rundown_items" ADD CONSTRAINT "rundown_items_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rundown_items" ADD CONSTRAINT "rundown_items_speaker_id_speakers_id_fk" FOREIGN KEY ("speaker_id") REFERENCES "public"."speakers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speakers" ADD CONSTRAINT "speakers_avatar_asset_id_assets_id_fk" FOREIGN KEY ("avatar_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_sessions" ADD CONSTRAINT "stream_sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_sessions" ADD CONSTRAINT "stream_sessions_recording_asset_id_assets_id_fk" FOREIGN KEY ("recording_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_avatar_asset_id_assets_id_fk" FOREIGN KEY ("avatar_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_purpose_idx" ON "assets" USING btree ("purpose","created_at");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_resource_idx" ON "audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "checkins_event_idx" ON "checkins" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "contact_created_idx" ON "contact_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "email_logs_event_idx" ON "email_logs" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "event_media_event_idx" ON "event_media" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_speakers_event_idx" ON "event_speakers" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_speakers_speaker_idx" ON "event_speakers" USING btree ("speaker_id");--> statement-breakpoint
CREATE INDEX "events_starts_idx" ON "events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "events_visibility_idx" ON "events" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "pub_authors_pub_idx" ON "publication_authors" USING btree ("publication_id");--> statement-breakpoint
CREATE INDEX "pub_authors_speaker_idx" ON "publication_authors" USING btree ("speaker_id");--> statement-breakpoint
CREATE INDEX "publications_year_idx" ON "publications" USING btree ("published_year");--> statement-breakpoint
CREATE INDEX "segments_key_start_idx" ON "recording_segments" USING btree ("stream_key","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "segments_key_file_uq" ON "recording_segments" USING btree ("stream_key","filename");--> statement-breakpoint
CREATE UNIQUE INDEX "registrations_event_email_uq" ON "registrations" USING btree ("event_id","email");--> statement-breakpoint
CREATE INDEX "registrations_event_idx" ON "registrations" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "registrations_email_idx" ON "registrations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "rundown_event_idx" ON "rundown_items" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "sessions_admin_idx" ON "sessions" USING btree ("admin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "slug_redirects_uq" ON "slug_redirects" USING btree ("resource_type","old_slug");--> statement-breakpoint
CREATE INDEX "speakers_name_idx" ON "speakers" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "stream_sessions_event_idx" ON "stream_sessions" USING btree ("event_id","started_at");