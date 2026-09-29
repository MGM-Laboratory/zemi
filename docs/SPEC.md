# Zemi: build spec

This is the single source of truth for everyone building Zemi. Read it fully before writing code.
If something here conflicts with your instincts, this file wins. If something is missing, choose
the option that is most consistent with what's here and note it in `docs/DECISIONS.md`.

## 0. What Zemi is

Zemi is a weekly seminar run by MGM Laboratory (https://labmgm.org). Every **Friday, 13:15 to 15:15
(Asia/Jakarta, UTC+7, no DST)**, postgraduate students (Master's and PhD) share research progress.
It is also where undergrads get inspired and everyone networks. Sessions are **hybrid**: in a
classroom or a theater on campus (rooms vary) and livestreamed on the Zemi site.

The product has two halves:

1. **Public site**: an Awwwards-level, story-driven, playful, 3D and animation-heavy experience.
   Pages: `/` (home), `/about`, `/events`, `/events/[slug]`, `/speakers`, `/speakers/[slug]`,
   `/publications`, `/publications/[slug]`, `/discussion`, `/discussion/create`, `/discussion/[id]`, `/contact`, `/tickets/[token]`. `/home` redirects to `/`; `/q` redirects to `/discussion`.
   `/speaker/[slug]` redirects to `/speakers/[slug]`. `/live` redirects to the event that is live now
   (or `/events`).
2. **Admin dashboard** at `/admin`: passphrase login, RBAC, a full CMS for every public piece of
   content, registrations with analytics, QR attendance scanning, OBS livestream control,
   recordings and documentation media. Discussion moderation has its own workspace.

## 1. Repo layout and ownership

```
apps/web        Next.js 16 App Router. Public site + /admin dashboard. Port 3300 locally.
apps/api        NestJS 11 (Express, ESM, NodeNext). REST API, jobs, media, email, streaming. Port 4000.
apps/media      MediaMTX 1.21.1 Docker image (RTMP ingest, private HLS, recording segments).
packages/shared Zod schemas, TS types, RBAC catalog + resolver, time helpers, citations. ESM, built to dist.
docs/           SPEC.md (this), DECISIONS.md (append-only log of judgment calls), DESIGN.md (brand).
```

Rules for every contributor:

- **ESM everywhere.** In `apps/api` and `packages/shared`, relative imports MUST end in `.js`
  (NodeNext). Web uses the `@/` alias for `apps/web/src`.
- **Do not add dependencies** unless absolutely necessary. Everything planned is already installed.
  If you must, run `pnpm --filter <pkg> add <dep>` and mention it in DECISIONS.md.
- **Do not edit files owned by another workstream** (see the task you were given). Shared contract
  files (`packages/shared/**`, `apps/api/src/db/schema.ts`) may only get *additive* changes.
- Typecheck your area: `pnpm --filter @zemi/api typecheck`, `pnpm --filter @zemi/web typecheck`,
  `pnpm --filter @zemi/shared build`. Never run `next build` concurrently with others; prefer
  typecheck + targeted dev server checks.
- Never write em dashes (U+2014) or en dashes (U+2013) in user-facing copy. Use commas, periods,
  colons, "to", or line breaks. This applies to seed data and emails too.

## 2. Runtime topology

```
Browser ──HTTPS──> web (Next.js)
   │                 └─ rewrites /api/v1/*  ──private net──> api:4000   (JSON, cookies, SSE admin)
   │
   ├──HTTPS──> api public domain  /media/*          (images, video, pdf from bucket, Range, immutable)
   │                              /api/v1/public/live/:eventId/*  (HLS proxy, gated by stream state)
   │                              /api/v1/public/events/:id/live  (public SSE)
   │
OBS ──RTMP──> media (Railway TCP proxy -> :1935)
                 ├─ authHTTP  ──> api /api/v1/internal/media/auth      (publish needs ?key=<privateKey>)
                 ├─ runOnOnline/Offline ──> api /internal/media/online|offline
                 ├─ recording segments (fMP4, 60s) ──> api /internal/media/segments (multipart)
                 └─ HLS :8888 (private) <── api HLS proxy with `Authorization: Bearer MEDIA_INTERNAL_SECRET`
                                             (hlsCDNSecret mode: one shared cookieless session)

api ──> Postgres (Drizzle + pg-boss jobs)   api ──> S3 bucket (Railway Bucket / MinIO locally)
api ──> Resend (no-reply@labmgm.org)         api ──> web /api/revalidate (on content change)
```

- The admin session cookie lives on the **web origin** (set through the rewrite). Browser code
  calls `/api/v1/...` relative. Server components call `API_INTERNAL_URL` directly.
- Large uploads also go through the same-origin rewrite (bodies stream; `proxy.ts` must NOT match
  `/api/*`). Upload endpoints return quickly with `status: 'processing'`; processing runs in jobs.
- Public media/HLS/SSE use `NEXT_PUBLIC_API_PUBLIC_URL` (the API's public domain) directly.

### Environment variables

API (`apps/api/.env`):
```
NODE_ENV, PORT=4000, WEB_ORIGIN=http://localhost:3300
DATABASE_URL=postgres://zemi:zemi@localhost:55440/zemi
SUPERADMIN_PASSPHRASE=...            # required, >= 12 chars
APP_SECRET=...                       # 32+ chars; HMAC pepper, token signing, AES key derivation
PUBLIC_API_URL=http://localhost:4000 # absolute base for media/HLS URLs returned to clients
PUBLIC_WEB_URL=http://localhost:3300 # absolute base for links in emails / QR
S3_ENDPOINT=http://localhost:59000, S3_REGION=us-east-1, S3_BUCKET=zemi,
S3_ACCESS_KEY_ID=zemi, S3_SECRET_ACCESS_KEY=zemi-secret, S3_FORCE_PATH_STYLE=true, S3_AUTO_CREATE_BUCKET=true
RESEND_API_KEY=                      # empty => emails are rendered to apps/api/.mail-outbox/*.html and logged
MAIL_FROM="Zemi <no-reply@labmgm.org>", MAIL_REPLY_TO=
MEDIA_INTERNAL_SECRET=dev-media-secret
MEDIA_HLS_URL=http://localhost:58888, MEDIA_API_URL=http://localhost:59997
RTMP_PUBLIC_URL=rtmp://localhost:51935/live   # what admins paste into OBS "Server"
WEB_REVALIDATE_URL=http://localhost:3300/api/revalidate, REVALIDATE_SECRET=dev-revalidate
FFMPEG_PATH=ffmpeg, FFPROBE_PATH=ffprobe
```

Web (`apps/web/.env.local`):
```
API_INTERNAL_URL=http://localhost:4000           # server-side fetches + rewrites
NEXT_PUBLIC_API_PUBLIC_URL=http://localhost:4000 # media, HLS, public SSE
NEXT_PUBLIC_SITE_URL=http://localhost:3300
REVALIDATE_SECRET=dev-revalidate
```

## 3. Time

- Store every instant as `timestamptz` (UTC). The API returns ISO strings with `Z`.
- Render **always** in `Asia/Jakarta` via helpers in `@zemi/shared` (`formatJakarta`,
  `jakartaDateInput`, `fromJakartaInput`). Jakarta is fixed UTC+7, so `fromJakartaInput('2026-10-02', '13:15')`
  is `2026-10-02T06:15:00.000Z`.
- Default session: Friday 13:15 to 15:15. The "new event" form pre-fills the next Friday without an event.
- Event status is computed at request time by `computeEventStatus()` in shared:
  - `cancelled` if `cancelledAt` is set
  - `ongoing` if the stream state is `live`, or `startsAt <= now < endsAt`
  - `scheduled` if `now < startsAt`
  - `past` otherwise
  Clients re-compute locally with a ticking clock so status flips without reload; SSE pushes stream changes.

## 4. Data model (Postgres, Drizzle) — `apps/api/src/db/schema.ts`

The schema file is the authority. Summary:

| table | purpose |
|---|---|
| `admins` | normal admins. `passphraseLookup` (HMAC hex, unique) + `passphraseHash` (argon2id), `policy` jsonb (see RBAC), `expiresAt`, `disabledAt`, `lastLoginAt` |
| `sessions` | `tokenHash` (sha256 of cookie token), `principalType` ('superadmin'/'admin'), `adminId`, `expiresAt`, `lastSeenAt`, `ip`, `userAgent`, `revokedAt` |
| `audit_logs` | every mutation: actor, action (`event.update`), resourceType/Id, summary, meta, ip |
| `assets` | uploaded media. `kind` image/video/document/audio, `purpose`, `status` processing/ready/failed, `originalKey`, `variants` jsonb, `width/height/durationSec`, `lqip` (data URL), `color`, `crop`, `adjust`, `alt`, `caption`, `credit` |
| `venues` | reusable rooms: name, kind (classroom/theater/lab/hall/online/other), building, floor, capacity, address, mapsUrl, notes |
| `speakers` | slug, fullName, nickname, headline, bio (BlockNote json), avatarAssetId, links jsonb, defaultOrganization, defaultPosition, email (private), visibility |
| `events` | slug, number (Zemi #n), title, summary (short description), coverAssetId (4:5), description (BlockNote json), startsAt, endsAt, venueId, roomNote, mapsUrl, mode (hybrid/offline/online), accent (blue/yellow/red/green), tags, visibility (draft/published/unlisted), registrationOpen, capacity, registrationClosesAt, cancelledAt, cancelReason, publishedAt |
| `event_speakers` | eventId, speakerId, role (speaker/keynote/moderator/panelist), organization, position, talkTitle, sortOrder |
| `rundown_items` | eventId, time 'HH:mm', endTime, agenda, note, speakerId?, sortOrder |
| `publications` | slug, type, title, subtitle, abstract, body (BlockNote json), coverAssetId, pdfAssetId, containerTitle (journal/venue), volume, issue, pages, publisher, publishedYear/Month/Day, doi, isbn, issn, arxivId, url (publisher link), links jsonb, keywords, language, status, license, citationKey, visibility |
| `publication_authors` | publicationId, sortOrder, speakerId? OR manual {fullName, avatarAssetId, organization, url}, isCorresponding |
| `event_publications` | eventId, publicationId, note, sortOrder |
| `event_media` | documentation: eventId, assetId, caption, sortOrder, featured |
| `registrations` | eventId, fullName, email (lowercased), phone (E.164), attendanceMode (in-person/online), ticketCode (e.g. `ZM-7K3F9Q`), qrToken (128-bit base64url, unique), status (registered/cancelled), source (web/admin/walk-in/import), checkedInAt, checkedInBy, checkInMethod, notes, emailStatus |
| `checkins` | log of check-in/undo actions (registrationId, eventId, action, method, actorName, device) for realtime feed/history |
| `event_streams` | 1:1 with event: streamKey (path id, unique), privateKeyEnc (AES-GCM), state (idle/preview/live/ended), ingestOnline, ingestOnlineAt, liveStartedAt, liveEndedAt, currentSessionId, peakViewers |
| `stream_sessions` | one per Go-live: eventId, startedAt, endedAt, recordingStatus (recording/waiting/processing/ready/failed/none), recordingAssetId, visibility (public/hidden), isPrimary, title, peakViewers, error |
| `recording_segments` | uploaded raw fMP4 segments: streamKey, s3Key, startedAt (from filename, UTC), durationSec, sizeBytes |
| `email_logs` | to, template, subject, status (sent/failed/logged), providerId, error, eventId, registrationId |
| `site_settings` | key (general/home/about/contact/seo/email) -> jsonb value, validated by shared schemas |
| `faqs` | question, answer, sortOrder, visibility |
| `team_members` | organizers: name, role, avatarAssetId, links, bio, sortOrder, visibility |
| `contact_messages` | name, email, topic, message, status (new/read/replied/archived), ip |
| `slug_redirects` | resourceType, oldSlug -> resourceId (old slugs keep working with 308) |
| `discussion_identities` | name-only participant identity, numeric tag and hashed browser token |
| `discussion_threads` | event or general questions with BlockNote body, tags, state and counters |
| `discussion_comments` | threaded plain-text replies, moderation state and score |
| `discussion_votes` / `discussion_reactions` | one vote and one reaction of each kind per participant and target |
| `discussion_reports` | participant reports and moderator resolutions |

Slugs: lowercase kebab `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 1 to 96 chars, unique per type. Changing a slug
writes the old one to `slug_redirects`. Public GET by slug checks redirects and responds
`{ redirect: newSlug }` (HTTP 200); Next then calls `permanentRedirect`.

## 5. Auth

- Login is **passphrase only**: `POST /api/v1/auth/login { passphrase }`.
  1. Constant-time compare against `SUPERADMIN_PASSPHRASE` => superadmin principal.
  2. Else `lookup = HMAC-SHA256(APP_SECRET, normalize(passphrase))`; find admin by `passphraseLookup`;
     verify argon2id; reject if disabled or expired.
  3. Rate limit: 8 attempts / 10 min per IP, plus a small constant delay on failure.
- Session: random 32-byte token in httpOnly cookie `zemi_session` (SameSite=Lax, Secure in prod,
  path `/`), DB stores sha256. Idle timeout 12h, absolute 7d. Every request re-reads the session
  + admin row, so revocation, expiry, and policy edits take effect immediately.
- CSRF: all non-GET admin requests must send header `x-zemi-csrf: 1` (the shared client does this).
- Superadmin is a virtual principal `{ kind: 'superadmin', id: 'superadmin', name: 'Superadmin' }`.
- Passphrases for new admins can be typed or generated (`generatePassphrase()` returns 4 themed
  words + 2 digits, like `friday-coffee-hypothesis-42`). Shown once, then only hashed. Uniqueness is
  enforced (including vs superadmin passphrase).

## 6. RBAC (least privilege) — `packages/shared/src/rbac.ts`

Default deny. A normal admin's `policy`:

```ts
{
  capabilities: Capability[],      // global powers
  grants: Grant[]                  // scoped powers
}
type Grant = { type: 'event' | 'speaker' | 'publication'; id: string | '*'; actions: Action[] }
```

Capabilities: `events.create`, `speakers.create`, `publications.create`, `venues.manage`,
`site.edit`, `inbox.view`, `media.library`, `audience.view`, `audit.view`,
`discussion.view`, `discussion.manage`.

Event actions: `view`, `edit`, `publish`, `delete`, `registrations.view`, `registrations.manage`,
`registrations.export`, `attendance.scan`, `attendance.manage`, `stream.view`, `stream.control`,
`media.manage`, `emails.send`.
Speaker / publication actions: `view`, `edit`, `publish`, `delete`.

Implications (resolver expands them): every action implies `view`; `registrations.manage` implies
`registrations.view`; `stream.control` implies `stream.view`; `attendance.manage` implies
`attendance.scan`; `registrations.export` implies `registrations.view`.

`attendance.scan` alone lets door crew scan tickets and see *only the scanned person's name*,
not the list. `attendance.manage` shows the check-in list (names, masked email/phone) for manual
check-in and walk-ins. Full PII (email/phone) needs `registrations.view`.

Rules:
- Superadmin can do everything, and is the only one who can manage admins, sessions, system.
- An admin who creates an event/speaker/publication automatically gets a full grant for it
  (added to their policy on create).
- List endpoints return only resources the principal can `view`. Items include
  `permissions: Action[]` (the effective actions) so the UI can hide or disable controls.
- The UI hides nav entries, tabs, and buttons the principal cannot use. The server enforces
  everything regardless.
- `GET /auth/me` returns `{ principal, policy, session }`. The web uses `createAbility(me)` from
  shared: `ability.can('event', eventId, 'stream.control')`, `ability.has('events.create')`,
  `ability.canAny('event', 'registrations.view')`.
- Presets (UI templates): Viewer, Event editor, Door crew, Stream operator, Content manager, Full admin.

## 7. API conventions

- Base: `/api/v1`. JSON. Errors: `{ error: { code, message, details? } }` with HTTP status
  (400 validation with zod issues in details, 401, 403, 404, 409, 422, 429, 500).
- Validation with zod schemas from `@zemi/shared` via `ZodPipe` (no class-validator).
- Pagination: query `page` (1-based), `pageSize` (default 20, max 100). Response `Paginated<T>`
  `{ items, total, page, pageSize }`.
- Images are returned as `ImageRef` (absolute URLs, see shared `ImageRef`). Rich text fields
  are BlockNote block arrays (`Block[]` json); the public site renders them with its own renderer.
- Every admin mutation writes an audit log and calls `revalidate(tags)` on the web.
- Revalidation tags: `events`, `event:<id>`, `speakers`, `speaker:<id>`, `publications`,
  `publication:<id>`, `site`.

### Endpoint map

Auth: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.

Public (no auth):
```
GET  /public/site                                  site settings + faqs + team + stats
GET  /public/events?when=upcoming|past|live|all&search&tag&speaker&year&page&pageSize
GET  /public/events/next                           next upcoming (or live) event summary | null
GET  /public/events/:slug                          EventDetail | {redirect}
GET  /public/events/:id/live                       SSE: state, viewers, reactions
POST /public/events/:id/heartbeat {viewerId}       viewer counting
POST /public/events/:id/reactions {kind}           clap/heart/fire/lightbulb/laugh (rate limited)
GET  /public/events/:id/calendar.ics
POST /public/events/:id/registrations              RegisterInput -> RegisterResult
GET  /public/tickets/:token                        Ticket
POST /public/tickets/:token/cancel
GET  /public/tickets/:token/qr.png|qr.svg          branded QR image
GET  /public/tickets/:token/calendar.ics
GET  /public/live/:eventId/*                       HLS proxy (public when state=live; preview with ?pt=)
GET  /public/speakers?search&page                  GET /public/speakers/:slug
GET  /public/publications?search&type&year&tag&page   GET /public/publications/:slug
POST /public/contact                               ContactInput
GET  /media/*                                      bucket proxy (Range, immutable cache)
```

Admin (cookie + csrf; permission checks):
```
GET  /admin/overview
GET  /admin/events?when&search&page     POST /admin/events     GET|PATCH|DELETE /admin/events/:id
POST /admin/events/:id/publish {visibility}   POST /admin/events/:id/cancel {reason, notify}
POST /admin/events/:id/restore                POST /admin/events/:id/duplicate
PUT  /admin/events/:id/speakers   PUT /admin/events/:id/rundown   PUT /admin/events/:id/publications
GET|POST /admin/events/:id/media  PATCH|DELETE /admin/events/:id/media/:mediaId  PUT /admin/events/:id/media/order
GET  /admin/events/:id/registrations?search&status&checkedIn&mode&sort&page&pageSize
GET  /admin/events/:id/registrations/stats
POST /admin/events/:id/registrations            (manual / walk-in)
PATCH|DELETE /admin/registrations/:id           POST /admin/registrations/:id/resend
POST /admin/events/:id/registrations/bulk {ids, action}
GET  /admin/events/:id/registrations/export?format=csv|xlsx
GET  /admin/events/:id/attendance-sheet.pdf?sort=name|registered&blankRows=10&mode=all|in-person
POST /admin/events/:id/attendance/scan {payload, device}  -> ScanResult
POST /admin/registrations/:id/check-in    POST /admin/registrations/:id/undo-check-in
GET  /admin/events/:id/attendance          summary + recent feed + arrivals histogram
GET  /admin/events/:id/attendance/stream   SSE of check-ins
GET  /admin/events/:id/attendance/roster?search   (attendance.manage) masked list
POST /admin/events/:id/broadcast {subject, html, audience, testEmail?}   GET /admin/events/:id/emails
GET  /admin/events/:id/stream     POST /admin/events/:id/stream/rotate   POST .../stream/live   POST .../stream/end
GET  /admin/events/:id/stream/health    GET /admin/events/:id/stream/preview-token
GET  /admin/events/:id/recordings   PATCH|DELETE /admin/recordings/:id   POST /admin/recordings/:id/reprocess
POST /admin/events/:id/recordings {assetId}   (attach an uploaded external recording)
GET|POST /admin/speakers   GET|PATCH|DELETE /admin/speakers/:id   GET /admin/speakers/lookup?q
GET|POST /admin/publications   GET|PATCH|DELETE /admin/publications/:id   GET /admin/publications/lookup?q
POST /admin/publications/quick {title, url}    GET /admin/publications/doi?doi=  (Crossref prefill)
GET|POST /admin/venues   PATCH|DELETE /admin/venues/:id
POST /admin/assets (multipart: file, purpose, crop?, adjust?, alt?)  GET /admin/assets?purpose&search&page
GET|PATCH|DELETE /admin/assets/:id   POST /admin/assets/:id/recrop {crop, adjust}
GET  /admin/site/settings   PUT /admin/site/settings/:key
GET|POST /admin/site/faqs  PATCH|DELETE /admin/site/faqs/:id  PUT /admin/site/faqs/order  (same for /team)
GET  /admin/inbox?status&page   PATCH|DELETE /admin/inbox/:id
GET  /admin/audience?search&page              (audience.view) unique people across events
GET  /admin/audit?actor&resourceType&resourceId&page   (audit.view or superadmin)
GET|POST /admin/admins   GET|PATCH|DELETE /admin/admins/:id   POST /admin/admins/:id/passphrase
GET  /admin/admins/:id/sessions   DELETE /admin/sessions/:id   GET /admin/passphrase/generate
GET  /admin/system                 integrations + health (superadmin)
```

Internal (media server only, header `x-media-secret` or basic/bearer = MEDIA_INTERNAL_SECRET):
```
POST /internal/media/auth      MediaMTX authHTTP payload {user,password,token,ip,action,path,protocol,id,query}
POST /internal/media/online    {path, query, sourceType, sourceId}
POST /internal/media/offline
POST /internal/media/segments  multipart {path, duration, filename, file}
```

## 8. Media pipeline

- Images: store original at `assets/<id>/original.<ext>`; apply crop (`{x,y,width,height}` in
  original pixels), rotation, and adjustments (`brightness`, `contrast`, `saturation`, `hue`,
  `sharpen`) with sharp; output AVIF (q 55) and WebP (q 80) at widths
  `[320, 480, 640, 960, 1280, 1600, 1920, 2560]` (never upscale), plus `lqip` (24px webp data URL) and
  dominant `color`. Keys: `assets/<id>/w<width>.<fmt>`. EXIF stripped, sRGB, auto-orient.
- Video (documentation, external recordings): H.264 MP4 (CRF 23, max 1080p, faststart, AAC 128k) +
  WebM VP9 (CRF 34, max 1080p, Opus) + poster (webp, 1280) + `storyboard` sprite (thumbs every
  10s, 160x90, 10 columns) + duration. Recordings from livestream: remux copy to MP4 faststart
  (no re-encode), then poster + storyboard.
- PDF: stored as-is; page count optional.
- Uploads return `Asset` immediately (`status: processing`); the client polls `GET /admin/assets/:id`.
- `/media/*` streams from the bucket with `Accept-Ranges`, `Content-Range`, `ETag`,
  `Cache-Control: public, max-age=31536000, immutable`.

## 9. Streaming

- Each event has an `event_streams` row created lazily on first `GET /admin/events/:id/stream`:
  `streamKey = 'zm' + 16 random base62`, private key 32 random base62 (AES-GCM encrypted at rest).
- OBS settings shown to admins: Server `RTMP_PUBLIC_URL` (e.g. `rtmp://host:port/live`), Stream key
  `<streamKey>?key=<privateKey>` (single field for OBS), plus the two parts separately.
- MediaMTX path is `live/<streamKey>`. Auth: `publish` allowed iff the key matches and the event is
  not cancelled; `read` allowed only for protocol `hls`/`rtsp` with the internal secret; everything else denied.
- States: `idle` (no signal) -> `preview` (OBS connected, only admins see it) -> `live` (public)
  -> `ended`. Admin presses **Go live** (requires ingest online) and **End stream**. Going live creates a
  `stream_sessions` row. If OBS drops while live, state stays `live` but `ingestOnline=false`;
  viewers see a "signal lost, hang tight" slate. Admin can go live again after ending (new session).
- Recording: MediaMTX records every publish into 60s fMP4 segments and uploads them. On **End**,
  a job waits until segments cover `endedAt` (or ingest is offline, max 3 min), concatenates the
  overlapping segments, trims to `[startedAt, endedAt]`, remuxes to MP4 faststart, uploads as an asset
  (`purpose: recording`), generates poster + storyboard, sets `recordingStatus: ready`, deletes raw segments.
- Public HLS: `/api/v1/public/live/:eventId/index.m3u8` proxies to MediaMTX with the CDN bearer;
  playlists cached 1s, segments cached 60s in memory (LRU ~200MB). Allowed when state is `live`,
  or with a valid `?pt=` preview token (admin, 10 min, HMAC) in `preview`. The proxy rewrites nothing:
  MediaMTX playlist URIs are relative, so they resolve under the same prefix. Append `pt` to child URIs
  when present.
- Viewers: `POST /heartbeat` every 15s; count distinct viewerIds seen in the last 40s. Pushed over SSE.

## 10. Email (Resend, from `Zemi <no-reply@labmgm.org>`)

Templates (React Email, `apps/api/src/mail/templates`), all using the brand (see DESIGN.md):
registration confirmation (QR inline via CID + hosted fallback link, ticket link, calendar .ics
attachment, venue + maps, online link), reminder (day before, 09:00 WIB), starting now (at start, with
live link), thank you + recording available, event update broadcast, event cancelled, registration
cancelled, contact auto-reply, contact notification to organizers. Without `RESEND_API_KEY`, write
the rendered HTML to `apps/api/.mail-outbox/` and log to console with status `logged`.

## 11. Public-site API shapes (summary; exact zod in shared)

`EventCard`: id, slug, number, title, summary, cover ImageRef, startsAt, endsAt, status, isLive,
venue {name, kind}, mode, accent, tags, speakers [{slug, fullName, nickname, avatar, organization}],
registrationCount (if public), capacity.

`EventDetail`: EventCard + description blocks, roomNote, mapsUrl, venue full, rundown[],
speakers[] with role/talkTitle/position/org, publications[] (PublicationCard), media[] (documentation),
recordings[] (primary first; video sources, poster, storyboard, duration, chapters from rundown),
stream {state, ingestOnline, hlsUrl (when live)}, registration {open, closesAt, spotsLeft, reason}.

## 12. Definition of done

- Every page works on 360px phones, tablets, laptops, and 2560px screens; portrait and landscape.
- Keyboard focus visible, `prefers-reduced-motion` respected (3D becomes static art, motion reduced).
- Lighthouse-friendly: 3D and heavy libs lazy-loaded, images use `<picture>` with AVIF/WebP srcset + LQIP.
- Typecheck passes for all packages. No console errors on any page.
