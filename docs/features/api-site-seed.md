# api-site-seed: site CMS, inbox, content reset, demo data seeder

Owner: api-site-seed. Code: `apps/api/src/modules/site/**` (module, services, contact email templates),
`apps/api/src/seed/**` (seeder + fixtures), `packages/shared/src/site-defaults.ts` and the
"site CMS additions" block at the end of `packages/shared/src/schemas/site.ts` (additive).
No `schema.ts` change, no migration.

Fixtures live in `apps/api/src/seed/data/*.ts` rather than `apps/api/seed/data`, so tsc compiles
and type-checks them with the seeder. Media comes from `apps/api/seed/assets` (see `docs/foundation/assets.md`).

## Endpoints (all under `/api/v1`)

### Site settings, FAQ, team (`site.edit`, superadmin always)

| route | returns | notes |
|---|---|---|
| `GET /admin/site/settings` | `SiteSettings` (all six sections) | each stored section merged over `SITE_DEFAULTS` |
| `GET /admin/site/settings/:key` | one section | keys `general`, `seo`, `home`, `about`, `contact`, `email`. Unknown key: 404 |
| `PUT /admin/site/settings/:key` | the saved section | body = the whole section or only changed fields (merged over the current value, arrays replace). Zod-validated with `SITE_SETTING_SCHEMAS[key]` (400 with issues). Id references are checked: `seo.ogImageAssetId` must be an image, `home.featuredEventId` an event, `general.defaultVenueId` a venue. Audited `site.update` with the changed fields, revalidates `site` |
| `GET /admin/site/faqs` | `Faq[]` | drafts included, by `sortOrder` |
| `POST /admin/site/faqs` | `Faq` (201) | `faqInput`, appended at the end |
| `PATCH /admin/site/faqs/:id` | `Faq` | `faqUpdateInput` (partial) |
| `DELETE /admin/site/faqs/:id` | `{ ok }` | 404 when gone |
| `PUT /admin/site/faqs/order` | `Faq[]` | `{ ids }` in the new order. Duplicates or unknown ids: 400. Rows left out keep their relative order after the listed ones, so a stale list can't lose anything |
| `GET\|POST /admin/site/team`, `PATCH\|DELETE /admin/site/team/:id`, `PUT /admin/site/team/order` | `TeamMember` / `TeamMember[]` | same rules. `avatarAssetId` must be an image asset (400 on the field otherwise). `avatar` is an `ImageRef` |

Every FAQ and team change is audited (`faq.*`, `team.*`), drops the public cache and revalidates `site`.

**Merge rules** (`site-settings.ts#mergeSetting`): a stored section is shallow-merged over the rich defaults, then
parsed. A stored field that no longer passes the schema falls back to its default instead of breaking the page.
Fields added to a schema later get their default automatically. Clearing an array (for example the home beats)
stays cleared.

### Public

| route | notes |
|---|---|
| `GET /public/site` | `PublicSite`: settings without the `email` section and without `contact.notifyEmails`, published FAQ and team, `stats`, `ogImage` (`ImageRef` of `seo.ogImageAssetId` or null). Built at most once at a time and cached in memory for 30s; every site mutation and the reset clear it (a build that was already running when something changed is thrown away, so a save shows up on the next request) |
| `POST /public/contact` | `ContactInput`. Always `200 { ok: true }`. Honeypot `website` filled: same answer, nothing stored or sent. Rate limits: 5 per 15 min per IP (`contact:<ip>`), 3 per hour per address (`contact-email:<email>`), 429 with `Retry-After`. Stores the message (`status: new`, ip, user agent), audits `contact.create`, then sends the emails in the background |

`stats` (`SiteService.stats()`), all about **published, non-cancelled events that have ended**:
`sessions` count, `talks` = `event_speakers` rows on them except `role = moderator`, `speakers` = distinct
speakers of those rows, `seatsFilled` = registered + checked-in registrations on them, `publications` = published
publications, `hoursOfTalk` = sum of event durations rounded, `firstEventAt` = earliest start.

Contact emails (templates in `modules/site/templates`, previews registered with `MailService`):

- `contact-notification` to `contact.notifyEmails`. If that list is empty, it goes to `contact.email`. `Reply-To` is the
  sender, so answering is one click. It shows name, email, topic, time (WIB), how many times they wrote before, the message
  and an "Open the inbox" button.
- `contact-auto-reply` to the sender: a warm "Got it, <first name>" with a line per topic, office hours, the next
  published event (date, `13:15 to 15:15 WIB`, where: room + livestream, room only, or online only) and the email
  signature. `Reply-To` is `email.replyTo` or `contact.email`. It never echoes the message: the address is unverified,
  so an echo would let anyone mail their own text and links to a stranger from our domain. The greeting uses the first
  name only when it looks like a name (letters, apostrophes, hyphens, up to 40 characters), otherwise "Got it, there".
- Previews: `GET /admin/system/email-preview/contact-notification` and `.../contact-auto-reply` (superadmin).

### Inbox (`inbox.view`)

| route | notes |
|---|---|
| `GET /admin/inbox?status=new\|read\|replied\|archived\|open\|all&search&topic&page&pageSize` | `Paginated<ContactMessage>`, newest first. `open` = everything except archived. `search` matches name, email, message |
| `GET /admin/inbox/unread-count` | `{ count }` of `status = new` |
| `GET /admin/inbox/:id` | `ContactMessage` |
| `PATCH /admin/inbox/:id { status }` | audited `inbox.update` (from/to) |
| `DELETE /admin/inbox/:id` | audited `inbox.delete` |

### Content reset (superadmin)

`POST /admin/system/reset-content { confirm: "delete everything" }` returns `ResetContentResult`
`{ ok, deleted: { table: rows }, bucketObjects, adminsPruned }`. Wrong phrase: 400.

One transaction deletes: checkins, email_logs, registrations, event_media, stream_sessions, event_streams,
recording_segments, event_publications, event_speakers, rundown_items, publication_authors, events,
publications, speakers, slug_redirects, venues, faqs, team_members, contact_messages, assets. It also:

- drops per-item grants from every admin policy (wildcard grants and capabilities stay),
- nulls setting fields that pointed at deleted rows (`general.defaultVenueId`, `home.featuredEventId`,
  `seo.ogImageAssetId`),
- switches off an announcement that linked to an event page.

After the commit it empties `assets/`, `segments/` and `recordings/raw/` (MediaMTX's raw segments) in the bucket. Admins, sessions, the audit log and site settings
stay. Audited `system.reset-content`. Revalidates `site`, `events`, `speakers`, `publications`.

## Seeder

```bash
pnpm --filter @zemi/api seed          # refuses (exit 1) when events exist
pnpm --filter @zemi/api seed:reset    # content reset first (same service as the endpoint), then seed
```

The script compiles `src` with tsc into `apps/api/.tmp/seed-build`, because tsx has no decorator metadata. Then it
boots `NestFactory.createApplicationContext(AppModule)` with `JOBS_ENABLED=false`, so no workers run in the seeder.
It runs migrations and does the following:

1. **Preflight, before anything is deleted.** Checks that every manifest file exists and that the bucket accepts a
   write (a probe object). It also checks that the temp folder has room for the looped recording. On failure:
   "Seeder preflight failed, nothing was changed", exit 1. A later upload failure (a disk filling up mid-run shows up as
   ENOSPC upload errors) doesn't stop the run: that file is skipped, listed, and the exit code is 2.
2. Optional reset (`ContentResetService`).
3. **Media through the real pipeline.** `AssetsService.ingestFile` stores each original and queues the normal job.
   The seeder cancels that job and runs `AssetsService.process()` itself with concurrency `SEED_CONCURRENCY`
   (default 4). Videos go first. Rows are inserted while the media processes, and at the end it waits until every asset
   is `ready`. If a running API grabbed a job first, the seeder polls it; after 15 min it processes the asset itself.
   Uploads: 40 speaker portraits, 7 author and 6 team portraits, 30 event covers (4:5), the pub covers in use,
   24 documentation photos, 6 PDFs, 4 documentation clips (transcoded to MP4 + WebM) and **one** recording.
   The recording is the 4 minute clip looped 31 times into a 124 minute MP4 (`concatCopy`, `videoMode: 'as-is'`),
   so the rundown chapters land inside the video.
4. Rows with Drizzle, in bulk. Randomness is fixed (`SEED_RANDOM`, forked per section), so a re-run makes the same
   content (ids, ticket codes and QR tokens change).

What it creates (run of 2026-09-26 03:45 WIB, `now` = then):

| what | details |
|---|---|
| venues | 9: Classroom 3.12, 3.14, 4.01, 4.07, MGM Lab, Theater A, Theater B (Auditorium), Seminar Room 2, Online only. Capacities, building/floor, room notes, Google Maps links around Kampus Depok |
| speakers | 40, Indonesian and international, nicknames, headlines, orgs (UI, ITB, UGM, ITS, BRIN, Telkom University, NUS, Kyoto, TU Delft, KAIST, TUM, HUST, industry labs), casual BlockNote bios (3 to 5 paragraphs with bold text, a bullet list, their Zemi talk history), 2 to 5 links |
| events | every Friday 13:15 to 15:15 WIB from 6 Sep 2024 to 8 Fridays after today, minus holiday Fridays: 105 (Zemi #1 to #105). 1 to 3 speakers each with per-event org/position/talk title, summary, rich description (headings, paragraphs, bullets, quote), cover, venue rotation (big Fridays in Theater B, small ones in the lab), tags, standard rundown. #20 is cancelled with a reason. Upcoming: #102 unlisted, #104 and #105 drafts |
| event_publications | 0 to 3 related papers per event (by the speakers, within a year) |
| registrations | 25 to 140 per past event, 55% to 90% of active registrations checked in (13:00 to 13:50 WIB, walk-ins included). Nobody on the livestream gets checked in, and online-only Fridays have no check-ins. About 15% online on hybrid Fridays. A pool of 300 regulars makes returning attendees meaningful. Sign-ups spread over the 10 days before each event, capped by room capacity (a packed room usually ends a few seats short, only about 1 in 3 of those sells out exactly). Upcoming published events get 5 to 60, and always keep a few seats free. Walk-ins, cancellations, admin/import sources, failed emails, a check-in log with devices |
| documentation | 3 to 8 photos with captions on the 20 most recent sessions, a short clip on 5 of them |
| streams | the 8 most recent recorded sessions: `ended` + a ready public primary recording (the shared asset). Every upcoming event: `idle` with its own stream key |
| publications | 60 across all types, years 2019 to 2026, abstracts 150 to 250 words (one in Bahasa Indonesia), containers, volume/issue/pages, DOIs `10.5555/zemi.YYYY.NNN`, arXiv ids, ISBN/ISSN, keywords, 1 to 6 authors mixing speakers and manual authors (with portraits), 20 with PDFs, 25 with covers, code/slides/dataset links, a few drafts |
| site | all six settings sections from `SITE_DEFAULTS`, plus a default venue, an announcement for next Friday (worded for the room kind), a featured upcoming event, contact details, socials and `notifyEmails`. 10 FAQs, 6 team members with portraits, 15 contact messages (new/read/replied/archived) |
| admins | 6 demo admins (below). Found again by the note tag `[demo admin, created by the seeder]` and updated in place, so grants follow the new event ids |
| audit | about 16 believable entries tagged `meta.seed = true` (replaced on every run) |
| discussion | 70 fictional identities, around 175 event and general questions, hundreds of replies, votes, reactions, accepted answers, and a few open moderation reports. Identity tokens are discarded and cannot be used to sign in |

At the end it prints counts, public stats and the demo passphrases, warns about any seeded row dated after `now` (rows
that real services or teammates write during the run don't count), and posts one revalidate to the web. A full run takes
about 2 minutes on this machine, mostly media.

### Demo admins (development passphrases)

| name | passphrase | access |
|---|---|---|
| Gilang (door crew) | `zemi-door-crew-dev` | door-crew bundle on next Friday's event, expires that Friday 18:00 WIB |
| Sekar (stream operator) | `zemi-stream-operator-dev` | stream control on the next 3 non-draft events |
| Nabila (content manager) | `zemi-content-manager-dev` | content-manager preset (speakers, publications, site pages, media library) |
| Rendy (program chair) | `zemi-program-chair-dev` | creates events, edits + publishes the 8 upcoming ones, sees all events |
| Pak Hartono (viewer) | `zemi-viewer-dev` | viewer preset, read-only, no personal data |
| Tika (door crew, last semester) | `zemi-old-door-crew-dev` | expired 30 Jun 2026, login gives 403 `admin_expired` |
| Superadmin | `SUPERADMIN_PASSPHRASE` | everything |

In production each run generates fresh passphrases and prints them once.

### Env knobs

| var | default | meaning |
|---|---|---|
| `SEED_RANDOM` | `20240906` | PRNG seed |
| `SEED_NOW` | real now | ISO instant treated as "now" (past vs upcoming, timestamps) |
| `SEED_RECORDING_LOOPS` | `31` | 1 = the raw 4 minute clip (fast, small, chapters past 4 min point beyond the video) |
| `SEED_CONCURRENCY` | `4` | media processing in parallel (1 to 8) |
| `SEED_SAFE_EMAILS` | on in production | every seeded address gets a `.example` suffix, so no real inbox ever hears from demo data |
| `SEED_LIFECYCLE_SENT` | on in production | marks reminder / starting-now / thank-you as already sent on upcoming events too |
| `SEED_ENV_FILE` | `apps/api/.env` | another env file, or `none`. Never read in production |
| `SEED_SKIP_MEDIA` | off | rows only, no uploads, done in seconds (for checking the data logic against a scratch database). Combined with `--reset` it still empties the bucket's `assets/` |
| `SEED_ASSETS_DIR` | `apps/api/seed/assets` | absolute path to the seed asset directory, useful when running the compiled seeder in a Railway API container |
| `SEED_CONFIRM_PRODUCTION=yes` | | same as `--production` |

### Production

The API image does not ship `seed/assets`, so seed from a checkout with the production env (no `.env` is read
when `NODE_ENV=production`):

```bash
# Export the API's production env first (every variable in apps/api/.env.example), for example:
export NODE_ENV=production DATABASE_URL=... S3_ENDPOINT=... S3_BUCKET=... S3_FORCE_PATH_STYLE=false \
  S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... SUPERADMIN_PASSPHRASE=... APP_SECRET=...
pnpm --filter @zemi/api seed:reset -- --production
```

- Without `--production` it stops before touching anything (verified). With it, the flag reaches the seeder
  through both pnpm scripts (verified against a missing database: it got past the gate to the migrations).
- The same `APP_SECRET` as the API is required (stream keys are AES-GCM bound to it, passphrases HMAC'd with it).
- Storage and DB go through the API's own `StorageService` / Drizzle config, so virtual-host S3 and Postgres 18
  need nothing special.
- With safe emails, `contact.notifyEmails` becomes `zemi@labmgm.org.example`: set the real addresses in
  Site settings, Contact afterwards.
- Before going live: `POST /admin/system/reset-content`, then delete the demo admins (the reset keeps admins).

## Live dev DB right now

The shared dev DB holds the seed from 2026-09-26 03:45 WIB (`seed:reset`, exit 0, 117s, 134 assets all `ready`).
It replaced the 00:48 run, so every id from before 03:45 is gone. The reset also removed a teammate's
"Stream engine test" event with its recording, and an extra speaker. Rows teammates added after 03:45 stay (for example
a Playwright check event, #106).

One difference from what the current seeder makes: in that run, 45 of the 97 past events have exactly as many
registrations as the room holds. The seeder now leaves most packed rooms a few seats short. On a scratch database
(rows only), 18 of 97 were exactly full. The next `seed:reset` picks this up. I didn't re-seed again, so the ids
teammates are using now stay valid.

Review fix (04:40 WIB): the fixture had publication years 2022 to 2026, the task asks for 2019 to 2026. Three papers
moved (`consensus-queues` to 2019, `rice-drones` to 2020, `pengantar-ml` to 2021). The live rows were updated in place
(year, DOI, DOI url, dates, JIKI volume), plus `block-coding`, whose DOI becomes `10.5555/zemi.2023.003` as the seeder
now numbers it. Ids did not change, and those four rows now match what the fixture produces (a fresh seed can still link papers to events a little differently, since the link picks depend on the candidate lists).

## Decisions

- Talks in `stats` skip moderators: a moderator row is not a talk. The seed has none, so today it matches
  "event_speakers rows".
- One recording asset shared by all 8 seeded sessions, as the task allowed. The schema has no unique constraint.
  Eight copies would cost about 2 GB of bucket space.
- `seo.ogImageAssetId` stays empty after seeding, so the web falls back to `/brand/og-default.png`. A PNG is the safest
  format for link previews; the asset pipeline only makes AVIF/WebP.
- Settings merge is shallow and tolerant (see above). Rich defaults live in shared (`SITE_DEFAULTS`) so the web can
  use them as its "API is down" fallback.
- The contact form always answers `{ ok: true }` (honeypot included). Emails go out after the response.
- The reset deletes rows in one transaction and bucket files after commit. A failed bucket delete can leave orphan
  files, but never rows without files.

## Known gaps

- ~~Shared recording caveat~~: fixed in the stream module (`releaseAsset`). Deleting or re-stitching a recording deletes its
  asset only when it is purpose `recording`, no other session points at it and no gallery item holds it. Re-verified
  2026-09-26: the shared asset attached to a throwaway event and that recording deleted left the asset and all 8 seeded
  sessions intact. Covers, documentation photos and clips are shared too, but only a media library delete
  (`DELETE /admin/assets/:id`) removes an asset, and removing it everywhere is what that action means.
- Re-running the seeder changes every id (events, speakers, assets). Anyone holding ids from an earlier run must
  re-fetch.
- Preflight only catches a bucket that already refuses writes. If uploads start failing mid-run (a disk
  filling up), the seeder keeps going: the rows go in without those files (no cover, no avatar, no recording), it
  lists the failures and exits 2. Run `seed:reset` again once there is room. A full run needs about 0.6 GB in the
  bucket plus about 0.3 GB of temp space for the looped recording.
- The future-row check skips rows dated between `SEED_NOW` and the real clock, so it can miss a bad row when
  `SEED_NOW` is set in the past.
- `hoursOfTalk` counts scheduled time (13:15 to 15:15), not recording length.
- Contact rate limits are in memory (one API instance), like the login limiter.

## What is verified (local, 2026-09-26)

Against the shared API (port 4400), native Postgres 16 and the versitygw S3 (`scripts/dev/s3.sh`):

- `seed:reset` at 03:45 WIB over the 00:48 data: the reset removed 11,401 rows and 1,297 files, then 134 files
  were uploaded and processed (all `ready`, 0 failed, 112s of processing, 117s total, concurrency 4). Rows: 9 venues,
  40 speakers, 105 events, 196 event speakers, 616 rundown items, 60 publications, 153 authors, 113 event-publication
  links, 109 documentation items, 16 streams, 8 recordings, 5,494 registrations (2,585 distinct people, 253 came more
  than once), 3,441 check-ins, 10 FAQs, 6 team members, 15 messages, 6 demo admins. Every asset's original and
  variant keys exist as files in the bucket.
- Checked on that data in psql: 0 events over capacity, check-in share of active registrations 55% to 89%
  (average 71% to 77% by room kind), 15.1% online across hybrid Fridays (5% to 29% on a single Friday), check-ins 13:00 to 13:50 WIB, no online
  check-ins, 25 to 140 registrations per past event, upcoming 5 to 60, abstracts 150 to 165 words, #20 cancelled with
  its reason, 97 past and 8 upcoming.
- `GET /public/site`: `settings` without `email` and without `notifyEmails`, 10 FAQs, 6 team members with avatar
  `ImageRef`s, stats (96 sessions, 180 talks, 40 speakers, 3,441 seats filled, 58 publications, 192 hours, first
  event 6 Sep 2024). `GET /public/events?when=past` (96), the Zemi #97 detail: primary recording with MP4, poster,
  storyboard (745 tiles), 7440s, chapters from the rundown. `/media` cover variant `w640.avif` 200 `image/avif`. The
  recording answers `Range` with 206 (`bytes=1000-1999` and a suffix range) and immutable caching on versitygw, and
  ffprobe over HTTP reads 7440s.
- After the reseed: all six demo passphrases log in (the expired one 403), `GET /admin/inbox/unread-count` = 5,
  `GET /admin/site/settings` has all six sections and the 7 home beats (13:15 to 15:15).
- The packed-room change (rows only, `SEED_SKIP_MEDIA=1`, scratch database, since dropped): 18 of 97 past events
  exactly full instead of 45, 0 over capacity, check-in share still 55% to 88%.
- Seeder guards: `seed` with events present exits 1 with the hint. `NODE_ENV=production` without `--production`
  exits 1 before migrations. Earlier, with MinIO refusing writes (disk full), `seed:reset` stopped at preflight and
  the database was untouched (114 events before and after).
- Earlier, the same rules rows only (`SEED_SKIP_MEDIA=1`, scratch database): 0 events over
  capacity, upcoming events 5 to 58 with seats left, check-in share 55% to 89% (average 72%) on in-person
  Fridays, 15.1% online on hybrid Fridays, check-ins 13:00 to 13:50 WIB, no online check-ins, 25 to 140 registrations
  per past event, no row dated after now, every abstract 150 to 250 words, announcement
  "Zemi #98 is Friday, 2 Oct in Theater A. Bigger room, same coffee."
- Every demo passphrase logs in with the printed scope (door crew: one event grant; stream operator: three; program
  chair: 8 upcoming + wildcard view). The expired one gets 403 `admin_expired`. None of them can call
  reset-content (403). Of the demo admins, only the content manager can open site settings.
- Settings: GET merges defaults (7 beats, 4 pillars). A partial PUT keeps the other fields and shows up on
  `/public/site` right away (cache cleared). Invalid email 400 on the field, unknown event id 400, unknown key 404,
  array body 400, audit summary "Updated the home page settings (funStat)".
- FAQ and team: create, order (unknown id 400, duplicate 400), patch, delete, 404 on a second delete, draft FAQs
  hidden publicly, unknown avatar id 400 on the field.
- Contact: honeypot 200 and nothing stored, validation messages, stored + both emails rendered to the outbox
  (auto-reply shows the next event with "13:15 to 15:15 WIB" and the right "Where"), sixth message from one IP 429.
  Inbox list/search/get/patch/delete, bad status 400, unread count, 401 without a session. Reset with the wrong
  phrase 400.
- Email previews `contact-auto-reply` and `contact-notification` screenshotted at 390 and 1200 px, both look right.
- `pnpm --filter @zemi/api typecheck`, eslint on `modules/site` + `seed`, and 17 new specs
  (`site-settings.spec.ts`, `seed/plan.spec.ts`) pass.

## Integration fixes (2026-09-26, fix-api)

- **Seeder citation keys.** Right after `seedPublications` the seeder runs `backfillCitationKeys` (publications module), so a
  fresh seed has keys like `wicaksono2024robots`. The API also runs it on boot, which filled the 60 existing rows.
- **Safe links in the site CMS.** Input: contact `socials` and team `links` (`linkSchema`) take only http(s), mailto and tel;
  `general.announcement.href` takes those or a site path like `/events/zemi-98` (never `//host` or `/\host`); `general.labUrl`
  is http(s) (empty allowed). Output: `mergeSetting` cleans stored links item by item before parsing, so one bad social is dropped
  instead of resetting all socials to the defaults, an unsafe announcement link becomes `null` while the banner text stays, an
  unsafe contact `mapsUrl` becomes `null`, and a bad `labUrl` falls back to the default. Team member `links` go through
  `sanitizeLinkList`. `PUT /admin/site/settings/:key` strips NUL bytes like ZodPipe.
- **Site editors and media.** `site.edit` holders may now edit, re-crop, delete and fetch the original of assets with purpose
  `site` or `team-avatar` (anyone's), on top of the uploader / `media.library` / superadmin rule. Every admin `Asset` response
  carries `canEdit` for the caller. Verified with a throwaway `site.edit` admin: `canEdit` true on a team photo and false on a
  speaker portrait, `/original` 200 vs 403, PATCH 200 vs 403, re-crop and delete of a `site` upload by the superadmin 200.
