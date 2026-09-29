# Zemi

The Friday seminar by [MGM Laboratory](https://labmgm.org). Every Friday, 13:15 to 15:15 WIB,
postgrads share research in progress, undergrads get inspired, and everyone gets coffee.
Hybrid: a classroom or theater on campus, plus a livestream on the site.

- **Public site:** https://zemi.ac
- **Admin dashboard:** https://zemi.ac/admin (passphrase login)
- **API:** https://zemi-api.up.railway.app/api/v1
- **Preview site:** https://zemi-preview.up.railway.app

This repo holds the story-driven public site, the admin CMS and dashboard, the API, and the
livestream ingest server.

## What's inside

```
apps/web        Next.js 16 (App Router). Public site + /admin dashboard.
apps/api        NestJS 11 (ESM). REST API, jobs (pg-boss), media pipeline, email, streaming.
apps/media      MediaMTX 1.21.1 image: RTMP ingest from OBS, private HLS, recording segments.
packages/shared Zod contract, types, RBAC resolver, Jakarta time helpers, citations, brand geometry.
e2e/            Playwright end-to-end suite (public, registration, check-in, RBAC, stream, scanner).
scripts/        Local dev services, Blender 3D props, brand renders, seed media generators.
docs/           SPEC (architecture), DESIGN (brand + motion), DECISIONS, foundation/ + features/ notes.
.railway/       Railway infrastructure as code (railway.ts).
```

Read `docs/SPEC.md` for the architecture and `docs/DESIGN.md` for the brand system (the four
characters, the Friday clock, typography, motion, voice).

## Features at a glance

**Public site:** home story that runs like a Friday session from 13:15 to 15:15 (numbered story
beats, 3D clay characters and Blender props in the pinned scenes), events archive with a timeline
ribbon of every Friday, event pages
that change by state (coming up, happening now with the live player and reactions, wrapped with the
recording, chapters and photo gallery, cancelled), free registration with a branded QR ticket,
speakers directory and profiles, publications library with cite-this (APA, IEEE, MLA, Chicago, Harvard,
Vancouver, BibTeX, RIS), PDF viewer and Scholar meta tags, discussion threads for each Friday
or general questions, about, contact, and a playful 404.

**Admin dashboard:** passphrase login, superadmin from env, admins with expiry and least-privilege RBAC
(per-event, per-speaker, per-publication grants plus global capabilities, with presets), audit log.
Event workspace per event: details with 4:5 cover crop and adjust, BlockNote description, speakers
with per-event organization and position, rundown, related publications, registrations with charts,
export (CSV/XLSX) and the printable attendance paper (PDF), live attendance board, full-screen QR
scanner (webcam or phone camera, low-light preprocessing, torch, zoom), email broadcasts, OBS
stream control room (preview, go live, end, recordings), documentation media. Plus speakers,
publications (DOI autofill from Crossref), rooms, media library, site CMS (home, about, contact, SEO,
FAQ, team, emails), discussion moderation, inbox, audience, and system status.

**Discussion:** visitors enter with a name only. A long-lived, httpOnly cookie holds one identity
per browser; duplicate names get different four-digit suffixes. Participants can ask with BlockNote
(including processed image uploads), pick a published event or General, tag, search, vote, react,
reply, mark a helpful answer, save locally and report. Current or next Friday threads lead the feed,
then General. Admins with `discussion.view` can inspect all content and reports; `discussion.manage`
adds pinning, locking, archiving, hiding, deleting, report review and suspending participants.
Cloudflare Turnstile protects joins and content submission; per-identity/IP limits protect interactions.
See `docs/features/discussion.md` for operations and limitations.

## Run it locally

Requirements: Node 24, pnpm 11, ffmpeg. For the data services either Docker or Homebrew.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env        # fill APP_SECRET and SUPERADMIN_PASSPHRASE
cp apps/web/.env.example apps/web/.env.local
```

Data services, pick one:

```bash
# Without Docker (what this project was built with)
sh scripts/dev/postgres.sh   # Postgres 16 on :55440   (brew install postgresql@16)
sh scripts/dev/s3.sh         # S3 on :59000            (brew install versitygw)
sh scripts/dev/media.sh      # MediaMTX: RTMP :51935, HLS :58888, API :59997

# Or with Docker
docker compose -f docker-compose.dev.yml up -d
```

Then:

```bash
pnpm --filter @zemi/shared build
pnpm --filter @zemi/api dev          # API on http://localhost:4400 (runs migrations on boot)
pnpm --filter @zemi/web dev          # web on http://localhost:3300
pnpm --filter @zemi/api seed:reset   # lots of demo data (events, speakers, papers, registrations, media)
```

Log in at http://localhost:3300/admin with `SUPERADMIN_PASSPHRASE` from `apps/api/.env`.
Without `RESEND_API_KEY`, emails are rendered to `apps/api/.mail-outbox/` instead of being sent.

## Checks

```bash
pnpm typecheck
pnpm --filter @zemi/api test      # unit tests (205)
pnpm --filter @zemi/shared test   # citation formatters
pnpm e2e:quick                    # e2e against the running local stack
pnpm e2e                          # includes @stream (real RTMP push) and @camera (fake webcam QR scan)
```

Run data-changing e2e checks against preview:
`E2E_WEB_URL=https://zemi-preview.up.railway.app E2E_API_URL=https://zemi-api-preview.up.railway.app E2E_RTMP_URL=rtmp://altaria.proxy.rlwy.net:11280/live E2E_SUPERADMIN_PASSPHRASE=... npx playwright test e2e/smoke.spec.ts e2e/stream.spec.ts --project=chromium`

## Running a Friday

1. **Plan:** Admin > Events > New event (defaults to the next free Friday, 13:15 to 15:15 WIB). Fill details,
   cover, speakers, rundown and papers, then Publish.
2. **Door crew:** create an admin with the Door crew preset scoped to that event. They open
   `/admin/scan/<eventId>` on a laptop or phone, tap Enable camera, and scan tickets. Manual check-in and
   walk-ins are in the Attendance tab. Print the attendance paper from Registrations.
3. **Stream:** in the event's Stream tab, copy the OBS settings (Custom service, Server
   `rtmp://yamabiko.proxy.rlwy.net:48089/live`, Stream key `<key>?key=<private key>`, x264 CBR 3500 to
   4500 kbps at 1080p30, keyframe interval 2 s). Start streaming in OBS: the dashboard shows the preview.
   Press **Go live** when ready and **End stream** when done. The recording is stitched automatically and
   appears on the event page with chapters from the rundown.
4. **After:** upload photos and videos in the Media tab. Thank-you emails go out automatically.

## Deploy (Railway)

Project `zemi`: services `web`, `api`, `media`, `Postgres`, and bucket `zemi-media` (Singapore).
Infrastructure for production is described in `.railway/railway.ts` (`railway config plan` shows drift).
Production is connected to `main`; preview is connected to the `preview` branch. A push to either
branch deploys its own `web`, `api`, and `media` services. To test a change against preview, merge or
cherry-pick it into `preview` before merging it into `main`.

- Production: https://zemi.ac, https://zemi-api.up.railway.app, and
  `rtmp://yamabiko.proxy.rlwy.net:48089/live`.
- Preview: https://zemi-preview.up.railway.app, https://zemi-api-preview.up.railway.app, and
  `rtmp://altaria.proxy.rlwy.net:11280/live`.
- Each environment has its own Postgres volume and Railway bucket. Production started with empty
  application tables and an empty bucket; preview retains the former demo content and uploads.

- The API applies migrations on boot. The web build bakes `API_INTERNAL_URL`, `NEXT_PUBLIC_*` and
  `SITE_INDEXING` in at build time (see `apps/web/Dockerfile`).
- `SITE_INDEXING=false` on `web` sends `noindex` everywhere. Keep it for preview; turn it on for
  production and redeploy `web` when real content is ready for search engines.
- Keep demo data in preview. The seed workflow is described in `docs/features/api-site-seed.md`.

## Email (Resend)

Production sends email through Resend from `Zemi <no-reply@zemi.ac>`. Its `api` service holds the
`RESEND_API_KEY` Railway variable, and `zemi.ac` is verified for sending in Resend. Preview uses the
local outbox unless a separate key is configured. Superadmins can inspect all 10 registered templates
and send a test email from Admin > System.
