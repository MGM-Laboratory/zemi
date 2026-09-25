# Decisions log

Append-only. One line per judgment call: date, area, decision, why.

- 2026-09-25 infra: MediaMTX pinned to v1.21.1 with `authMethod: http`; `hlsCDNSecret` gives the API HLS proxy one shared cookieless session.
- 2026-09-25 infra: Railway buckets are private, so all media is served through the API `/media/*` proxy with immutable caching.
- 2026-09-25 infra: Recording = MediaMTX 60s fMP4 segments uploaded to the API as they finish; the API stitches and trims on End. Survives API restarts.
- 2026-09-25 auth: passphrase-only login uses HMAC lookup + argon2id verify; superadmin is a virtual principal from env.
- 2026-09-25 web: local dev web port is 3300 (3000 is used by another project on this machine).
- 2026-09-25 content: event-related publications reference Publication records (with quick-create stubs) so every paper mention links to /publications/[slug].
- 2026-09-25 routes: speaker pages live at /speakers/[slug]; /speaker/[slug] redirects.
- 2026-09-25 media: processed asset URLs carry `?v=<rev>` (variants.rev) so recrops bust the immutable cache while keys stay `assets/<id>/w<width>.<fmt>`.
- 2026-09-25 media: originals keep EXIF/GPS, so they are private; served only via `GET /admin/assets/:id/original` to the uploader, `media.library` holders and the superadmin.
- 2026-09-25 media: image refs render whenever variants exist (not only when status is ready), so a recrop in progress or a failed recrop keeps showing the previous image.
- 2026-09-25 media: videos process on their own queue `asset.process-video`; recordings use `videoMode: 'as-is'` (poster + storyboard only, no transcode).
- 2026-09-25 media: every finished processing job triggers a broad revalidate so pages pick up new covers without waiting.
- 2026-09-25 api: `GET /admin/assets?mine=true` works for any admin; `POST /admin/system/test-email` and `GET /admin/system/email-preview/:template` (superadmin) exist for checking templates.
- 2026-09-25 security: client IP comes from `CLIENT_IP_HEADER` (default `x-real-ip`, set by Railway's edge) so rotating X-Forwarded-For cannot reset rate limits. Verify on Railway after deploy.
- 2026-09-25 security: production boot refuses the two dev secrets (dev superadmin passphrase, dev media secret).
- 2026-09-25 assets: seed portraits (randomuser.me) are upscaled; documentation photos are AI-generated (codex image generation) and marked as such in the manifest; the wall clock GLB ships at 12:00 with empty pivot nodes named hour_hand/minute_hand for animation.
- 2026-09-25 schema: events gained reminder_sent_at, starting_sent_at, thanks_sent_at for idempotent lifecycle emails.
