ALTER TABLE "discussion_threads" ADD COLUMN "speaker_id" uuid REFERENCES "speakers"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX "discussion_threads_speaker_idx" ON "discussion_threads" ("speaker_id");
