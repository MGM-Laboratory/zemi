CREATE TABLE "discussion_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "tag" text NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "discussion_identity_status_check" CHECK ("status" IN ('active','suspended','deleted'))
);
CREATE UNIQUE INDEX "discussion_identity_name_tag_uq" ON "discussion_identities" (lower("name"), "tag");

CREATE TABLE "discussion_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "author_id" uuid REFERENCES "discussion_identities"("id") ON DELETE SET NULL,
  "author_label" text NOT NULL,
  "event_id" uuid REFERENCES "events"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "body" jsonb NOT NULL,
  "body_text" text NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "pinned" boolean DEFAULT false NOT NULL,
  "accepted_comment_id" uuid,
  "score" integer DEFAULT 0 NOT NULL,
  "comment_count" integer DEFAULT 0 NOT NULL,
  "report_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "discussion_thread_status_check" CHECK ("status" IN ('open','locked','archived','hidden','deleted'))
);
CREATE INDEX "discussion_threads_created_idx" ON "discussion_threads" ("created_at");
CREATE INDEX "discussion_threads_event_idx" ON "discussion_threads" ("event_id","created_at");
CREATE INDEX "discussion_threads_status_idx" ON "discussion_threads" ("status","report_count");

CREATE TABLE "discussion_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "thread_id" uuid NOT NULL REFERENCES "discussion_threads"("id") ON DELETE CASCADE,
  "parent_id" uuid,
  "author_id" uuid REFERENCES "discussion_identities"("id") ON DELETE SET NULL,
  "author_label" text NOT NULL,
  "body" text NOT NULL,
  "status" text DEFAULT 'visible' NOT NULL,
  "score" integer DEFAULT 0 NOT NULL,
  "report_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "discussion_comment_status_check" CHECK ("status" IN ('visible','hidden','deleted'))
);
CREATE INDEX "discussion_comments_thread_idx" ON "discussion_comments" ("thread_id","created_at");

CREATE TABLE "discussion_votes" (
  "identity_id" uuid NOT NULL REFERENCES "discussion_identities"("id") ON DELETE CASCADE,
  "target_type" text NOT NULL,
  "target_id" uuid NOT NULL,
  "value" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("identity_id","target_type","target_id"),
  CONSTRAINT "discussion_vote_value_check" CHECK ("value" IN (-1,1))
);
CREATE INDEX "discussion_votes_target_idx" ON "discussion_votes" ("target_type","target_id");

CREATE TABLE "discussion_reactions" (
  "identity_id" uuid NOT NULL REFERENCES "discussion_identities"("id") ON DELETE CASCADE,
  "target_type" text NOT NULL,
  "target_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("identity_id","target_type","target_id","kind")
);

CREATE TABLE "discussion_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reporter_id" uuid REFERENCES "discussion_identities"("id") ON DELETE SET NULL,
  "target_type" text NOT NULL,
  "target_id" uuid NOT NULL,
  "reason" text NOT NULL,
  "note" text,
  "status" text DEFAULT 'open' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "resolved_at" timestamptz,
  "resolved_by" text,
  CONSTRAINT "discussion_report_status_check" CHECK ("status" IN ('open','resolved','dismissed'))
);
CREATE INDEX "discussion_reports_status_idx" ON "discussion_reports" ("status","created_at");
