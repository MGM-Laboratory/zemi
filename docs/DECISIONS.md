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
- 2026-09-26 site: public stats count talks as `event_speakers` rows on ended, published, non-cancelled events except moderators; `seatsFilled` is checked-in registrations on those events.
- 2026-09-26 seed: the 8 seeded recordings share one recording asset (a 124 min loop of the seed clip) to keep the bucket small; deleting a recording must not delete an asset another session still uses.
- 2026-09-26 seed: the seeder leaves `seo.ogImageAssetId` empty so link previews use the web's PNG `/brand/og-default.png` (the pipeline only emits AVIF/WebP).
- 2026-09-26 seed: the seeder runs a preflight (seed files present, bucket accepts writes, temp space) before `--reset` deletes anything.
- 2026-09-26 dev infra: Docker Desktop hung on this machine, so local dev runs natively (scripts/dev/*.sh): Homebrew Postgres 16, MediaMTX binary, and Versity S3 Gateway (POSIX backend) instead of MinIO. MinIO refuses writes above 99% disk use, which broke uploads on a nearly full disk; versitygw has no such cutoff. docker-compose.dev.yml still works where Docker is healthy.
- 2026-09-26 dev infra: Turbopack's persistent dev cache is off by default (NEXT_DEV_FS_CACHE=1 turns it on) because it grew past 1 GB on a nearly full disk.
- 2026-09-26 public-events: the /events archive grid defaults to `when=past` (wrapped Fridays) with a Wrapped / Coming up / Everything switch in the URL (`?when=`); public `past` and `upcoming` exclude cancelled events, so cancelled Fridays show under Everything, on the ribbon and on their own page.
- 2026-09-26 public-events: past event pages show "people saved a seat" from `registrationCount` (when public). There is no public check-in count, so we never claim how many people came.
- 2026-09-26 public-events: no loading.tsx under /events or /tickets, so old-slug redirects and notFound() keep real 308/404 status codes (a streamed page would downgrade them).
- 2026-09-26 stream: deleting or re-stitching a recording deletes its video asset only when it is purpose `recording` and no other session or gallery item uses it (otherwise it is detached); attaching a video as a recording uses the gallery rule (superadmin, `media.library`, or the uploader).
- 2026-09-26 deploy: next.config rewrites() are baked into the routes manifest at build time, so the web Dockerfile passes API_INTERNAL_URL as a build arg (otherwise /api/v1 rewrites point at the localhost fallback in production).
- 2026-09-26 security (verified on production): Railway's edge overwrites a client-supplied X-Real-IP (a forged 9.9.9.9 arrived at the API as the caller's real IP, through the Next rewrite too), so rate limits keyed on CLIENT_IP_HEADER=x-real-ip are not spoofable in production. Locally there is no edge, so the header is spoofable in dev only; no app change needed beyond validating the IP string format.
- 2026-09-28 public-home: the hero 3D clay cluster is gone (it lagged low-end machines), so the hero mini card is the highlight instead: it fills the right side, shows speaker chips and countdown cells, and falls back to the most recent past Friday (labelled Wrapped) when nothing is booked. The hero eyebrow default is now "Friday, FILKOM UB".
- 2026-09-28 public-home: the scroll-driven Friday clock is removed from the home page. Story beats are stamped 1, 2, 3... in story order ("1 - THE LONELY PART") instead of clock times; beat times still order the scenes and feed the admin preview. `story-clock.tsx` and the hero's `hero-scene.tsx` are deleted.
- 2026-09-28 cursor: the custom cursor dot now sits in its own fixed element at the root level with `mix-blend-mode: difference`, so it reads black on light backgrounds and white on dark ones (inside the fixed badge wrapper the blend only saw a transparent backdrop and stayed white). The follow lerp is distance-adaptive and frame-rate independent, so it no longer feels heavy.
- 2026-09-28 public-home: hero and lonely-beat copy start right under the nav on phones and tablets (the old 250-300px clearances existed for the removed 3D cluster and the clock). On desktops the lonely kicker ("Fridays aren't.") floats at the top right above where the friends gather, instead of below the copy.
